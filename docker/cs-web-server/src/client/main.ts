import { loadAsync } from 'jszip'
import xashURL from 'xash3d-fwgs/xash.wasm?url'
import gl4esURL from 'xash3d-fwgs/libref_webgl2.wasm?url'
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
  lastError?: string
}

declare global {
  interface Window {
    webkitAudioContext?: AudioContextConstructor
    __CS_LOAD_PROGRESS_SET?: (stage: string, percent: number) => void
    __CS_RUNTIME_LAUNCH?: {
      playerName?: string
    }
    __CS_START_RUNTIME?: (playerName: string) => boolean
    __CS_AUDIO_CONTEXT_HINTS?: boolean | string | number
    __CS_AUDIO_CONTEXT_SAMPLE_RATE?: number | string
    __CS_AUDIO_CONTEXT_LATENCY_HINT?: AudioContextOptions['latencyHint'] | string
    __CS_AUDIO_BACKEND__?: {
      snapshot: () => AudioBackendSnapshot
      resumeNow: () => boolean
    }
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
      __csLoadProgressHooked?: boolean
    }
  }
}

const buildEnv = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {}
const RUNTIME_ASSET_VERSION = buildEnv.VITE_CS_RUNTIME_ASSET_VERSION ?? '20260427soundbuf1'
const AUDIO_BACKEND_VARIANT = 'audioctx-hints-20260428a'

const audioBackendState: Omit<AudioBackendSnapshot, 'state' | 'actualSampleRate' | 'baseLatency' | 'outputLatency'> = {
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
}
let lastAudioContext: AudioContext | undefined
const instrumentedAudioContexts = new WeakSet<AudioContext>()

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

function hideLegacyLaunchUi() {
  const form = document.getElementById('form') as HTMLFormElement | null
  const social = document.getElementById('social') as HTMLDivElement | null
  const progress = document.getElementById('progress') as HTMLProgressElement | null
  const logo = document.getElementById('logo') as HTMLImageElement | null

  if (form) form.style.display = 'none'
  if (social) social.style.display = 'none'
  if (progress) progress.style.opacity = '0'
  if (logo) logo.style.opacity = '0'
}

function beginRuntimeLaunch(playerName: string) {
  const normalized = sanitizePlayerName(playerName)
  if (!normalized) {
    return false
  }

  if (runtimeStartResolved) {
    return true
  }

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
  if (normalized === 'interactive' || normalized === 'balanced' || normalized === 'playback') {
    return normalized
  }
  const parsed = Number(normalized)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined
}

function audioContextSnapshot(): AudioBackendSnapshot {
  const context = window.SDL2?.audioContext ?? lastAudioContext
  const latencyContext = context as (AudioContext & { outputLatency?: number }) | undefined
  return {
    ...audioBackendState,
    actualSampleRate: context?.sampleRate,
    baseLatency: latencyContext?.baseLatency,
    outputLatency: latencyContext?.outputLatency,
    state: context?.state,
  }
}

function getAudioContextForResume(): AudioContext | undefined {
  return window.SDL2?.audioContext ?? lastAudioContext
}

function tryResumeAudioContext(source: string): boolean {
  const context = getAudioContextForResume()
  audioBackendState.lastResumeSource = source
  if (!context || typeof context.resume !== 'function') {
    return false
  }
  if (context.state !== 'suspended') {
    return false
  }

  audioBackendState.resumeAttempts += 1
  void context.resume()
    .then(() => {
      audioBackendState.resumeSuccesses += 1
    })
    .catch((error: unknown) => {
      audioBackendState.resumeFailures += 1
      audioBackendState.lastError = error instanceof Error ? error.message : String(error)
    })
  return true
}

function instrumentAudioContext(context: AudioContext): AudioContext {
  if (instrumentedAudioContexts.has(context)) {
    return context
  }
  instrumentedAudioContexts.add(context)
  lastAudioContext = context
  audioBackendState.contextsCreated += 1

  try {
    const originalCreateScriptProcessor = context.createScriptProcessor
    context.createScriptProcessor = function (...args: Parameters<AudioContext['createScriptProcessor']>) {
      audioBackendState.scriptProcessorCalls += 1
      audioBackendState.lastScriptProcessorArgs = {
        bufferSize: args[0],
        numberOfInputChannels: args[1],
        numberOfOutputChannels: args[2],
      }
      return originalCreateScriptProcessor.apply(this, args)
    }
  } catch (error) {
    audioBackendState.lastError = error instanceof Error ? error.message : String(error)
  }

  try {
    context.addEventListener('statechange', () => {
      lastAudioContext = context
    })
  } catch {
    // best-effort diagnostics only
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

function installAudioContextHints() {
  const enabled = readBooleanSetting(
    '__CS_AUDIO_CONTEXT_HINTS',
    ['cs_audio_context_hints', 'audio_context_hints', 'audioctx'],
    buildEnv.VITE_CS_AUDIO_CONTEXT_HINTS,
    false,
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
  audioBackendState.requestedSampleRate = requestedSampleRate
  audioBackendState.requestedLatencyHint = requestedLatencyHint
  window.__CS_AUDIO_BACKEND__ = {
    snapshot: audioContextSnapshot,
    resumeNow: () => tryResumeAudioContext('manual'),
  }

  if (!enabled) {
    audioBackendState.installReason = 'disabled'
    return
  }

  const OriginalAudioContext = window.AudioContext ?? window.webkitAudioContext
  if (!OriginalAudioContext) {
    audioBackendState.installReason = 'missing-audio-context'
    return
  }

  const WrappedAudioContext = function (options?: AudioContextOptions) {
    audioBackendState.constructorCalls += 1
    const requestedOptions: AudioContextOptions = {
      ...(options && typeof options === 'object' ? options : {}),
    }
    if (requestedSampleRate != null) requestedOptions.sampleRate = requestedSampleRate
    if (requestedLatencyHint != null) requestedOptions.latencyHint = requestedLatencyHint

    try {
      return instrumentAudioContext(new OriginalAudioContext(requestedOptions))
    } catch (error) {
      audioBackendState.constructorFallbacks += 1
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
  audioBackendState.installReason = 'installed'

  for (const eventName of ['click', 'keydown', 'touchstart', 'mousedown', 'pointerdown']) {
    document.addEventListener(eventName, () => tryResumeAudioContext(eventName), { passive: true })
  }
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) tryResumeAudioContext('visibilitychange')
  })
  window.addEventListener('focus', () => tryResumeAudioContext('focus'))

  let attempts = 0
  const interval = window.setInterval(() => {
    attempts += 1
    tryResumeAudioContext('boot-interval')
    const context = getAudioContextForResume()
    if (attempts >= 60 || context?.state === 'running') {
      window.clearInterval(interval)
    }
  }, 500)
}

installAudioContextHints()

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
      const raw = String(team ?? 'any').trim().toLowerCase()
      const target = raw === 'ct' || raw === 't' ? raw : 'any'
      x.Cmd_ExecuteString(`spec_cycle_team ${target}`)
      return { ok: true, targetChanged: true }
    },
  }
}

function installModuleLogProgressHooks() {
  const moduleRef = (window.Module ??= {})
  if (moduleRef.__csLoadProgressHooked) {
    return
  }

  moduleRef.__csLoadProgressHooked = true
  const previousPrint = moduleRef.print
  const previousPrintErr = moduleRef.printErr
  let loadingMapProgress = 0

  const handleRuntimeLog = (value: unknown) => {
    const line = String(value ?? '').trim()
    if (!line) {
      return
    }

    if (!/precaching|spawn server|loading map|begin loading|resource/i.test(line)) {
      return
    }

    loadingMapProgress = Math.min(0.96, loadingMapProgress + 0.18)
    const mapName = stripBspExtension(window.__mapName)
    setLoadProgress(mapName ? `loading_map ${mapName}` : 'loading_map', loadingMapProgress)
  }

  moduleRef.print = (value: unknown) => {
    handleRuntimeLog(value)
    previousPrint?.(value)
  }
  moduleRef.printErr = (value: unknown) => {
    handleRuntimeLog(value)
    previousPrintErr?.(value)
  }
}

async function fetchWithProgress(url: string) {
  const progress = document.getElementById('progress') as HTMLProgressElement | null
  const res = await fetch(url)

  const contentLength = res.headers.get('Content-Length')
  const total = contentLength ? parseInt(contentLength, 10) : null
  const reader = res.body!.getReader()
  const chunks = []
  let received = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    chunks.push(value)
    received += value.length

    if (total !== null) {
      const nextValue = received / total
      if (progress) {
        progress.value = nextValue
      }
      setLoadProgress('downloading', nextValue)
    } else if (progress) {
      progress.value = received
    }
  }

  if (progress) {
    progress.style.opacity = '0'
  }
  setLoadProgress('downloading', 1)

  const blob = new Blob(chunks)
  return blob.arrayBuffer()
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

  const runtimeOptions = {
    canvas: document.getElementById('canvas') as HTMLCanvasElement,
    arguments: config.arguments || ['-windowed'],
    libraries: {
      filesystem: config.libraries.filesystem,
      xash: xashURL,
      menu: config.libraries.menu,
      server: config.libraries.server,
      client: withAssetVersion(config.libraries.client),
      render: {
        gl4es: gl4esURL,
      }
    },
    dynamicLibraries: config.dynamic_libraries,
    filesMap: config.files_map,
  } as ConstructorParameters<typeof Xash3DWebRTC>[0]

  const x = new Xash3DWebRTC(runtimeOptions)

  const initPromise = x.init()
  const [zip, extras] = await Promise.all([
    (async () => {
      const res = await fetchWithProgress(`valve.zip?v=${RUNTIME_ASSET_VERSION}`)
      return await loadAsync(res)
    })(),
    (async () => {
      const res = await fetch(config.libraries.extras)
      return await res.arrayBuffer()
    })(),
  ])

  setLoadProgress('initializing', 0.35)
  await initPromise
  setLoadProgress('initializing', 1)

  const em = x.em
  if (!em) {
    throw new Error('Xash runtime initialized without Emscripten interface')
  }

  const files = Object.entries(zip.files).filter(([, file]) => !file.dir)
  const totalFiles = Math.max(1, files.length)
  let extractedFiles = 0

  setLoadProgress('extracting', 0)
  for (const [filename, file] of files) {
    const path = '/rodir/' + filename
    const dir = path.split('/').slice(0, -1).join('/')

    em.FS.mkdirTree(dir)
    em.FS.writeFile(path, await file.async('uint8array'))
    extractedFiles += 1
    setLoadProgress('extracting', extractedFiles / totalFiles)
  }

  em.FS.mkdirTree(`/rodir/${config.game_dir}`)
  em.FS.writeFile(`/rodir/${config.game_dir}/extras.pk3`, new Uint8Array(extras))
  em.FS.mkdirTree('/rodir/cstrike/maps')
  await window.__mapReady
  if (window.__mapBytes && window.__mapName) {
    em.FS.writeFile(`/rodir/cstrike/maps/${window.__mapName}`, new Uint8Array(window.__mapBytes))
  }
  em.FS.chdir('/rodir')

  const logo = document.getElementById('logo') as HTMLImageElement | null
  if (logo) {
    logo.style.animationName = 'pulsate-end'
    logo.style.animationFillMode = 'forwards'
    logo.style.animationIterationCount = '1'
    logo.style.animationDirection = 'normal'
  }

  installRuntimeGlobals(x)
  x.main()
  if (window.__CS_CAMERA_ACTIVE) {
    x.Cmd_ExecuteString('hideweapon 127')
    x.Cmd_ExecuteString('cl_hidehud 127')
    x.Cmd_ExecuteString('crosshair 0')
    x.Cmd_ExecuteString('con_color "0 0 0"')
    x.Cmd_ExecuteString('con_alpha 0')
    x.Cmd_ExecuteString('con_notifytime 0')
  }
  if (touchControls.checked) {
    x.Cmd_ExecuteString('touch_enable 1')
  }
  x.Cmd_ExecuteString(`name "${username}"`)

  if (config.console && Array.isArray(config.console)) {
    config.console.forEach((cmd: string) => {
      x.Cmd_ExecuteString(cmd)
    })
  }

  setLoadProgress('connecting', 1)
  x.Cmd_ExecuteString('connect 127.0.0.1:8080')

  window.addEventListener('beforeunload', (event) => {
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

(document.getElementById('form') as HTMLFormElement).addEventListener('submit', (e) => {
  e.preventDefault()
  const submitted = (document.getElementById('username') as HTMLInputElement).value
  beginRuntimeLaunch(submitted)
})

main()
