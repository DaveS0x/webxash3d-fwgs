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
    __mapName?: string | null
    Module?: {
      print?: (text: unknown) => void
      printErr?: (text: unknown) => void
      __csLoadProgressHooked?: boolean
    }
  }
}

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

  const x = new Xash3DWebRTC({
    canvas: document.getElementById('canvas') as HTMLCanvasElement,
    arguments: config.arguments || ['-windowed'],
    libraries: {
      filesystem: config.libraries.filesystem,
      xash: xashURL,
      menu: config.libraries.menu,
      server: config.libraries.server,
      client: config.libraries.client,
      render: {
        gl4es: gl4esURL,
      }
    },
    dynamicLibraries: config.dynamic_libraries,
    filesMap: config.files_map,
  })

  const initPromise = x.init()
  const [zip, extras] = await Promise.all([
    (async () => {
      const res = await fetchWithProgress('valve.zip')
      return await loadAsync(res)
    })(),
    (async () => {
      const res = await fetch(config.libraries.extras)
      return await res.arrayBuffer()
    })(),
  ])

  const files = Object.entries(zip.files).filter(([, file]) => !file.dir)
  const totalFiles = Math.max(1, files.length)
  let extractedFiles = 0

  setLoadProgress('extracting', 0)
  for (const [filename, file] of files) {
    const path = '/rodir/' + filename
    const dir = path.split('/').slice(0, -1).join('/')

    x.em.FS.mkdirTree(dir)
    x.em.FS.writeFile(path, await file.async('uint8array'))
    extractedFiles += 1
    setLoadProgress('extracting', extractedFiles / totalFiles)
  }

  setLoadProgress('initializing', 0.35)
  await initPromise
  setLoadProgress('initializing', 1)

  x.em.FS.mkdirTree(`/rodir/${config.game_dir}`)
  x.em.FS.writeFile(`/rodir/${config.game_dir}/extras.pk3`, new Uint8Array(extras))
  x.em.FS.chdir('/rodir')

  const logo = document.getElementById('logo') as HTMLImageElement | null
  if (logo) {
    logo.style.animationName = 'pulsate-end'
    logo.style.animationFillMode = 'forwards'
    logo.style.animationIterationCount = '1'
    logo.style.animationDirection = 'normal'
  }

  x.main()
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
