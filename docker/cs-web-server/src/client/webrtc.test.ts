import assert from 'node:assert/strict'
import { afterEach, beforeEach, test } from 'node:test'
import { Xash3DWebRTC } from './webrtc'

class FakeDataChannel {
    label: string
    readyState: RTCDataChannelState = 'connecting'
    onopen: (() => void) | null = null
    onclose: (() => void) | null = null
    onerror: (() => void) | null = null
    onmessage: ((event: MessageEvent) => void) | null = null
    sent: unknown[] = []
    closed = false

    constructor(label: string) {
        this.label = label
    }

    open() {
        this.readyState = 'open'
        this.onopen?.()
    }

    close() {
        if (this.closed) return
        this.closed = true
        this.readyState = 'closed'
        this.onclose?.()
    }

    send(data: unknown) {
        this.sent.push(data)
    }
}

class FakePeerConnection {
    static instances: FakePeerConnection[] = []

    connectionState: RTCPeerConnectionState = 'new'
    iceConnectionState: RTCIceConnectionState = 'new'
    iceGatheringState: RTCIceGatheringState = 'new'
    signalingState: RTCSignalingState = 'stable'
    remoteDescription: RTCSessionDescription | null = null
    closed = false
    candidates: RTCIceCandidateInit[] = []
    onicecandidate: ((event: RTCPeerConnectionIceEvent) => void) | null = null
    oniceconnectionstatechange: (() => void) | null = null
    onconnectionstatechange: (() => void) | null = null
    onicegatheringstatechange: (() => void) | null = null
    onsignalingstatechange: (() => void) | null = null
    ontrack: ((event: RTCTrackEvent) => void) | null = null
    ondatachannel: ((event: RTCDataChannelEvent) => void) | null = null

    constructor() {
        FakePeerConnection.instances.push(this)
    }

    addTrack() {}

    async setRemoteDescription(description: RTCSessionDescriptionInit) {
        this.remoteDescription = description as RTCSessionDescription
    }

    async createAnswer() {
        return { type: 'answer', sdp: 'answer-sdp' } as RTCSessionDescriptionInit
    }

    async setLocalDescription() {}

    async addIceCandidate(candidate: RTCIceCandidateInit) {
        this.candidates.push(candidate)
    }

    emitDataChannel(channel: FakeDataChannel) {
        this.ondatachannel?.({ channel } as unknown as RTCDataChannelEvent)
    }

    fail() {
        this.connectionState = 'failed'
        this.onconnectionstatechange?.()
    }

    close() {
        this.closed = true
        this.connectionState = 'closed'
    }
}

class FakeWebSocket {
    static OPEN = 1
    static instances: FakeWebSocket[] = []

    readyState = 0
    onopen: (() => void) | null = null
    onerror: (() => void) | null = null
    onclose: ((event: CloseEvent) => void) | null = null
    sent: string[] = []
    closed = false
    private messageHandlers: Array<(event: MessageEvent) => void> = []

    constructor(readonly url: string) {
        FakeWebSocket.instances.push(this)
    }

    addEventListener(type: string, handler: (event: MessageEvent) => void) {
        if (type === 'message') this.messageHandlers.push(handler)
    }

    open() {
        this.readyState = FakeWebSocket.OPEN
        this.onopen?.()
    }

    message(event: string, data: unknown) {
        const message = { data: JSON.stringify({ event, data }) } as MessageEvent
        this.messageHandlers.forEach(handler => handler(message))
    }

    error() {
        this.onerror?.()
    }

    close() {
        this.closed = true
        this.readyState = 3
    }

    send(data: string) {
        this.sent.push(data)
    }
}

const warning = { style: { opacity: '0' } }

function installBrowserMocks() {
    Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: {
            location: { protocol: 'https:', host: 'play.example.test' },
            __CS_RUNTIME_BOOT_DEBUG: undefined,
        },
    })
    Object.defineProperty(globalThis, 'document', {
        configurable: true,
        value: {
            getElementById: () => warning,
            createElement: () => ({
                autoplay: false,
                controls: false,
                play: async () => {},
            }),
            body: { appendChild: () => {} },
        },
    })
    Object.defineProperty(globalThis, 'navigator', {
        configurable: true,
        value: {
            mediaDevices: {
                getUserMedia: async () => {
                    throw new Error('permission denied')
                },
            },
        },
    })
    Object.defineProperty(globalThis, 'WebSocket', {
        configurable: true,
        value: FakeWebSocket,
    })
    Object.defineProperty(globalThis, 'RTCPeerConnection', {
        configurable: true,
        value: FakePeerConnection,
    })
}

async function tick(ms = 0) {
    await new Promise(resolve => setTimeout(resolve, ms))
}

beforeEach(() => {
    FakeWebSocket.instances = []
    FakePeerConnection.instances = []
    installBrowserMocks()
})

afterEach(() => {
    delete (globalThis as Record<string, unknown>).window
    delete (globalThis as Record<string, unknown>).document
    delete (globalThis as Record<string, unknown>).navigator
    delete (globalThis as Record<string, unknown>).WebSocket
    delete (globalThis as Record<string, unknown>).RTCPeerConnection
})

test('connect is memoized, queues candidates, and waits for both channels', async () => {
    const runtime = new Xash3DWebRTC({}, { connectTimeoutMs: 500, retryDelayMs: 5 })
    const first = runtime.connect()
    const second = runtime.connect()
    assert.strictEqual(first, second)

    await tick()
    const socket = FakeWebSocket.instances[0]
    socket.open()
    const peer = FakePeerConnection.instances[0]

    socket.message('candidate', { candidate: 'candidate:1 1 udp 1 127.0.0.1 9 typ host' })
    await tick()
    assert.equal(peer.candidates.length, 0)

    socket.message('offer', { type: 'offer', sdp: 'offer-sdp' })
    await tick()
    assert.equal(peer.candidates.length, 1)
    assert.equal(JSON.parse(socket.sent.at(-1) ?? '{}').event, 'answer')

    const write = new FakeDataChannel('write')
    const read = new FakeDataChannel('read')
    peer.emitDataChannel(write)
    peer.emitDataChannel(read)
    write.open()
    let resolved = false
    void first.then(() => { resolved = true })
    await tick()
    assert.equal(resolved, false)

    read.open()
    await first
    assert.deepEqual(window.__CS_RUNTIME_BOOT_DEBUG?.transport.openedChannels, ['read', 'write'])
})

test('retry closes the old attempt and ignores stale events', async () => {
    const runtime = new Xash3DWebRTC({}, { connectTimeoutMs: 500, retryDelayMs: 5 })
    const connection = runtime.connect()
    await tick()

    const firstSocket = FakeWebSocket.instances[0]
    firstSocket.open()
    const firstPeer = FakePeerConnection.instances[0]
    firstSocket.error()
    await tick(10)

    assert.equal(firstSocket.closed, true)
    assert.equal(firstPeer.closed, true)
    assert.equal(FakeWebSocket.instances.length, 2)

    firstSocket.message('offer', { type: 'offer', sdp: 'stale-offer' })
    await tick()
    assert.equal(FakePeerConnection.instances.length, 1)

    const secondSocket = FakeWebSocket.instances[1]
    secondSocket.open()
    const secondPeer = FakePeerConnection.instances[1]
    secondSocket.message('offer', { type: 'offer', sdp: 'fresh-offer' })
    await tick()

    const write = new FakeDataChannel('write')
    const read = new FakeDataChannel('read')
    secondPeer.emitDataChannel(write)
    secondPeer.emitDataChannel(read)
    write.open()
    read.open()
    await connection
    assert.equal(window.__CS_RUNTIME_BOOT_DEBUG?.transport.generation, 2)
})

test('connect rejects after the overall transport deadline', async () => {
    const runtime = new Xash3DWebRTC({}, { connectTimeoutMs: 15, retryDelayMs: 5 })
    await assert.rejects(runtime.connect(), /did not become ready within 15ms/)
    assert.match(
        window.__CS_RUNTIME_BOOT_DEBUG?.transport.terminalFailure ?? '',
        /did not become ready/,
    )
})
