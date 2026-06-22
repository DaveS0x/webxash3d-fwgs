import { loadAsync } from 'jszip'
import xashURL from 'xash3d-fwgs/xash.wasm?url'
import gl4esURL from 'xash3d-fwgs/libref_webgl2.wasm?url'
import { createWorkletBackedScriptProcessorNode } from './audio-bridge'
import { Xash3DWebRTC } from './webrtc'

type AudioContextConstructor = {
  new(options?: AudioContextOptions): AudioContext
  prototype: AudioContext
}

type AudioBackendSnapshot = {
  variant: string
  enabled: boolean
  installed: boolean
  installReason?: string
  requestedSampleRate?: number
  requestedLatencyHint?: AudioContextOptions['latencyHint']
  constructorCalls: number
  constructorFallbacks: number
  contextsCreated: number
  actualSampleRate?: number
  baseLatency?: number
  outputLatency?: number
  state?: AudioContextState
  scriptProcessorCalls: number
  lastScriptProcessorArgs?: {
    bufferSize?: number
    numberOfInputChannels?: number
    numberOfOutputChannels?: number
  }
  resumeAttempts: number
  resumeSuccesses: number
  resumeFailures: number
  lastResumeSource?: string
  hiddenSuspendEnabled: boolean
  suspendedForHiddenTab: boolean
  suspendedForPageExitPrompt: boolean
  suspendAttempts: number
  suspendSuccesses: number
  suspendFailures: number
  lastSuspendSource?: string
  lastError?: string
  // worklet bridge fields
  crossOriginIsolated: boolean
  workletBridgeEnabled: boolean
  workletBridgeInstalled: boolean
  workletBridgeFailed: boolean
  workletBridgeStatus: 'disabled' | 'pending' | 'installed' | 'fallback'
  workletFallbacks: number
  sdlCallbackCount: number
  ringOverflowDrops: number
  workletUnderruns: number
  driveIntervalMs?: number
  ringFrames: number
  ringAvailable?: number
}

type NativeStallFsEvent = {
  op?: unknown
  path?: unknown
  mode?: unknown
  hit?: unknown
  ms?: unknown
}

type NativeStallFsSummary = {
  count: number
  misses: number
  totalMs: number
  top: Array<{
    op: string
    path: string
    mode: string
    hit: boolean
    ms: number
  }>
}

type NativeStallRenderEvent = {
  name?: unknown
  ms?: unknown
}

type NativeStallRenderSummary = {
  count: number
  totalMs: number
  phases: Array<{
    name: string
    ms: number
    count: number
  }>
}

type StallLogKind = 'tick' | 'native' | 'fs' | 'render'

type StallLogEntry = {
  kind: StallLogKind
  timeMs: number
  line: string
}

type StallLogBuffer = {
  readonly entries: StallLogEntry[]
  readonly consoleEnabled: boolean
  text: (limit?: number) => string
  dump: (limit?: number) => string
  clear: () => void
  setConsole: (enabled: boolean) => void
}

type PointerLockGuardSnapshot = {
  installed: boolean
  needsFreshCanvasGesture: boolean
  requestAttempts: number
  allowedRequests: number
  blockedRequests: number
  forcedExits: number
  trustedCanvasGestures: number
  lastRequestTarget?: string
  lastRequestSource?: string
  lastBlockReason?: string
  lastTrustedCanvasGestureMs?: number
  unadjustedMovement: 'enabled' | 'unsupported' | 'unknown'
  lastForcedExitReason?: string
  lastForcedExitMs?: number
}

type PointerLockRequestElement = Element & {
  requestPointerLock?: (options?: PointerLockOptions) => Promise<void> | void
  webkitRequestPointerLock?: () => void
}

type XashModuleCallbacks = {
  gameReady?: () => void
  nativeStallFrameBegin?: () => void
  nativeStallTrace?: (line: string) => void
  nativeStallFs?: (event: NativeStallFsEvent) => void
  nativeStallRender?: (event: NativeStallRenderEvent) => void
}

type RuntimeLaunchSpray = {
  assetId?: unknown
  wadUrl?: unknown
  wadSha256?: unknown
  wadSizeBytes?: unknown
  width?: unknown
  height?: unknown
  textureName?: unknown
}

type RuntimeGameSettings = {
  schemaVersion?: unknown
  resolution?: unknown
  mouseSensitivity?: unknown
  soundVolume?: unknown
  brightness?: unknown
  screenWidth?: unknown
  invertedMouse?: unknown
  viewmodelHand?: unknown
}

type ActiveRuntimeSpray = {
  assetId: string
  wadUrl: string
  wadSha256: string
  wadSizeBytes: number
}

type SprayDebugEvent = {
  timeMs: number
  stage: string
  detail: Record<string, unknown>
}

type SprayDebugSnapshot = {
  activeSpray: ActiveRuntimeSpray | null
  mounted: boolean
  mountPaths: string[]
  fsSizes: Record<string, number>
  error?: string
  events: SprayDebugEvent[]
}

type SprayDebugState = SprayDebugSnapshot & {
  snapshot: () => SprayDebugSnapshot
}

declare global {
  interface Window {
    webkitAudioContext?: AudioContextConstructor
    crossOriginIsolated?: boolean
    __CS_LOAD_PROGRESS_SET?: (stage: string, percent: number) => void
    __CS_RUNTIME_LAUNCH?: {
      launchToken?: string
      playerName?: string
      gameSettings?: RuntimeGameSettings
      account?: {
        userId?: string
        activeSpray?: RuntimeLaunchSpray
      }
      wager?: {
        sessionId?: string
        userId?: string
        walletAddress?: string
        joinToken?: string
        streamToken?: string
        liveUrl?: string
      }
    }
    __CS_SPRAY_DEBUG__?: SprayDebugState
    __CS_START_RUNTIME?: (playerName: string) => boolean
    __CS_RUNTIME_BOOT_FAILED?: (message: string) => void
    __CS_AUDIO_CONTEXT_HINTS?: boolean | string | number
    __CS_AUDIO_CONTEXT_SAMPLE_RATE?: number | string
    __CS_AUDIO_CONTEXT_LATENCY_HINT?: AudioContextOptions['latencyHint'] | string
    __CS_AUDIO_WORKLET_BRIDGE?: boolean | string | number
    __CS_AUDIO_HIDDEN_SUSPEND?: boolean | string | number
    __CS_POINTER_LOCK_GUARD__?: {
      snapshot: () => PointerLockGuardSnapshot
    }
    __CS_AUDIO_BACKEND__?: {
      snapshot: () => AudioBackendSnapshot
      resumeNow: () => boolean
      suspendNow: () => boolean
    }
    __CS_STALL_LOGS?: StallLogBuffer
    __CS_CAMERA?: {
      ready: () => boolean
      exec: (command: unknown) => boolean
      setMode: (mode: unknown) => boolean
      cycleTeam: (team?: unknown) => { ok: boolean; targetChanged: boolean }
    }
    __CS_CAMERA_ACTIVE?: boolean
    __xash?: Xash3DWebRTC
    __mapReady?: Promise<unknown>
    __mapBytes?: ArrayBuffer | Uint8Array | null
    __mapName?: string | null
    SDL2?: {
      audioContext?: AudioContext
      audio?: {
        scriptProcessorNode?: ScriptProcessorNode
      }
    }
    Module?: {
      print?: (text: unknown) => void
      printErr?: (text: unknown) => void
      callbacks?: XashModuleCallbacks
      __csLoadProgressHooked?: boolean
      __nativeStallTraceEnabled?: boolean
      __nativeStallTraceThresholdMs?: number
      preMainLoop?: () => void
      postMainLoop?: () => void
    }
  }
}

const buildEnv = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {}
const RUNTIME_ASSET_VERSION = buildEnv.VITE_CS_RUNTIME_ASSET_VERSION ?? '20260427soundbuf1'
const AUDIO_BACKEND_VARIANT = 'aw-bridge-20260622a'
const SPRAY_WAD_RUNTIME_PATHS = [
  '/rodir/cstrike/countersol_tempdecal.wad',
  '/rodir/cstrike/tempdecal.wad',
]
const SPRAY_DEBUG_EVENT_LIMIT = 80

const sprayDebugState: SprayDebugState = {
  activeSpray: null,
  mounted: false,
  mountPaths: [],
  fsSizes: {},
  events: [],
  snapshot: () => ({
    activeSpray: sprayDebugState.activeSpray,
    mounted: sprayDebugState.mounted,
    mountPaths: [...sprayDebugState.mountPaths],
    fsSizes: { ...sprayDebugState.fsSizes },
    error: sprayDebugState.error,
    events: [...sprayDebugState.events],
  }),
}

function recordSprayDebug(stage: string, detail: Record<string, unknown> = {}) {
  window.__CS_SPRAY_DEBUG__ = sprayDebugState
  const event = {
    timeMs: Math.round(performance.now()),
    stage,
    detail,
  }
  sprayDebugState.events.push(event)
  if (sprayDebugState.events.length > SPRAY_DEBUG_EVENT_LIMIT) {
    sprayDebugState.events.splice(0, sprayDebugState.events.length - SPRAY_DEBUG_EVENT_LIMIT)
  }
  console.log(`[CounterSolSpray] ${stage}`, detail)
}

window.__CS_SPRAY_DEBUG__ = sprayDebugState

// ---------------------------------------------------------------------------
// Audio backend state
// ---------------------------------------------------------------------------

const audioBackendState: Omit<
  AudioBackendSnapshot,
  'state' | 'actualSampleRate' | 'baseLatency' | 'outputLatency' | 'crossOriginIsolated' | 'ringAvailable'
> = {
  variant: AUDIO_BACKEND_VARIANT,
  enabled: false,
  installed: false,
  constructorCalls: 0,
  constructorFallbacks: 0,
  contextsCreated: 0,
  scriptProcessorCalls: 0,
  resumeAttempts: 0,
  resumeSuccesses: 0,
  resumeFailures: 0,
  hiddenSuspendEnabled: true,
  suspendedForHiddenTab: false,
  suspendedForPageExitPrompt: false,
  suspendAttempts: 0,
  suspendSuccesses: 0,
  suspendFailures: 0,
  workletBridgeEnabled: false,
  workletBridgeInstalled: false,
  workletBridgeFailed: false,
  workletBridgeStatus: 'disabled',
  workletFallbacks: 0,
  sdlCallbackCount: 0,
  ringOverflowDrops: 0,
  workletUnderruns: 0,
  ringFrames: 8192,
}

let lastAudioContext: AudioContext | undefined
const instrumentedAudioContexts = new WeakSet<AudioContext>()
let audioSuspendedForHiddenTab = false
let audioSuspendedForPageExitPrompt = false
let pointerLockWasActive = false
let pointerLockRecentlyReleased = false
let pointerLockNeedsFreshCanvasGesture = true
let pointerLockTrustedCanvasGestureUntilMs = 0
let pointerLockAllowedRequestUntilMs = 0
const POINTER_LOCK_GESTURE_GRACE_MS = 1500
const POINTER_LOCK_ALLOWED_REQUEST_GRACE_MS = 2000
const pointerLockGuardState: PointerLockGuardSnapshot = {
  installed: false,
  needsFreshCanvasGesture: true,
  requestAttempts: 0,
  allowedRequests: 0,
  blockedRequests: 0,
  forcedExits: 0,
  trustedCanvasGestures: 0,
  unadjustedMovement: 'unknown',
  lastForcedExitReason: undefined,
  lastForcedExitMs: undefined,
}

// ---------------------------------------------------------------------------
// Ring buffer state (set up once the worklet module loads)
// ---------------------------------------------------------------------------

const RING_FRAMES = 16384
// Keep ring 75% full (~557ms at 22050Hz). Larger target absorbs main-thread stalls that
// previously drained the ring and caused worklet underruns (silence/reverb artefacts).
// Trade-off: ~370ms more latency vs the 50% / 185ms baseline.
const RING_TARGET = Math.floor(RING_FRAMES * 0.75) // 12288 frames ≈ 557ms at 22050Hz

let workletRingBuf: Float32Array | null = null
let workletReadHead: Int32Array | null = null
let workletWriteHead: Int32Array | null = null

// ---------------------------------------------------------------------------
// AudioWorklet processor — inlined to avoid a separate static file
// ---------------------------------------------------------------------------

const WORKLET_PROCESSOR_SRC = `
class CSAudioProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() { return [] }
  constructor() {
    super()
    this._ready = false
    this._underruns = 0
    this.port.onmessage = ({ data }) => {
      this._buf = new Float32Array(data.ring)
      this._rp  = new Int32Array(data.ctrl, 0, 1)
      this._wp  = new Int32Array(data.ctrl, 4, 1)
      this._rf  = data.ringFrames
      this._nc  = data.numCh
      this._ready = true
    }
  }
  process(_inputs, outputs) {
    if (!this._ready) return true
    const out = outputs[0]
    const nc  = Math.min(out.length, this._nc)
    const n   = out[0].length
    const rp  = Atomics.load(this._rp, 0)
    const wp  = Atomics.load(this._wp, 0)
    const avail = (wp - rp + this._rf) % this._rf
    if (avail < n) {
      this._underruns++
      if ((this._underruns & 63) === 1) this.port.postMessage(this._underruns)
      return true
    }
    for (let i = 0; i < n; i++) {
      const pos = ((rp + i) % this._rf) * this._nc
      for (let c = 0; c < nc; c++) out[c][i] = this._buf[pos + c]
    }
    Atomics.store(this._rp, 0, (rp + n) % this._rf)
    return true
  }
}
registerProcessor('cs-audio', CSAudioProcessor)
`

// ---------------------------------------------------------------------------
// Worklet bridge setup — called as soon as an AudioContext is instrumented
// ---------------------------------------------------------------------------

function workletBridgeUnavailableReason(ctx: AudioContext): string | undefined {
  if (window.crossOriginIsolated !== true) {
    return 'Cross-origin isolation unavailable — COOP/COEP headers not active'
  }
  if (typeof SharedArrayBuffer === 'undefined') return 'SharedArrayBuffer unavailable'
  if (!ctx.audioWorklet || typeof ctx.audioWorklet.addModule !== 'function') {
    return 'AudioWorklet.addModule unavailable'
  }
  if (typeof AudioWorkletNode === 'undefined') return 'AudioWorkletNode unavailable'
  return undefined
}

async function setupWorkletBridge(ctx: AudioContext): Promise<boolean> {
  const blob = new Blob([WORKLET_PROCESSOR_SRC], { type: 'application/javascript' })
  const blobURL = URL.createObjectURL(blob)
  audioBackendState.workletBridgeStatus = 'pending'

  try {
    await ctx.audioWorklet.addModule(blobURL)

    const numCh = 2
    const ringShared = new SharedArrayBuffer(RING_FRAMES * numCh * 4)
    const ctrlShared = new SharedArrayBuffer(8) // [readHead: Int32, writeHead: Int32]

    workletRingBuf  = new Float32Array(ringShared)
    workletReadHead  = new Int32Array(ctrlShared, 0, 1)
    workletWriteHead = new Int32Array(ctrlShared, 4, 1)

    const node = new AudioWorkletNode(ctx, 'cs-audio', {
      numberOfOutputs: 1,
      outputChannelCount: [numCh],
    })

    node.port.onmessage = (e: MessageEvent<number>) => {
      audioBackendState.workletUnderruns = e.data
    }

    node.connect(ctx.destination)

    node.port.postMessage({
      ring: ringShared,
      ctrl: ctrlShared,
      ringFrames: RING_FRAMES,
      numCh,
    })

    audioBackendState.workletBridgeInstalled = true
    audioBackendState.workletBridgeFailed = false
    audioBackendState.workletBridgeStatus = 'installed'
    return true
  } catch (e: unknown) {
    audioBackendState.lastError = `addModule failed: ${e instanceof Error ? e.message : String(e)}`
    audioBackendState.workletBridgeFailed = true
    return false
  } finally {
    URL.revokeObjectURL(blobURL)
  }
}

// ---------------------------------------------------------------------------
// Fake ScriptProcessorNode + drive loop
// ---------------------------------------------------------------------------

function fillRingToTarget(
  fakeBuffer: AudioBuffer,
  fake: Pick<ScriptProcessorNode, 'onaudioprocess'>,
  bufferSize: number,
  numCh: number,
): void {
  if (!audioBackendState.workletBridgeInstalled || !workletRingBuf || !workletWriteHead || !workletReadHead) return

  // Fill the ring up to TARGET, catching up after any main-thread stall.
  // Cap at 8 batches per tick (~370ms of audio) to avoid blocking the thread.
  for (let batch = 0; batch < 8; batch++) {
    const rp   = Atomics.load(workletReadHead, 0)
    const wp   = Atomics.load(workletWriteHead, 0)
    const fill = (wp - rp + RING_FRAMES) % RING_FRAMES

    if (fill >= RING_TARGET) break

    const space = (rp - wp - 1 + RING_FRAMES) % RING_FRAMES
    if (space < bufferSize) {
      audioBackendState.ringOverflowDrops++
      break
    }

    const cb = fake.onaudioprocess
    if (!cb) break

    cb.call(fake as ScriptProcessorNode, { outputBuffer: fakeBuffer } as AudioProcessingEvent)
    audioBackendState.sdlCallbackCount++

    // Copy planar AudioBuffer channels into interleaved ring buffer
    const newWp = (wp + bufferSize) % RING_FRAMES
    for (let i = 0; i < bufferSize; i++) {
      const pos = ((wp + i) % RING_FRAMES) * numCh
      for (let c = 0; c < numCh; c++) {
        workletRingBuf[pos + c] = fakeBuffer.getChannelData(c)[i]
      }
    }
    Atomics.store(workletWriteHead, 0, newWp)
  }
}

function createBridgeScriptProcessorNode(
  ctx: AudioContext,
  args: Parameters<AudioContext['createScriptProcessor']>,
  originalCreateScriptProcessor: AudioContext['createScriptProcessor'],
  bridgeReady: Promise<boolean>,
): ScriptProcessorNode {
  const bufferSize = args[0] ?? 1024
  const numCh = args[2] ?? 2
  const fakeBuffer = ctx.createBuffer(numCh, bufferSize, ctx.sampleRate)
  const driveMs    = (bufferSize / ctx.sampleRate) * 1000
  audioBackendState.driveIntervalMs = driveMs

  return createWorkletBackedScriptProcessorNode({
    context: ctx,
    args,
    originalCreateScriptProcessor,
    bridgeReady,
    startWorkletDrive: node => {
      const interval = window.setInterval(
        () => fillRingToTarget(fakeBuffer, node, bufferSize, numCh),
        driveMs,
      )
      return () => window.clearInterval(interval)
    },
    onFallback: reason => {
      audioBackendState.workletBridgeFailed = true
      audioBackendState.workletBridgeInstalled = false
      audioBackendState.workletBridgeStatus = 'fallback'
      audioBackendState.workletFallbacks++
      if (reason != null) {
        audioBackendState.lastError = reason instanceof Error ? reason.message : String(reason)
      }
    },
  })
}

// ---------------------------------------------------------------------------
// AudioContext instrumentation
// ---------------------------------------------------------------------------

function audioContextSnapshot(): AudioBackendSnapshot {
  const context = window.SDL2?.audioContext ?? lastAudioContext
  const latencyCtx = context as (AudioContext & { outputLatency?: number }) | undefined

  let ringAvailable: number | undefined
  if (workletReadHead && workletWriteHead) {
    const rp = Atomics.load(workletReadHead, 0)
    const wp = Atomics.load(workletWriteHead, 0)
    ringAvailable = (wp - rp + RING_FRAMES) % RING_FRAMES
  }

  return {
    ...audioBackendState,
    crossOriginIsolated: window.crossOriginIsolated ?? false,
    actualSampleRate: context?.sampleRate,
    baseLatency: latencyCtx?.baseLatency,
    outputLatency: latencyCtx?.outputLatency,
    state: context?.state,
    ringFrames: RING_FRAMES,
    ringAvailable,
  }
}

function getAudioContextForResume(): AudioContext | undefined {
  return window.SDL2?.audioContext ?? lastAudioContext
}

type AudioSuspendOptions = {
  markHiddenTab?: boolean
  pageExitPrompt?: boolean
  resumeIfVisibleAfterSuspend?: boolean
}

function clearPageExitPromptAudioSuspend() {
  audioSuspendedForPageExitPrompt = false
  audioBackendState.suspendedForPageExitPrompt = false
}

function tryResumeAudioContext(source: string): boolean {
  const context = getAudioContextForResume()
  audioBackendState.lastResumeSource = source
  clearPageExitPromptAudioSuspend()
  if (!context || typeof context.resume !== 'function') return false
  if (context.state !== 'suspended') return false

  audioBackendState.resumeAttempts++
  void context.resume()
    .then(() => { audioBackendState.resumeSuccesses++ })
    .catch((error: unknown) => {
      audioBackendState.resumeFailures++
      audioBackendState.lastError = error instanceof Error ? error.message : String(error)
    })
  return true
}

function trySuspendAudioContext(source: string, options: AudioSuspendOptions = {}): boolean {
  const markHiddenTab = options.markHiddenTab ?? true
  const pageExitPrompt = options.pageExitPrompt ?? false
  const resumeIfVisibleAfterSuspend = options.resumeIfVisibleAfterSuspend ?? true
  const context = getAudioContextForResume()
  audioBackendState.lastSuspendSource = source
  if (!context || typeof context.suspend !== 'function') return false
  if (context.state !== 'running') return false

  audioBackendState.suspendAttempts++
  if (markHiddenTab) {
    audioSuspendedForHiddenTab = true
    audioBackendState.suspendedForHiddenTab = true
  }
  if (pageExitPrompt) {
    audioSuspendedForPageExitPrompt = true
    audioBackendState.suspendedForPageExitPrompt = true
  }
  void context.suspend()
    .then(() => {
      audioBackendState.suspendSuccesses++
      if (resumeIfVisibleAfterSuspend && !document.hidden) {
        audioSuspendedForHiddenTab = false
        audioBackendState.suspendedForHiddenTab = false
        tryResumeAudioContext('visibilitychange-race')
      } else if (pageExitPrompt && !document.hidden && !audioSuspendedForPageExitPrompt) {
        tryResumeAudioContext(`${source}-cancel-race`)
      }
    })
    .catch((error: unknown) => {
      if (markHiddenTab) {
        audioSuspendedForHiddenTab = false
        audioBackendState.suspendedForHiddenTab = false
      }
      if (pageExitPrompt) clearPageExitPromptAudioSuspend()
      audioBackendState.suspendFailures++
      audioBackendState.lastError = error instanceof Error ? error.message : String(error)
    })
  return true
}

function suspendAudioForPageExitPrompt(source: string) {
  trySuspendAudioContext(source, {
    markHiddenTab: false,
    pageExitPrompt: true,
    resumeIfVisibleAfterSuspend: false,
  })

  window.setTimeout(() => {
    if (!document.hidden) tryResumeAudioContext(`${source}-cancel`)
  }, 0)
}

function blurExclusiveFocusTarget() {
  const canvas = document.getElementById('canvas') as HTMLCanvasElement | null
  if (document.activeElement === canvas || document.activeElement === document.body) {
    const activeElement = document.activeElement as HTMLElement | null
    activeElement?.blur?.()
  }
  canvas?.blur?.()
}

function releaseKeyboardLock() {
  const keyboard = (navigator as Navigator & {
    keyboard?: { unlock?: () => void }
  }).keyboard
  try {
    keyboard?.unlock?.()
  } catch {
    // Best-effort cleanup only.
  }
}

function getGameCanvas(): HTMLCanvasElement | null {
  return document.getElementById('canvas') as HTMLCanvasElement | null
}

function releaseExclusiveBrowserModes(source: string, exitFullscreen: boolean) {
  void source
  if (document.pointerLockElement && typeof document.exitPointerLock === 'function') {
    try {
      document.exitPointerLock()
    } catch {
      // Best-effort cleanup only; audio visibility handling should still continue.
    }
  }

  if (exitFullscreen && document.fullscreenElement && typeof document.exitFullscreen === 'function') {
    void document.exitFullscreen().catch(() => undefined)
  }

  if (pointerLockWasActive || pointerLockRecentlyReleased) {
    releaseKeyboardLock()
    blurExclusiveFocusTarget()
    window.setTimeout(blurExclusiveFocusTarget, 0)
    window.setTimeout(blurExclusiveFocusTarget, 100)
  }
}

function describeElementTarget(target: Element): string {
  const id = target.id ? `#${target.id}` : ''
  const className = typeof target.className === 'string' && target.className
    ? `.${target.className.trim().replace(/\s+/g, '.')}`
    : ''
  return `${target.tagName.toLowerCase()}${id}${className}`
}

function isGameCanvasTarget(target: EventTarget | null): boolean {
  const canvas = getGameCanvas()
  return !!canvas && target === canvas
}

function markPointerLockNeedsFreshGesture() {
  pointerLockNeedsFreshCanvasGesture = true
  pointerLockTrustedCanvasGestureUntilMs = 0
  pointerLockAllowedRequestUntilMs = 0
  pointerLockGuardState.needsFreshCanvasGesture = true
}

function noteTrustedCanvasGesture(event: Event) {
  if (!event.isTrusted || !isGameCanvasTarget(event.target)) return
  const now = performance.now()
  pointerLockTrustedCanvasGestureUntilMs = now + POINTER_LOCK_GESTURE_GRACE_MS
  pointerLockGuardState.trustedCanvasGestures++
  pointerLockGuardState.lastTrustedCanvasGestureMs = now
}

function hasRecentPointerLockUserGesture(): boolean {
  const now = performance.now()
  return now <= pointerLockTrustedCanvasGestureUntilMs || now <= pointerLockAllowedRequestUntilMs
}

function dispatchPointerLockError(target: Element) {
  window.setTimeout(() => {
    try {
      document.dispatchEvent(new Event('pointerlockerror'))
      target.dispatchEvent(new Event('pointerlockerror'))
    } catch {
      // Best-effort compatibility signal only.
    }
  }, 0)
}

function shouldAllowPointerLockRequest(target: Element): { allowed: boolean; reason?: string } {
  if (document.hidden) return { allowed: false, reason: 'document-hidden' }
  if (!isGameCanvasTarget(target)) return { allowed: false, reason: 'not-game-canvas' }
  if (!pointerLockNeedsFreshCanvasGesture) return { allowed: true }
  if (hasRecentPointerLockUserGesture()) return { allowed: true }
  return { allowed: false, reason: 'needs-fresh-canvas-gesture' }
}

function noteBlockedPointerLockRequest(source: string, target: Element, reason: string) {
  pointerLockGuardState.blockedRequests++
  pointerLockGuardState.lastRequestSource = source
  pointerLockGuardState.lastRequestTarget = describeElementTarget(target)
  pointerLockGuardState.lastBlockReason = reason
  dispatchPointerLockError(target)
}

function noteAllowedPointerLockRequest(source: string, target: Element) {
  pointerLockGuardState.allowedRequests++
  pointerLockGuardState.lastRequestSource = source
  pointerLockGuardState.lastRequestTarget = describeElementTarget(target)
  pointerLockGuardState.lastBlockReason = undefined
  pointerLockNeedsFreshCanvasGesture = false
  pointerLockGuardState.needsFreshCanvasGesture = false
  pointerLockAllowedRequestUntilMs = performance.now() + POINTER_LOCK_ALLOWED_REQUEST_GRACE_MS
}

function forceExitUnexpectedPointerLock(source: string) {
  if (!document.pointerLockElement) return
  pointerLockGuardState.forcedExits++
  pointerLockGuardState.lastForcedExitReason = source
  pointerLockGuardState.lastForcedExitMs = performance.now()
  releaseExclusiveBrowserModes(source, false)
  markPointerLockNeedsFreshGesture()
}

function releaseUnexpectedPointerLockIfNeeded(source: string) {
  if (!document.pointerLockElement) return
  if (!pointerLockNeedsFreshCanvasGesture || hasRecentPointerLockUserGesture()) return
  // Once the user has successfully engaged pointer lock in this session, trust
  // subsequent transient lock events (browser-internal re-engage after Esc,
  // focus/visibility races during the startup window). The wrapper still blocks
  // initial untrusted requests via shouldAllowPointerLockRequest.
  if (pointerLockWasActive) return
  forceExitUnexpectedPointerLock(source)
}

function installPointerLockReentryGuard() {
  if (pointerLockGuardState.installed) return
  pointerLockGuardState.installed = true

  window.__CS_POINTER_LOCK_GUARD__ = {
    snapshot: () => ({ ...pointerLockGuardState }),
  }

  for (const eventName of ['pointerdown', 'mousedown', 'click']) {
    document.addEventListener(eventName, noteTrustedCanvasGesture, { capture: true, passive: true })
  }

  const elementPrototype = Element.prototype as PointerLockRequestElement
  const originalRequestPointerLock = elementPrototype.requestPointerLock
  if (typeof originalRequestPointerLock === 'function') {
    Object.defineProperty(elementPrototype, 'requestPointerLock', {
      configurable: true,
      writable: true,
      value(this: Element, options?: PointerLockOptions) {
        pointerLockGuardState.requestAttempts++
        const decision = shouldAllowPointerLockRequest(this)
        if (!decision.allowed) {
          noteBlockedPointerLockRequest('requestPointerLock', this, decision.reason ?? 'blocked')
          return Promise.resolve()
        }
        noteAllowedPointerLockRequest('requestPointerLock', this)
        // Request unadjusted (raw) mouse deltas so the engine receives 1:1 motion
        // without OS-level acceleration/DPI scaling. Falls back if the platform
        // can't honor the option (Chrome rejects with NotSupportedError).
        const withUnadjusted: PointerLockOptions = { ...(options ?? {}), unadjustedMovement: true }
        const result = originalRequestPointerLock.call(this, withUnadjusted)
        if (result && typeof (result as Promise<void>).then === 'function') {
          return (result as Promise<void>).then(
            () => { pointerLockGuardState.unadjustedMovement = 'enabled' },
            (err: unknown) => {
              const name = err instanceof Error ? err.name : ''
              if (name !== 'NotSupportedError') throw err
              pointerLockGuardState.unadjustedMovement = 'unsupported'
              const fallback = originalRequestPointerLock.call(this, options)
              return fallback ?? Promise.resolve()
            },
          )
        }
        pointerLockGuardState.unadjustedMovement = 'unknown'
        return Promise.resolve()
      },
    })
  }

  if (typeof elementPrototype.webkitRequestPointerLock === 'function') {
    const originalWebkitRequestPointerLock = elementPrototype.webkitRequestPointerLock
    Object.defineProperty(elementPrototype, 'webkitRequestPointerLock', {
      configurable: true,
      writable: true,
      value(this: Element) {
        pointerLockGuardState.requestAttempts++
        const decision = shouldAllowPointerLockRequest(this)
        if (!decision.allowed) {
          noteBlockedPointerLockRequest('webkitRequestPointerLock', this, decision.reason ?? 'blocked')
          return
        }
        noteAllowedPointerLockRequest('webkitRequestPointerLock', this)
        originalWebkitRequestPointerLock.call(this)
      },
    })
  }
}

function releaseExclusiveBrowserModesOnHidden() {
  if (!document.hidden) return
  markPointerLockNeedsFreshGesture()
  releaseExclusiveBrowserModes('visibility-hidden', true)
}

function handlePointerLockChange() {
  if (document.pointerLockElement) {
    // Only force-exit "untrusted" lock acquisitions BEFORE the user has ever
    // engaged lock this session. After the first trusted lock, browser-internal
    // re-engage (e.g. brief flap around Esc) or non-wrapper acquisition paths
    // are accepted — otherwise the guard fires on legitimate mid-play events.
    if (!pointerLockWasActive
        && pointerLockNeedsFreshCanvasGesture
        && !hasRecentPointerLockUserGesture()) {
      forceExitUnexpectedPointerLock('pointerlockchange-untrusted-lock')
      return
    }
    pointerLockWasActive = true
    pointerLockRecentlyReleased = false
    pointerLockNeedsFreshCanvasGesture = false
    pointerLockGuardState.needsFreshCanvasGesture = false
    return
  }

  markPointerLockNeedsFreshGesture()
  if (!pointerLockWasActive) return
  pointerLockRecentlyReleased = true
  releaseExclusiveBrowserModes('pointerlockchange-unlocked', false)
}

function handleWindowBlur() {
  if (pointerLockWasActive || pointerLockRecentlyReleased || document.pointerLockElement) {
    markPointerLockNeedsFreshGesture()
    pointerLockRecentlyReleased = true
    releaseExclusiveBrowserModes('window-blur', true)
  }
}

function handleWindowFocus() {
  releaseUnexpectedPointerLockIfNeeded('window-focus-untrusted-lock')
  if (pointerLockRecentlyReleased && !document.pointerLockElement) {
    releaseKeyboardLock()
    blurExclusiveFocusTarget()
    window.setTimeout(() => { pointerLockRecentlyReleased = false }, 250)
  }
  tryResumeAudioContext('focus')
}

function handleAudioVisibilityChange() {
  releaseExclusiveBrowserModesOnHidden()

  if (!audioBackendState.hiddenSuspendEnabled) {
    if (!document.hidden) tryResumeAudioContext('visibilitychange')
    return
  }

  if (document.hidden) {
    trySuspendAudioContext('visibilitychange')
    return
  }

  releaseUnexpectedPointerLockIfNeeded('visibility-visible-untrusted-lock')
  if (audioSuspendedForHiddenTab) {
    audioSuspendedForHiddenTab = false
    audioBackendState.suspendedForHiddenTab = false
  }
  tryResumeAudioContext('visibilitychange')
}

function instrumentAudioContext(context: AudioContext): AudioContext {
  if (instrumentedAudioContexts.has(context)) return context
  instrumentedAudioContexts.add(context)
  lastAudioContext = context
  audioBackendState.contextsCreated++

  let bridgeReady: Promise<boolean> | undefined
  if (audioBackendState.workletBridgeEnabled) {
    const unavailableReason = workletBridgeUnavailableReason(context)
    if (unavailableReason) {
      audioBackendState.lastError = unavailableReason
      audioBackendState.workletBridgeFailed = true
      audioBackendState.workletBridgeStatus = 'fallback'
    } else {
      bridgeReady = setupWorkletBridge(context)
    }
  }

  try {
    const originalCreateScriptProcessor = context.createScriptProcessor
    context.createScriptProcessor = function (...args: Parameters<AudioContext['createScriptProcessor']>) {
      audioBackendState.scriptProcessorCalls++
      audioBackendState.lastScriptProcessorArgs = {
        bufferSize: args[0],
        numberOfInputChannels: args[1],
        numberOfOutputChannels: args[2],
      }

      if (
        audioBackendState.workletBridgeEnabled
        && !audioBackendState.workletBridgeFailed
        && bridgeReady
      ) {
        return createBridgeScriptProcessorNode(
          context,
          args,
          originalCreateScriptProcessor,
          bridgeReady,
        )
      }

      return originalCreateScriptProcessor.apply(this, args)
    }
  } catch (error) {
    audioBackendState.lastError = error instanceof Error ? error.message : String(error)
  }

  try {
    context.addEventListener('statechange', () => { lastAudioContext = context })
  } catch {
    // diagnostics only
  }

  return context
}

function copyAudioContextConstructorProperties(
  target: AudioContextConstructor,
  source: AudioContextConstructor,
) {
  Object.setPrototypeOf(target, source)
  for (const key of Reflect.ownKeys(source)) {
    if (key === 'length' || key === 'name' || key === 'prototype') continue
    const descriptor = Object.getOwnPropertyDescriptor(source, key)
    if (!descriptor) continue
    try {
      Object.defineProperty(target, key, descriptor)
    } catch {
      // Some browser-owned constructor properties are intentionally locked.
    }
  }
}

// ---------------------------------------------------------------------------
// Settings helpers
// ---------------------------------------------------------------------------

function parseBooleanFlag(value: unknown, defaultValue: boolean): boolean {
  if (value == null || value === '') return defaultValue
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  const normalized = String(value).trim().toLowerCase()
  if (['1', 'true', 'yes', 'on', 'enabled'].includes(normalized)) return true
  if (['0', 'false', 'no', 'off', 'disabled'].includes(normalized)) return false
  return defaultValue
}

function readStorageSetting(name: string): string | null {
  try {
    return sessionStorage.getItem(name) ?? localStorage.getItem(name)
  } catch {
    return null
  }
}

function readSetting(name: string, queryNames: string[], envValue?: string): string | undefined {
  const globalValue = (window as unknown as Record<string, unknown>)[name]
  if (globalValue != null) return String(globalValue)

  const query = new URLSearchParams(window.location.search)
  for (const queryName of queryNames) {
    if (query.has(queryName)) return query.get(queryName) ?? ''
  }

  const storageValue = readStorageSetting(name)
  if (storageValue != null) return storageValue

  return envValue
}

function readBooleanSetting(
  name: string,
  queryNames: string[],
  envValue: string | undefined,
  defaultValue: boolean,
): boolean {
  return parseBooleanFlag(readSetting(name, queryNames, envValue), defaultValue)
}

function readNumberSetting(
  name: string,
  queryNames: string[],
  envValue: string | undefined,
  defaultValue: number | undefined,
): number | undefined {
  const raw = readSetting(name, queryNames, envValue)
  if (raw == null || raw === '') return defaultValue
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue
}

function readLatencyHintSetting(): AudioContextOptions['latencyHint'] | undefined {
  const raw = readSetting(
    '__CS_AUDIO_CONTEXT_LATENCY_HINT',
    ['cs_audio_latency_hint', 'audio_latency_hint'],
    buildEnv.VITE_CS_AUDIO_CONTEXT_LATENCY_HINT,
  )
  if (raw == null || raw === '') return undefined
  const normalized = raw.trim().toLowerCase()
  if (normalized === 'interactive' || normalized === 'balanced' || normalized === 'playback') return normalized
  const parsed = Number(normalized)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined
}

// ---------------------------------------------------------------------------
// Main audio initialisation — runs before Xash/SDL opens audio
// ---------------------------------------------------------------------------

function installAudioContextHints() {
  const enabled = readBooleanSetting(
    '__CS_AUDIO_CONTEXT_HINTS',
    ['cs_audio_context_hints', 'audio_context_hints', 'audioctx'],
    buildEnv.VITE_CS_AUDIO_CONTEXT_HINTS,
    false,
  )

  const workletBridgeEnabled = readBooleanSetting(
    '__CS_AUDIO_WORKLET_BRIDGE',
    ['awbridge', 'cs_audio_worklet_bridge'],
    buildEnv.VITE_CS_AUDIO_WORKLET_BRIDGE,
    false,
  )

  const hiddenSuspendEnabled = readBooleanSetting(
    '__CS_AUDIO_HIDDEN_SUSPEND',
    ['raf_hidden_mute', 'audio_hidden_suspend', 'cs_audio_hidden_suspend'],
    buildEnv.VITE_CS_AUDIO_HIDDEN_SUSPEND,
    true,
  )

  const requestedSampleRate = enabled
    ? readNumberSetting(
      '__CS_AUDIO_CONTEXT_SAMPLE_RATE',
      ['cs_audio_sample_rate', 'audio_sample_rate'],
      buildEnv.VITE_CS_AUDIO_CONTEXT_SAMPLE_RATE,
      22050,
    )
    : undefined
  const requestedLatencyHint = enabled ? (readLatencyHintSetting() ?? 'playback') : undefined

  audioBackendState.enabled = enabled
  audioBackendState.workletBridgeEnabled = workletBridgeEnabled
  audioBackendState.workletBridgeStatus = workletBridgeEnabled ? 'pending' : 'disabled'
  audioBackendState.hiddenSuspendEnabled = hiddenSuspendEnabled
  audioBackendState.requestedSampleRate = requestedSampleRate
  audioBackendState.requestedLatencyHint = requestedLatencyHint

  window.__CS_AUDIO_BACKEND__ = {
    snapshot: audioContextSnapshot,
    resumeNow: () => tryResumeAudioContext('manual'),
    suspendNow: () => trySuspendAudioContext('manual'),
  }

  for (const eventName of ['click', 'keydown', 'touchstart', 'mousedown', 'pointerdown']) {
    document.addEventListener(eventName, () => tryResumeAudioContext(eventName), { passive: true })
  }
  document.addEventListener('pointerlockchange', handlePointerLockChange)
  document.addEventListener('visibilitychange', handleAudioVisibilityChange)
  window.addEventListener('blur', handleWindowBlur)
  window.addEventListener('focus', handleWindowFocus)

  let attempts = 0
  const interval = window.setInterval(() => {
    attempts++
    tryResumeAudioContext('boot-interval')
    const context = getAudioContextForResume()
    if (attempts >= 60 || context?.state === 'running') window.clearInterval(interval)
  }, 500)

  // If nothing needs the AudioContext wrapper, still expose diagnostics and resume hooks.
  if (!enabled && !workletBridgeEnabled && !hiddenSuspendEnabled) {
    audioBackendState.installReason = 'disabled'
    return
  }

  const OriginalAudioContext = window.AudioContext ?? window.webkitAudioContext
  if (!OriginalAudioContext) {
    audioBackendState.installReason = 'missing-audio-context'
    return
  }

  const WrappedAudioContext = function (options?: AudioContextOptions) {
    audioBackendState.constructorCalls++
    const requestedOptions: AudioContextOptions = {
      ...(options && typeof options === 'object' ? options : {}),
    }
    if (requestedSampleRate != null) requestedOptions.sampleRate = requestedSampleRate
    if (requestedLatencyHint != null) requestedOptions.latencyHint = requestedLatencyHint

    try {
      return instrumentAudioContext(new OriginalAudioContext(requestedOptions))
    } catch (error) {
      audioBackendState.constructorFallbacks++
      audioBackendState.lastError = error instanceof Error ? error.message : String(error)
      const fallbackOptions: AudioContextOptions = {}
      if (requestedLatencyHint != null) fallbackOptions.latencyHint = requestedLatencyHint
      return instrumentAudioContext(new OriginalAudioContext(fallbackOptions))
    }
  } as unknown as AudioContextConstructor

  WrappedAudioContext.prototype = OriginalAudioContext.prototype
  copyAudioContextConstructorProperties(WrappedAudioContext, OriginalAudioContext)
  window.AudioContext = WrappedAudioContext
  window.webkitAudioContext = WrappedAudioContext
  audioBackendState.installed = true
  audioBackendState.installReason = enabled || workletBridgeEnabled ? 'installed' : 'hidden-suspend-only'
}

installAudioContextHints()
installPointerLockReentryGuard()

// ---------------------------------------------------------------------------
// Runtime globals and launch logic
// ---------------------------------------------------------------------------

const touchControls = document.getElementById('touchControls') as HTMLInputElement
touchControls.addEventListener('change', () => {
  localStorage.setItem('touchControls', String(touchControls.checked))
})

let usernamePromiseResolve: (name: string) => void
const usernamePromise = new Promise<string>(resolve => {
  usernamePromiseResolve = resolve
})

let runtimeStartResolved = false

function setLoadProgress(stage: string, percent: number) {
  window.__CS_LOAD_PROGRESS_SET?.(stage, percent)
}

function sanitizePlayerName(raw: string) {
  return raw.trim().slice(0, 24)
}

function sanitizeUserInfoValue(raw: unknown) {
  if (typeof raw !== 'string') return ''
  return raw.replace(/["\\;\n\r]/g, '').trim().slice(0, 192)
}

function clampRuntimeNumber(raw: unknown, fallback: number, min: number, max: number) {
  const value = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(value)) return fallback
  return Math.max(min, Math.min(max, value))
}

function formatRuntimeNumber(value: number) {
  return Number(value.toFixed(4)).toString()
}

function getLaunchGameSettings() {
  return window.__CS_RUNTIME_LAUNCH?.gameSettings
}

function parseResolutionPreset(raw: unknown) {
  if (typeof raw !== 'string' || raw === 'default') return null
  const match = /^(\d{3,4})x(\d{3,4})$/.exec(raw)
  if (!match) return null
  const width = Number(match[1])
  const height = Number(match[2])
  if (!Number.isInteger(width) || !Number.isInteger(height)) return null
  if (width < 640 || width > 3840 || height < 480 || height > 2160) return null
  return { width, height }
}

function buildRuntimeArguments(baseArgs: string[]) {
  const resolution = parseResolutionPreset(getLaunchGameSettings()?.resolution)
  if (!resolution) return baseArgs

  const argsWithoutResolution: string[] = []
  for (let index = 0; index < baseArgs.length; index += 1) {
    const arg = baseArgs[index]
    if (arg === '-width' || arg === '-height') {
      index += 1
      continue
    }
    argsWithoutResolution.push(arg)
  }

  return [
    ...argsWithoutResolution,
    '-width',
    String(resolution.width),
    '-height',
    String(resolution.height),
  ]
}

function applyRuntimeGameSettings(x: Xash3DWebRTC) {
  const settings = getLaunchGameSettings()
  const commands = [
    'm_rawinput 1',
    'm_customaccel 0',
    'hud_fastswitch 1',
  ]

  if (settings) {
    const mouseSensitivity = clampRuntimeNumber(settings.mouseSensitivity, 3, 0.1, 20)
    const soundVolume = clampRuntimeNumber(settings.soundVolume, 0.7, 0, 1)
    const brightness = clampRuntimeNumber(settings.brightness, 0, 0, 3)
    const screenWidth = Math.round(clampRuntimeNumber(settings.screenWidth, 100, 80, 120))
    const invertedMouse = settings.invertedMouse === true
    const viewmodelHand = settings.viewmodelHand === 'left' ? 0 : 1

    commands.push(
      `sensitivity ${formatRuntimeNumber(mouseSensitivity)}`,
      `volume ${formatRuntimeNumber(soundVolume)}`,
      `brightness ${formatRuntimeNumber(brightness)}`,
      `viewsize ${screenWidth}`,
      `m_pitch ${invertedMouse ? '-0.022' : '0.022'}`,
      `cl_righthand ${viewmodelHand}`,
    )
  }

  commands.forEach((command) => x.Cmd_ExecuteString(command))
}

function applyWagerUserInfo(x: Xash3DWebRTC) {
  const wager = window.__CS_RUNTIME_LAUNCH?.wager
  if (!wager) return

  const pairs = [
    ['_csw_join', wager.joinToken],
    ['_csw_session', wager.sessionId],
    ['_csw_user', wager.userId],
    ['_csw_wallet', wager.walletAddress],
  ] as const

  pairs.forEach(([key, rawValue]) => {
    const value = sanitizeUserInfoValue(rawValue)
    if (value) x.Cmd_ExecuteString(`setinfo ${key} "${value}"`)
  })
}

function applyVoteKickAuthUserInfo(x: Xash3DWebRTC) {
  const launch = window.__CS_RUNTIME_LAUNCH
  if (!launch?.account?.userId) return

  const launchToken = sanitizeUserInfoValue(launch.launchToken)
  if (launchToken) x.Cmd_ExecuteString(`setinfo _csvote_launch "${launchToken}"`)
}

function hideLegacyLaunchUi() {
  const form     = document.getElementById('form')     as HTMLFormElement | null
  const social   = document.getElementById('social')   as HTMLDivElement | null
  const progress = document.getElementById('progress') as HTMLProgressElement | null
  const logo     = document.getElementById('logo')     as HTMLImageElement | null
  if (form)     form.style.display   = 'none'
  if (social)   social.style.display = 'none'
  if (progress) progress.style.opacity = '0'
  if (logo)     logo.style.opacity   = '0'
}

function beginRuntimeLaunch(playerName: string) {
  const normalized = sanitizePlayerName(playerName)
  if (!normalized) return false
  if (runtimeStartResolved) return true

  runtimeStartResolved = true
  localStorage.setItem('username', normalized)
  hideLegacyLaunchUi()
  setLoadProgress('downloading', 0)
  usernamePromiseResolve(normalized)
  return true
}

function stripBspExtension(raw?: string | null) {
  return (raw ?? '').replace(/\.bsp$/i, '')
}

function withAssetVersion(url: string) {
  const separator = url.includes('?') ? '&' : '?'
  return `${url}${separator}v=${RUNTIME_ASSET_VERSION}`
}

function activeRuntimeSpray() {
  const spray = window.__CS_RUNTIME_LAUNCH?.account?.activeSpray
  if (!spray || typeof spray !== 'object') return null

  const wadUrl = typeof spray.wadUrl === 'string' ? spray.wadUrl : ''
  const wadSha256 = typeof spray.wadSha256 === 'string' ? spray.wadSha256.toLowerCase() : ''
  const wadSizeBytes = Number(spray.wadSizeBytes)
  if (
    !wadUrl ||
    !/^[a-f0-9]{64}$/.test(wadSha256) ||
    !Number.isFinite(wadSizeBytes) ||
    wadSizeBytes <= 0
  ) {
    return null
  }

  return {
    assetId: typeof spray.assetId === 'string' ? spray.assetId : 'unknown',
    wadUrl,
    wadSha256,
    wadSizeBytes: Math.floor(wadSizeBytes),
  } satisfies ActiveRuntimeSpray
}

function bytesToHex(bytes: ArrayBuffer) {
  return [...new Uint8Array(bytes)]
    .map(value => value.toString(16).padStart(2, '0'))
    .join('')
}

async function sha256ArrayBuffer(buffer: ArrayBuffer) {
  if (!window.crypto?.subtle) {
    throw new Error('crypto.subtle is unavailable')
  }
  return bytesToHex(await window.crypto.subtle.digest('SHA-256', buffer))
}

async function mountActiveSprayWad(em: Xash3DWebRTC['em']) {
  const spray = activeRuntimeSpray()
  sprayDebugState.activeSpray = spray
  sprayDebugState.mounted = false
  sprayDebugState.mountPaths = []
  sprayDebugState.fsSizes = {}
  sprayDebugState.error = undefined

  if (!spray) {
    recordSprayDebug('mount-skipped', { reason: 'no-active-spray' })
    return
  }
  if (!em) {
    recordSprayDebug('mount-skipped', { reason: 'missing-emscripten-module' })
    return
  }

  try {
    recordSprayDebug('fetch-start', {
      assetId: spray.assetId,
      wadUrl: spray.wadUrl,
      expectedBytes: spray.wadSizeBytes,
      expectedSha256: spray.wadSha256,
    })
    setLoadProgress('custom_spray', 0.15)
    const response = await fetch(spray.wadUrl, {
      cache: 'force-cache',
      credentials: 'omit',
    })
    if (!response.ok) {
      throw new Error(`spray WAD fetch returned ${response.status}`)
    }

    const buffer = await response.arrayBuffer()
    recordSprayDebug('fetch-complete', {
      assetId: spray.assetId,
      status: response.status,
      bytes: buffer.byteLength,
    })
    if (buffer.byteLength !== spray.wadSizeBytes) {
      throw new Error(`spray WAD size mismatch (${buffer.byteLength} !== ${spray.wadSizeBytes})`)
    }

    setLoadProgress('custom_spray', 0.65)
    const hash = await sha256ArrayBuffer(buffer)
    if (hash !== spray.wadSha256) {
      throw new Error('spray WAD SHA-256 mismatch')
    }

    const fs = em.FS as typeof em.FS & { stat: (path: string) => { size: number } }
    fs.mkdirTree('/rodir/cstrike')
    const bytes = new Uint8Array(buffer)
    SPRAY_WAD_RUNTIME_PATHS.forEach(path => {
      fs.writeFile(path, bytes)
      sprayDebugState.mountPaths.push(path)
      sprayDebugState.fsSizes[path] = fs.stat(path).size
    })
    sprayDebugState.mounted = true
    setLoadProgress('custom_spray', 1)
    recordSprayDebug('mount-complete', {
      assetId: spray.assetId,
      sizeBytes: spray.wadSizeBytes,
      paths: [...sprayDebugState.mountPaths],
      fsSizes: { ...sprayDebugState.fsSizes },
    })
  } catch (error) {
    sprayDebugState.error = error instanceof Error ? error.message : String(error)
    recordSprayDebug('mount-error', { error: sprayDebugState.error })
    console.warn('[RuntimeLaunch] active spray was not mounted', error)
  }
}

function installRuntimeGlobals(x: Xash3DWebRTC) {
  window.__xash = x
  window.__CS_CAMERA_ACTIVE = new URLSearchParams(window.location.search).get('camera') === '1'
  window.__CS_CAMERA = {
    ready: () => true,
    exec: (command: unknown) => {
      const normalized = String(command ?? '').trim()
      if (!normalized) return false
      x.Cmd_ExecuteString(normalized)
      return true
    },
    setMode: (mode: unknown) => {
      const normalized = Math.max(1, Math.min(6, Math.floor(Number(mode))))
      x.Cmd_ExecuteString(`specmode ${normalized}`)
      x.Cmd_ExecuteString(`spec_mode ${normalized}`)
      return true
    },
    cycleTeam: (team?: unknown) => {
      const raw    = String(team ?? 'any').trim().toLowerCase()
      const target = raw === 'ct' || raw === 't' ? raw : 'any'
      x.Cmd_ExecuteString(`spec_cycle_team ${target}`)
      return { ok: true, targetChanged: true }
    },
  }
}

function applyCounterSolNativeUiSuppression(x: Xash3DWebRTC) {
  const commands = [
    'hideweapon 127',
    'cl_hidehud 127',
    'crosshair 0',
    'con_notifytime 0',
    '_vgui_menus 0',
    'cl_hide_motd 1',
  ]

  for (const command of commands) {
    x.Cmd_ExecuteString(command)
  }
}

function createNativeFsSummary(): NativeStallFsSummary {
  return { count: 0, misses: 0, totalMs: 0, top: [] }
}

function addNativeFsEvent(summary: NativeStallFsSummary, event: NativeStallFsEvent) {
  const ms = Number(event.ms)
  const normalized = {
    op: String(event.op ?? ''),
    path: String(event.path ?? ''),
    mode: String(event.mode ?? ''),
    hit: Boolean(event.hit),
    ms: Number.isFinite(ms) && ms >= 0 ? ms : 0,
  }

  summary.count++
  summary.totalMs += normalized.ms
  if (!normalized.hit) summary.misses++

  const interesting = !normalized.hit || normalized.ms >= 0.2
  if (!interesting) return

  if (summary.top.length < 24) {
    summary.top.push(normalized)
    return
  }

  let replaceIndex = 0
  for (let i = 1; i < summary.top.length; i++) {
    if (summary.top[i].ms < summary.top[replaceIndex].ms) replaceIndex = i
  }
  if (normalized.ms > summary.top[replaceIndex].ms) summary.top[replaceIndex] = normalized
}

function formatNativeFsSummary(summary: NativeStallFsSummary) {
  const top = [...summary.top]
    .sort((a, b) => b.ms - a.ms)
    .slice(0, 8)
    .map(event => {
      const status = event.hit ? 'hit' : 'miss'
      const mode = event.mode ? ` ${event.mode}` : ''
      return `${event.op}${mode} ${status} ${event.ms.toFixed(2)}ms ${event.path}`
    })

  const head =
    `[NATIVE_FS] ops=${summary.count}` +
    ` misses=${summary.misses}` +
    ` total=${summary.totalMs.toFixed(2)}ms`

  return top.length ? `${head} | top: ${top.join(' | ')}` : head
}

function createNativeRenderSummary(): NativeStallRenderSummary {
  return { count: 0, totalMs: 0, phases: [] }
}

function addNativeRenderEvent(summary: NativeStallRenderSummary, event: NativeStallRenderEvent) {
  const name = String(event.name ?? '').trim()
  const ms = Number(event.ms)
  const normalizedMs = Number.isFinite(ms) && ms >= 0 ? ms : 0
  if (!name) return

  summary.count++
  summary.totalMs += normalizedMs

  const existing = summary.phases.find(phase => phase.name === name)
  if (existing) {
    existing.ms += normalizedMs
    existing.count++
    return
  }

  summary.phases.push({ name, ms: normalizedMs, count: 1 })
}

function formatNativeRenderSummary(summary: NativeStallRenderSummary) {
  const top = [...summary.phases]
    .sort((a, b) => b.ms - a.ms)
    .slice(0, 10)
    .map(phase => {
      const count = phase.count > 1 ? `x${phase.count}` : ''
      return `${phase.name}${count}=${phase.ms.toFixed(2)}ms`
    })

  const head = `[NATIVE_RENDER] ops=${summary.count} total=${summary.totalMs.toFixed(2)}ms`
  return top.length ? `${head} | top: ${top.join(' | ')}` : head
}

const DEFAULT_STALL_LOG_LIMIT = 256
let stallLogEntries: StallLogEntry[] = []
let stallLogLimit = DEFAULT_STALL_LOG_LIMIT
let stallLogConsoleEnabled = false

function installStallLogBuffer(limit: number, consoleEnabled: boolean) {
  stallLogLimit = Math.max(16, Math.min(1000, Math.floor(limit || DEFAULT_STALL_LOG_LIMIT)))
  stallLogConsoleEnabled = consoleEnabled

  window.__CS_STALL_LOGS = {
    get entries() {
      return [...stallLogEntries]
    },
    get consoleEnabled() {
      return stallLogConsoleEnabled
    },
    text(limit = stallLogLimit) {
      const count = Math.max(1, Math.floor(limit || stallLogLimit))
      return stallLogEntries.slice(-count).map(entry => entry.line).join('\n')
    },
    dump(limit = stallLogLimit) {
      const text = window.__CS_STALL_LOGS?.text(limit) ?? ''
      console.log(text || '[CS_STALL_LOGS] empty')
      return text
    },
    clear() {
      stallLogEntries = []
    },
    setConsole(enabled: boolean) {
      stallLogConsoleEnabled = Boolean(enabled)
    },
  }
}

function pushStallLog(kind: StallLogKind, line: string) {
  stallLogEntries.push({
    kind,
    timeMs: performance.now(),
    line,
  })

  if (stallLogEntries.length > stallLogLimit) {
    stallLogEntries.splice(0, stallLogEntries.length - stallLogLimit)
  }

  if (stallLogConsoleEnabled) {
    console.warn(line)
  }
}

function installModuleLogProgressHooks() {
  const moduleRef = (window.Module ??= {})
  if (moduleRef.__csLoadProgressHooked) return

  moduleRef.__csLoadProgressHooked = true
  const previousPrint    = moduleRef.print
  const previousPrintErr = moduleRef.printErr
  let loadingMapProgress = 0

  const stallDebug = readSetting('stall_debug', ['stall_debug'], undefined) != null
  const stallTrace = readSetting('stall_trace', ['stall_trace'], undefined) != null
  const stallTraceConsole = readBooleanSetting(
    '__CS_STALL_TRACE_CONSOLE',
    ['stall_trace_console'],
    buildEnv.VITE_CS_STALL_TRACE_CONSOLE,
    false,
  )
  const nativeStallTraceRaw = readSetting(
    '__CS_NATIVE_STALL_TRACE',
    ['native_stall_trace', 'native_stall'],
    buildEnv.VITE_CS_NATIVE_STALL_TRACE,
  )
  const nativeStallTrace = nativeStallTraceRaw != null
    ? parseBooleanFlag(nativeStallTraceRaw, true)
    : false
  const nativeStallThresholdMs = readNumberSetting(
    '__CS_NATIVE_STALL_THRESHOLD_MS',
    ['native_stall_threshold_ms', 'native_stall_ms'],
    buildEnv.VITE_CS_NATIVE_STALL_THRESHOLD_MS,
    20,
  ) ?? 20
  const nativeStallConsole = readBooleanSetting(
    '__CS_NATIVE_STALL_CONSOLE',
    ['native_stall_console'],
    buildEnv.VITE_CS_NATIVE_STALL_CONSOLE,
    false,
  )
  const stallLogLimitSetting = readNumberSetting(
    '__CS_STALL_LOG_LIMIT',
    ['stall_log_limit'],
    buildEnv.VITE_CS_STALL_LOG_LIMIT,
    DEFAULT_STALL_LOG_LIMIT,
  ) ?? DEFAULT_STALL_LOG_LIMIT

  installStallLogBuffer(stallLogLimitSetting, stallTraceConsole || nativeStallConsole)
  // Patterns that flood every frame and drown out useful output
  const stallDebugNoise = /NET_QueuePacket|No such file or directory from 127\./

  const handleRuntimeLog = (value: unknown) => {
    const line = String(value ?? '').trim()
    if (!line) return
    if (stallDebug && !stallDebugNoise.test(line)) {
      console.log(`[xash ${performance.now().toFixed(1)}ms] ${line}`)
    }
    if (!/precaching|spawn server|loading map|begin loading|resource/i.test(line)) return

    loadingMapProgress = Math.min(0.96, loadingMapProgress + 0.18)
    const mapName = stripBspExtension(window.__mapName)
    setLoadProgress(mapName ? `loading_map ${mapName}` : 'loading_map', loadingMapProgress)
  }

  moduleRef.print    = (value: unknown) => { handleRuntimeLog(value); previousPrint?.(value) }
  moduleRef.printErr = (value: unknown) => { handleRuntimeLog(value); previousPrintErr?.(value) }

  moduleRef.__nativeStallTraceEnabled = nativeStallTrace
  moduleRef.__nativeStallTraceThresholdMs = nativeStallThresholdMs

  if (nativeStallTrace) {
    const callbacks = (moduleRef.callbacks ??= {})
    let fsSummary = createNativeFsSummary()
    let renderSummary = createNativeRenderSummary()

    console.info(
      '[NATIVE_STALL] buffering enabled. After reproducing a stall, run copy(__CS_STALL_LOGS.text())'
    )

    callbacks.nativeStallFrameBegin = () => {
      fsSummary = createNativeFsSummary()
      renderSummary = createNativeRenderSummary()
    }
    callbacks.nativeStallFs = event => {
      addNativeFsEvent(fsSummary, event)
    }
    callbacks.nativeStallRender = event => {
      addNativeRenderEvent(renderSummary, event)
    }
    callbacks.nativeStallTrace = line => {
      pushStallLog('native', line)
      if (renderSummary.count > 0) {
        pushStallLog('render', formatNativeRenderSummary(renderSummary))
        renderSummary = createNativeRenderSummary()
      }
      if (fsSummary.count > 0) {
        pushStallLog('fs', formatNativeFsSummary(fsSummary))
        fsSummary = createNativeFsSummary()
      }
    }
  }

  // Per-tick timing: when ?stall_trace=1, log ticks that exceed 20ms.
  // preMainLoop/postMainLoop are picked up by MainLoop.init() inside setMainLoop
  // and called before/after each callUserCallback(). They must be set before x.main().
  if (stallTrace) {
    let tickStart = 0
    let heavyCount = 0
    let totalTicks = 0
    moduleRef.preMainLoop = () => { tickStart = performance.now() }
    moduleRef.postMainLoop = () => {
      const dt = performance.now() - tickStart
      totalTicks++
      if (dt > 20) {
        heavyCount++
        pushStallLog(
          'tick',
          `[STALL ${tickStart.toFixed(1)}ms] tick took ${dt.toFixed(1)}ms` +
          ` | heavy: ${heavyCount}/${totalTicks} (${(100*heavyCount/totalTicks).toFixed(1)}%)`
        )
      }
    }
  }
}

async function fetchWithProgress(url: string) {
  const progress = document.getElementById('progress') as HTMLProgressElement | null
  const res      = await fetch(url)

  const contentLength = res.headers.get('Content-Length')
  const total         = contentLength ? parseInt(contentLength, 10) : null
  const reader        = res.body!.getReader()
  const chunks        = []
  let received        = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    chunks.push(value)
    received += value.length

    if (total !== null) {
      const nextValue = received / total
      if (progress) progress.value = nextValue
      setLoadProgress('downloading', nextValue)
    } else if (progress) {
      progress.value = received
    }
  }

  if (progress) progress.style.opacity = '0'
  setLoadProgress('downloading', 1)

  const blob = new Blob(chunks)
  return blob.arrayBuffer()
}

// Roles carried by the asset manifest's runtime (WASM engine) packs, tagged
// `role:<x>`. Mirrors RUNTIME_MODULE_PACKS in the control-plane seed data.
const RUNTIME_MODULE_ROLES = ['client', 'server', 'menu', 'filesystem', 'xash', 'gl4es'] as const
type RuntimeModuleRole = (typeof RUNTIME_MODULE_ROLES)[number]

// Map each engine module to the content-addressed CDN URL the control plane
// published for it (kind:'runtime' packs in window.__CS_RUNTIME_ASSET_MANIFEST,
// installed by index.patched.html before the runtime starts). This moves the
// ~2.5 MB of WASM off the slow same-origin proxy on cold loads. Unpublished
// modules are dropped from the manifest upstream, so they are simply absent
// here and the caller keeps its same-origin default.
function runtimeModuleCdnUrls(): Partial<Record<RuntimeModuleRole, string>> {
  const out: Partial<Record<RuntimeModuleRole, string>> = {}
  try {
    const manifest = (window as unknown as {
      __CS_RUNTIME_ASSET_MANIFEST?: { packs?: Array<{ kind?: string; url?: string; tags?: string[] }> }
    }).__CS_RUNTIME_ASSET_MANIFEST
    const packs = manifest?.packs
    if (!Array.isArray(packs)) return out
    for (const pack of packs) {
      if (!pack || pack.kind !== 'runtime' || typeof pack.url !== 'string') continue
      const roleTag = (pack.tags ?? []).find((t) => typeof t === 'string' && t.startsWith('role:'))
      const role = roleTag?.slice('role:'.length) as RuntimeModuleRole | undefined
      if (!role || !RUNTIME_MODULE_ROLES.includes(role)) continue
      // Belt-and-suspenders: only accept an absolute, cross-origin CDN URL.
      try {
        const u = new URL(pack.url)
        if ((u.protocol === 'https:' || u.protocol === 'http:') && u.origin !== window.location.origin) {
          out[role] = pack.url
        }
      } catch { /* ignore malformed url */ }
    }
  } catch { /* manifest not ready / unexpected shape → no CDN overrides */ }
  return out
}

function withBootTimeout<T>(promise: Promise<T>, label: string, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error(`${label} did not complete within ${timeoutMs}ms`))
    }, timeoutMs)
    promise.then(
      value => {
        window.clearTimeout(timer)
        resolve(value)
      },
      error => {
        window.clearTimeout(timer)
        reject(error)
      },
    )
  })
}

function installGameReadyGate(moduleRef: NonNullable<Window['Module']>) {
  let fired = false
  let resolveReady!: () => void
  const ready = new Promise<void>(resolve => {
    resolveReady = resolve
  })
  const callbacks = (moduleRef.callbacks ??= {})
  const previousGameReady = callbacks.gameReady
  callbacks.gameReady = () => {
    previousGameReady?.()
    if (fired) return
    fired = true
    console.info('[RuntimeBoot] engine gameReady')
    resolveReady()
  }
  return ready
}

function reportRuntimeBootFailure(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  console.error('[RuntimeBoot] fatal', error)
  window.__CS_RUNTIME_BOOT_FAILED?.(`Client startup failed: ${message}`)
}

async function main() {
  const config = await fetch('/config').then(res => res.json()) as Awaited<{
    arguments: string[];
    console: string[];
    game_dir: string;
    libraries: {
      client: string;
      server: string;
      extras: string;
      menu: string;
      filesystem: string;
    };
    dynamic_libraries: string[];
    files_map: Record<string, string>;
  }>

  const username = await usernamePromise
  installModuleLogProgressHooks()
  const moduleRef = (window.Module ??= {})
  const gameReadyPromise = installGameReadyGate(moduleRef)

  // Prefer CDN URLs for the WASM engine modules when the manifest published
  // them; otherwise fall back to the same-origin /config + Vite-bundled paths.
  const cdn = runtimeModuleCdnUrls()

  const runtimeOptions = {
    canvas: document.getElementById('canvas') as HTMLCanvasElement,
    arguments: buildRuntimeArguments(config.arguments || ['-windowed']),
    libraries: {
      filesystem: cdn.filesystem ?? config.libraries.filesystem,
      xash: cdn.xash ?? xashURL,
      menu: cdn.menu ?? config.libraries.menu,
      server: cdn.server ?? config.libraries.server,
      client: cdn.client ?? withAssetVersion(config.libraries.client),
      render: {
        gl4es: cdn.gl4es ?? gl4esURL,
      }
    },
    dynamicLibraries: config.dynamic_libraries,
    filesMap: config.files_map,
    module: moduleRef,
  } as ConstructorParameters<typeof Xash3DWebRTC>[0]

  const x = new Xash3DWebRTC(runtimeOptions)

  // Engine setup and transport negotiation are independent. Starting both now
  // avoids the old circular wait where x.main() was held behind WebRTC while
  // onRuntimeInitialized could only fire after x.main().
  const engineInitPromise = withBootTimeout(x.init(), 'Engine initialization', 25_000)
  const transportPromise = x.connect()
  // Attach a rejection handler immediately; the same promise is awaited after
  // assets are mounted, but a quick ICE failure must not become "unhandled".
  void transportPromise.catch(() => {})
  setLoadProgress('initializing', 0.35)

  const [zip, extras] = await Promise.all([
    (async () => {
      const res = await fetchWithProgress(`valve.zip?v=${RUNTIME_ASSET_VERSION}`)
      return await loadAsync(res)
    })(),
    (async () => {
      const res = await fetch(config.libraries.extras)
      return await res.arrayBuffer()
    })(),
    engineInitPromise,
  ])

  setLoadProgress('initializing', 1)

  const em = x.em
  if (!em) throw new Error('Xash runtime initialized without Emscripten interface')

  const files       = Object.entries(zip.files).filter(([, file]) => !file.dir)
  const totalFiles  = Math.max(1, files.length)
  let extractedFiles = 0

  setLoadProgress('extracting', 0)
  for (const [filename, file] of files) {
    const path = '/rodir/' + filename
    const dir  = path.split('/').slice(0, -1).join('/')
    em.FS.mkdirTree(dir)
    em.FS.writeFile(path, await file.async('uint8array'))
    extractedFiles++
    setLoadProgress('extracting', extractedFiles / totalFiles)
  }

  em.FS.mkdirTree(`/rodir/${config.game_dir}`)
  em.FS.writeFile(`/rodir/${config.game_dir}/extras.pk3`, new Uint8Array(extras))
  em.FS.mkdirTree('/rodir/cstrike/maps')
  await window.__mapReady
  if (window.__mapBytes && window.__mapName) {
    em.FS.writeFile(`/rodir/cstrike/maps/${window.__mapName}`, new Uint8Array(window.__mapBytes))
  }
  await mountActiveSprayWad(em)
  em.FS.chdir('/rodir')

  const logo = document.getElementById('logo') as HTMLImageElement | null
  if (logo) {
    logo.style.animationName           = 'pulsate-end'
    logo.style.animationFillMode       = 'forwards'
    logo.style.animationIterationCount = '1'
    logo.style.animationDirection      = 'normal'
  }

  installRuntimeGlobals(x)
  // Restore HUD bridge compatibility: new Emscripten no longer sets globalThis.LDSO.
  // The em object now exposes it; expose it globally before the main loop starts.
  const globalRecord = globalThis as unknown as Record<string, unknown>
  if (x.em && !globalRecord.LDSO) {
    globalRecord.LDSO = (x.em as unknown as Record<string, unknown>).LDSO
  }
  x.main()

  setLoadProgress('connecting', 0.5)
  await Promise.all([
    withBootTimeout(gameReadyPromise, 'Engine gameReady', 20_000),
    transportPromise,
  ])

  // The command pool and both WebRTC data channels are now ready.
  x.Cmd_ExecuteString('gl_check_errors 0')
  applyCounterSolNativeUiSuppression(x)
  x.Cmd_ExecuteString('cl_allowupload 1')
  x.Cmd_ExecuteString('cl_allowdownload 1')
  x.Cmd_ExecuteString('cl_download_ingame 1')
  recordSprayDebug('client-cvars-applied', {
    cl_allowupload: 1,
    cl_allowdownload: 1,
    cl_download_ingame: 1,
  })
  if (window.__CS_CAMERA_ACTIVE) {
    x.Cmd_ExecuteString('con_color "0 0 0"')
    x.Cmd_ExecuteString('con_alpha 0')
  }
  x.Cmd_ExecuteString(`touch_enable ${touchControls.checked ? 1 : 0}`)
  x.Cmd_ExecuteString(`name "${username}"`)
  applyVoteKickAuthUserInfo(x)
  applyWagerUserInfo(x)

  if (config.console && Array.isArray(config.console)) {
    config.console.forEach((cmd: string) => { x.Cmd_ExecuteString(cmd) })
  }
  applyRuntimeGameSettings(x)

  setLoadProgress('connecting', 1)
  x.Cmd_ExecuteString('connect 127.0.0.1:8080')

  window.addEventListener('pagehide', () => {
    trySuspendAudioContext('pagehide', {
      markHiddenTab: false,
      resumeIfVisibleAfterSuspend: false,
    })
  })
  window.addEventListener('pageshow', () => tryResumeAudioContext('pageshow'))
  window.addEventListener('beforeunload', (event) => {
    suspendAudioForPageExitPrompt('beforeunload')
    event.preventDefault()
    event.returnValue = ''
    return ''
  })
}

window.__CS_START_RUNTIME = beginRuntimeLaunch

const enableTouch = localStorage.getItem('touchControls')
if (enableTouch === null) {
  const isMobile = !window.matchMedia('(hover: hover)').matches
  touchControls.checked = isMobile
  localStorage.setItem('touchControls', String(isMobile))
} else {
  touchControls.checked = enableTouch === 'true'
}

const username = sanitizePlayerName(
  window.__CS_RUNTIME_LAUNCH?.playerName ??
  localStorage.getItem('username') ??
  '',
)
if (username) {
  (document.getElementById('username') as HTMLInputElement).value = username
}

;(document.getElementById('form') as HTMLFormElement).addEventListener('submit', (e) => {
  e.preventDefault()
  const submitted = (document.getElementById('username') as HTMLInputElement).value
  beginRuntimeLaunch(submitted)
})

void main().catch(reportRuntimeBootFailure)
