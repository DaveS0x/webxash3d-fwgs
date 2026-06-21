import { Net, Packet, Xash3D, Xash3DOptions } from 'xash3d-fwgs'

export type RuntimeBootEvent = {
    atMs: number
    phase: 'engine' | 'signaling' | 'ice' | 'peer' | 'candidate' | 'channel' | 'retry' | 'transport'
    state: string
    generation?: number
    detail?: Record<string, unknown>
}

export type RuntimeBootDebug = {
    startedAt: string
    events: RuntimeBootEvent[]
    transport: {
        generation: number
        ready: boolean
        terminalFailure?: string
        openedChannels: string[]
    }
}

declare global {
    interface Window {
        __CS_RUNTIME_BOOT_DEBUG?: RuntimeBootDebug
    }
}

type TransportOptions = {
    connectTimeoutMs?: number
    retryDelayMs?: number
}

const DEFAULT_CONNECT_TIMEOUT_MS = 25_000
const DEFAULT_RETRY_DELAY_MS = 500
const BOOT_EVENT_LIMIT = 240

function bootDebug(): RuntimeBootDebug {
    return (window.__CS_RUNTIME_BOOT_DEBUG ??= {
        startedAt: new Date().toISOString(),
        events: [],
        transport: {
            generation: 0,
            ready: false,
            openedChannels: [],
        },
    })
}

function recordBootEvent(
    phase: RuntimeBootEvent['phase'],
    state: string,
    generation?: number,
    detail?: Record<string, unknown>,
) {
    const debug = bootDebug()
    debug.events.push({
        atMs: Math.round(performance.now()),
        phase,
        state,
        generation,
        detail,
    })
    if (debug.events.length > BOOT_EVENT_LIMIT) {
        debug.events.splice(0, debug.events.length - BOOT_EVENT_LIMIT)
    }
    if (generation != null) debug.transport.generation = generation
}

export class Xash3DWebRTC extends Xash3D {
    private channel?: RTCDataChannel
    private ws?: WebSocket
    private peer?: RTCPeerConnection
    private candidates: RTCIceCandidateInit[] = []
    private stream?: MediaStream
    private audioElement?: HTMLAudioElement
    private dataChannels = new Set<RTCDataChannel>()
    private openedChannelLabels = new Set<string>()
    private generation = 0
    private retryTimer?: ReturnType<typeof setTimeout>
    private deadlineTimer?: ReturnType<typeof setTimeout>
    private warningTimer?: ReturnType<typeof setTimeout>
    private disconnectedTimer?: ReturnType<typeof setTimeout>
    private connectionPromise?: Promise<void>
    private resolveConnection?: () => void
    private rejectConnection?: (error: Error) => void
    private transportReady = false
    private terminalFailure = false
    private readonly connectTimeoutMs: number
    private readonly retryDelayMs: number

    constructor(opts?: Xash3DOptions, transportOptions: TransportOptions = {}) {
        super(opts)
        this.net = new Net(this)
        this.connectTimeoutMs = transportOptions.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS
        this.retryDelayMs = transportOptions.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS
    }

    // Engine initialization is deliberately independent from WebRTC. The caller
    // must start both promises and decide when engine commands may be issued.
    async init() {
        recordBootEvent('engine', 'initializing')
        await super.init()
        recordBootEvent('engine', 'initialized')
    }

    connect(): Promise<void> {
        if (this.connectionPromise) return this.connectionPromise

        recordBootEvent('transport', 'connecting')
        this.connectionPromise = new Promise<void>((resolve, reject) => {
            this.resolveConnection = resolve
            this.rejectConnection = reject
        })
        this.deadlineTimer = setTimeout(() => {
            this.failTransport(
                new Error(`WebRTC transport did not become ready within ${this.connectTimeoutMs}ms`),
            )
        }, this.connectTimeoutMs)

        void this.prepareTransport()
        return this.connectionPromise
    }

    private async prepareTransport() {
        this.stream = await this.getUserMedia()
        if (this.terminalFailure) return
        this.startTransportAttempt('initial')
    }

    private async getUserMedia() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
            recordBootEvent('transport', 'microphone-ready')
            return stream
        } catch (error) {
            recordBootEvent('transport', 'microphone-unavailable', undefined, {
                error: error instanceof Error ? error.message : String(error),
            })
            return undefined
        }
    }

    private startTransportAttempt(reason: string) {
        if (this.terminalFailure) return

        const generation = ++this.generation
        this.closeAttemptResources()
        this.candidates = []
        this.openedChannelLabels.clear()
        this.updateTransportSnapshot()
        recordBootEvent('retry', reason, generation)

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
        const url = `${protocol}//${window.location.host}/websocket`
        const ws = new WebSocket(url)
        this.ws = ws
        recordBootEvent('signaling', 'socket-created', generation, { url })

        ws.onopen = () => {
            if (!this.isCurrent(generation, ws)) return
            recordBootEvent('signaling', 'open', generation)
            this.startPeerConnection(generation)
        }
        ws.addEventListener('message', (event) => {
            if (!this.isCurrent(generation, ws)) return
            void this.handleSignalingMessage(generation, event)
        })
        ws.onerror = () => {
            if (!this.isCurrent(generation, ws)) return
            recordBootEvent('signaling', 'error', generation)
            this.scheduleRetry(generation, 'websocket-error')
        }
        ws.onclose = (event) => {
            if (!this.isCurrent(generation, ws)) return
            recordBootEvent('signaling', 'closed', generation, {
                code: event.code,
                reason: event.reason,
            })
            this.scheduleRetry(generation, `websocket-close-${event.code}`)
        }
    }

    private startPeerConnection(generation: number) {
        if (!this.isCurrent(generation)) return

        const peer = new RTCPeerConnection()
        this.peer = peer
        recordBootEvent('peer', 'created', generation)

        peer.onicecandidate = event => {
            if (!this.isCurrent(generation, undefined, peer) || !event.candidate) return
            const candidate = event.candidate.toJSON()
            recordBootEvent('candidate', 'local', generation, {
                type: candidate.candidate?.match(/ typ ([a-z]+)/)?.[1] ?? 'unknown',
            })
            this.wsSend(generation, 'candidate', candidate)
        }
        peer.oniceconnectionstatechange = () => {
            if (!this.isCurrent(generation, undefined, peer)) return
            const state = peer.iceConnectionState
            recordBootEvent('ice', state, generation)
            if (this.disconnectedTimer) {
                clearTimeout(this.disconnectedTimer)
                this.disconnectedTimer = undefined
            }
            if (state === 'failed' || state === 'closed') {
                this.scheduleRetry(generation, `ice-${state}`)
            } else if (state === 'disconnected') {
                this.disconnectedTimer = setTimeout(() => {
                    if (
                        this.isCurrent(generation, undefined, peer)
                        && peer.iceConnectionState === 'disconnected'
                    ) {
                        this.scheduleRetry(generation, 'ice-disconnected')
                    }
                }, 1_500)
            }
        }
        peer.onconnectionstatechange = () => {
            if (!this.isCurrent(generation, undefined, peer)) return
            const state = peer.connectionState
            recordBootEvent('peer', state, generation)
            if (state === 'failed' || state === 'closed') {
                this.scheduleRetry(generation, `peer-${state}`)
            }
        }
        peer.onicegatheringstatechange = () => {
            if (!this.isCurrent(generation, undefined, peer)) return
            recordBootEvent('ice', `gathering-${peer.iceGatheringState}`, generation)
        }
        peer.onsignalingstatechange = () => {
            if (!this.isCurrent(generation, undefined, peer)) return
            recordBootEvent('signaling', peer.signalingState, generation)
        }
        peer.ontrack = event => {
            if (!this.isCurrent(generation, undefined, peer)) return
            this.installRemoteAudio(event)
        }
        peer.ondatachannel = event => {
            if (!this.isCurrent(generation, undefined, peer)) {
                event.channel.close()
                return
            }
            this.installDataChannel(generation, event.channel)
        }

        this.stream?.getTracks()?.forEach(track => {
            peer.addTrack(track, this.stream!)
        })

        if (!this.stream) {
            this.warningTimer = setTimeout(() => {
                if (!this.isCurrent(generation)) return
                const warning = document.getElementById('warning')
                if (warning) warning.style.opacity = '1'
            }, 10_000)
        }
    }

    private installRemoteAudio(event: RTCTrackEvent) {
        this.removeAudioElement()
        const element = document.createElement(event.track.kind) as HTMLAudioElement
        element.srcObject = event.streams[0]
        element.autoplay = true
        element.controls = true
        document.body.appendChild(element)
        this.audioElement = element

        event.track.onmute = () => {
            void element.play()
        }
        event.streams[0]?.addEventListener('removetrack', () => this.removeAudioElement(), {
            once: true,
        })
    }

    private installDataChannel(generation: number, channel: RTCDataChannel) {
        this.dataChannels.add(channel)
        recordBootEvent('channel', 'received', generation, { label: channel.label })

        if (channel.label === 'write') {
            channel.onmessage = event => {
                const packet: Packet = {
                    ip: [127, 0, 0, 1],
                    port: 8080,
                    data: event.data,
                }
                if (event.data?.arrayBuffer) {
                    void event.data.arrayBuffer().then((data: ArrayBuffer) => {
                        packet.data = new Int8Array(data)
                        ;(this.net as Net).incoming.enqueue(packet)
                    })
                } else {
                    ;(this.net as Net).incoming.enqueue(packet)
                }
            }
        }

        channel.onopen = () => {
            if (!this.isCurrent(generation)) {
                channel.close()
                return
            }
            this.openedChannelLabels.add(channel.label)
            if (channel.label === 'read') this.channel = channel
            recordBootEvent('channel', 'open', generation, { label: channel.label })
            this.updateTransportSnapshot()
            this.resolveIfReady(generation)
        }
        channel.onclose = () => {
            this.dataChannels.delete(channel)
            if (!this.isCurrent(generation)) return
            this.openedChannelLabels.delete(channel.label)
            if (this.channel === channel) this.channel = undefined
            recordBootEvent('channel', 'closed', generation, { label: channel.label })
            this.updateTransportSnapshot()
            this.scheduleRetry(generation, `channel-${channel.label}-closed`)
        }
        channel.onerror = () => {
            if (!this.isCurrent(generation)) return
            recordBootEvent('channel', 'error', generation, { label: channel.label })
        }
    }

    private resolveIfReady(generation: number) {
        if (
            !this.openedChannelLabels.has('read')
            || !this.openedChannelLabels.has('write')
        ) {
            return
        }

        this.transportReady = true
        this.updateTransportSnapshot()
        if (this.deadlineTimer) {
            clearTimeout(this.deadlineTimer)
            this.deadlineTimer = undefined
        }
        if (this.warningTimer) {
            clearTimeout(this.warningTimer)
            this.warningTimer = undefined
        }
        const warning = document.getElementById('warning')
        if (warning) warning.style.opacity = '0'
        recordBootEvent('transport', 'ready', generation)
        const resolve = this.resolveConnection
        this.resolveConnection = undefined
        this.rejectConnection = undefined
        resolve?.()
    }

    private async handleSignalingMessage(generation: number, event: MessageEvent) {
        try {
            const parsed = JSON.parse(String(event.data)) as { event?: string; data?: unknown }
            if (parsed.event === 'offer') {
                await this.handleOffer(generation, parsed.data as RTCSessionDescriptionInit)
            } else if (parsed.event === 'candidate') {
                await this.handleRemoteCandidate(generation, parsed.data as RTCIceCandidateInit)
            } else {
                recordBootEvent('signaling', 'unknown-message', generation, {
                    event: parsed.event ?? 'missing',
                })
            }
        } catch (error) {
            recordBootEvent('signaling', 'message-failed', generation, {
                error: error instanceof Error ? error.message : String(error),
            })
            this.scheduleRetry(generation, 'signaling-message-failed')
        }
    }

    private async handleOffer(generation: number, offer: RTCSessionDescriptionInit) {
        const peer = this.peer
        if (!peer || !this.isCurrent(generation, undefined, peer)) return

        recordBootEvent('signaling', 'offer-received', generation)
        await peer.setRemoteDescription(offer)
        if (!this.isCurrent(generation, undefined, peer)) return
        await this.flushRemoteCandidates(generation)
        const answer = await peer.createAnswer()
        await peer.setLocalDescription(answer)
        if (!this.isCurrent(generation, undefined, peer)) return
        this.wsSend(generation, 'answer', answer)
        recordBootEvent('signaling', 'answer-sent', generation)
    }

    private async handleRemoteCandidate(generation: number, candidate: RTCIceCandidateInit) {
        const peer = this.peer
        if (!peer || !this.isCurrent(generation, undefined, peer)) return
        recordBootEvent('candidate', 'remote', generation, {
            type: candidate.candidate?.match(/ typ ([a-z]+)/)?.[1] ?? 'unknown',
        })
        if (!peer.remoteDescription) {
            this.candidates.push(candidate)
            recordBootEvent('candidate', 'queued', generation)
            return
        }
        await peer.addIceCandidate(candidate)
        recordBootEvent('candidate', 'applied', generation)
    }

    private async flushRemoteCandidates(generation: number) {
        const peer = this.peer
        if (!peer || !this.isCurrent(generation, undefined, peer)) return

        const candidates = this.candidates
        this.candidates = []
        for (const candidate of candidates) {
            if (!this.isCurrent(generation, undefined, peer)) return
            await peer.addIceCandidate(candidate)
            recordBootEvent('candidate', 'applied-queued', generation)
        }
    }

    private wsSend(generation: number, event: string, data: unknown) {
        const ws = this.ws
        if (!ws || !this.isCurrent(generation, ws) || ws.readyState !== WebSocket.OPEN) return
        ws.send(JSON.stringify({ event, data }))
    }

    private scheduleRetry(generation: number, reason: string) {
        if (!this.isCurrent(generation) || this.terminalFailure) return
        if (this.retryTimer) return

        this.transportReady = false
        this.updateTransportSnapshot()
        recordBootEvent('retry', 'scheduled', generation, { reason })
        this.retryTimer = setTimeout(() => {
            this.retryTimer = undefined
            if (!this.isCurrent(generation) || this.terminalFailure) return
            this.startTransportAttempt(reason)
        }, this.retryDelayMs)
    }

    private failTransport(error: Error) {
        if (this.terminalFailure || this.transportReady) return
        this.terminalFailure = true
        this.closeAttemptResources()
        const debug = bootDebug()
        debug.transport.terminalFailure = error.message
        recordBootEvent('transport', 'failed', this.generation, { error: error.message })
        const reject = this.rejectConnection
        this.resolveConnection = undefined
        this.rejectConnection = undefined
        reject?.(error)
    }

    private closeAttemptResources() {
        if (this.retryTimer) {
            clearTimeout(this.retryTimer)
            this.retryTimer = undefined
        }
        if (this.warningTimer) {
            clearTimeout(this.warningTimer)
            this.warningTimer = undefined
        }
        if (this.disconnectedTimer) {
            clearTimeout(this.disconnectedTimer)
            this.disconnectedTimer = undefined
        }
        this.dataChannels.forEach(channel => {
            try { channel.close() } catch { /* already closed */ }
        })
        this.dataChannels.clear()
        this.channel = undefined
        try { this.peer?.close() } catch { /* already closed */ }
        try { this.ws?.close() } catch { /* already closed */ }
        this.peer = undefined
        this.ws = undefined
        this.removeAudioElement()
    }

    private removeAudioElement() {
        if (this.audioElement?.parentNode) {
            this.audioElement.parentNode.removeChild(this.audioElement)
        }
        this.audioElement = undefined
    }

    private isCurrent(
        generation: number,
        ws?: WebSocket,
        peer?: RTCPeerConnection,
    ) {
        return (
            generation === this.generation
            && (!ws || ws === this.ws)
            && (!peer || peer === this.peer)
        )
    }

    private updateTransportSnapshot() {
        const debug = bootDebug()
        debug.transport.generation = this.generation
        debug.transport.ready = this.transportReady
        debug.transport.openedChannels = [...this.openedChannelLabels].sort()
    }

    sendto(packet: Packet) {
        if (!this.channel || this.channel.readyState !== 'open') return
        const payload = new Uint8Array(packet.data.byteLength)
        payload.set(packet.data)
        this.channel.send(payload)
    }
}
