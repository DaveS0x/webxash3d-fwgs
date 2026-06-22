export type WorkletBackedScriptProcessorOptions = {
  context: AudioContext
  args: Parameters<AudioContext['createScriptProcessor']>
  originalCreateScriptProcessor: AudioContext['createScriptProcessor']
  bridgeReady: Promise<boolean>
  startWorkletDrive: (node: ScriptProcessorNode) => () => void
  onFallback: (reason?: unknown) => void
}

export function calculateRingTargetFrames(
  sampleRate: number,
  bufferSize: number,
  ringFrames: number,
  targetMs: number,
): number {
  const desiredFrames = Math.ceil((sampleRate * targetMs) / 1000)
  const wholeBuffers = Math.max(2, Math.ceil(desiredFrames / bufferSize))
  return Math.min(wholeBuffers * bufferSize, ringFrames - bufferSize)
}

export function createWorkletBackedScriptProcessorNode(
  options: WorkletBackedScriptProcessorOptions,
): ScriptProcessorNode {
  const {
    context,
    args,
    originalCreateScriptProcessor,
    bridgeReady,
    startWorkletDrive,
    onFallback,
  } = options

  let audioProcessHandler: ScriptProcessorNode['onaudioprocess'] = null
  let nativeNode: ScriptProcessorNode | undefined
  let pendingConnections: unknown[][] = []
  let disconnected = false
  let stopWorkletDrive = () => {}

  const proxy = {
    connect: (...connectArgs: unknown[]) => {
      disconnected = false
      if (nativeNode) {
        return Reflect.apply(nativeNode.connect, nativeNode, connectArgs)
      }
      pendingConnections.push(connectArgs)
      return connectArgs[0]
    },
    disconnect: (...disconnectArgs: unknown[]) => {
      disconnected = true
      pendingConnections = []
      if (nativeNode) {
        Reflect.apply(nativeNode.disconnect, nativeNode, disconnectArgs)
      }
    },
  } as unknown as ScriptProcessorNode

  Object.defineProperty(proxy, 'onaudioprocess', {
    configurable: true,
    enumerable: true,
    get: () => audioProcessHandler,
    set: (handler: ScriptProcessorNode['onaudioprocess']) => {
      audioProcessHandler = handler
      if (nativeNode) nativeNode.onaudioprocess = handler
    },
  })

  stopWorkletDrive = startWorkletDrive(proxy)

  const activateFallback = (reason?: unknown) => {
    if (nativeNode) return
    stopWorkletDrive()
    try {
      nativeNode = Reflect.apply(originalCreateScriptProcessor, context, args)
      nativeNode.onaudioprocess = audioProcessHandler
      if (!disconnected) {
        for (const connectArgs of pendingConnections) {
          Reflect.apply(nativeNode.connect, nativeNode, connectArgs)
        }
      }
      pendingConnections = []
      onFallback(reason)
    } catch (error) {
      onFallback(error)
    }
  }

  void bridgeReady.then(
    ready => {
      if (!ready) activateFallback()
    },
    error => activateFallback(error),
  )

  return proxy
}
