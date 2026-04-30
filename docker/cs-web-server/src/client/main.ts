import { loadAsync } from 'jszip'
import xashURL from 'xash3d-fwgs/xash.wasm?url'
import gl4esURL from 'xash3d-fwgs/libref_webgl2.wasm?url'
import { Xash3DWebRTC } from './webrtc'

declare global {
  interface Window {
    __CS_LOAD_PROGRESS_SET?: (stage: string, percent: number) => void
    __CS_RUNTIME_LAUNCH?: {
      playerName?: string
    }
    __CS_START_RUNTIME?: (playerName: string) => boolean
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
    Module?: {
      print?: (text: unknown) => void
      printErr?: (text: unknown) => void
      __csLoadProgressHooked?: boolean
    }
  }
}

const buildEnv = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {}
const RUNTIME_ASSET_VERSION = buildEnv.VITE_CS_RUNTIME_ASSET_VERSION ?? '20260427soundbuf1'

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
