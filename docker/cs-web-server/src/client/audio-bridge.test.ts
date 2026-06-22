import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createWorkletBackedScriptProcessorNode } from './audio-bridge'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

async function tick() {
  await new Promise(resolve => setTimeout(resolve, 0))
}

function fakeNativeNode() {
  const connections: unknown[][] = []
  const node = {
    onaudioprocess: null,
    connect: (...args: unknown[]) => {
      connections.push(args)
      return args[0]
    },
    disconnect: () => {},
  } as unknown as ScriptProcessorNode
  return { node, connections }
}

test('keeps the worklet-backed proxy when setup succeeds', async () => {
  const ready = deferred<boolean>()
  let nativeCalls = 0
  let fallbackCalls = 0
  let driveStopped = false
  const context = {} as AudioContext

  const node = createWorkletBackedScriptProcessorNode({
    context,
    args: [1024, 0, 2],
    originalCreateScriptProcessor: (() => {
      nativeCalls++
      return fakeNativeNode().node
    }) as AudioContext['createScriptProcessor'],
    bridgeReady: ready.promise,
    startWorkletDrive: () => () => { driveStopped = true },
    onFallback: () => { fallbackCalls++ },
  })

  node.connect({} as AudioNode)
  ready.resolve(true)
  await tick()

  assert.equal(nativeCalls, 0)
  assert.equal(fallbackCalls, 0)
  assert.equal(driveStopped, false)
})

test('moves SDL callback and connection to a real node after asynchronous failure', async () => {
  const ready = deferred<boolean>()
  const native = fakeNativeNode()
  let fallbackCalls = 0
  let driveStopped = false
  const destination = {} as AudioNode
  const handler = (() => {}) as ScriptProcessorNode['onaudioprocess']
  const context = {} as AudioContext

  const node = createWorkletBackedScriptProcessorNode({
    context,
    args: [1024, 0, 2],
    originalCreateScriptProcessor: (() => native.node) as AudioContext['createScriptProcessor'],
    bridgeReady: ready.promise,
    startWorkletDrive: () => () => { driveStopped = true },
    onFallback: () => { fallbackCalls++ },
  })

  node.onaudioprocess = handler
  node.connect(destination)
  ready.resolve(false)
  await tick()

  assert.equal(native.node.onaudioprocess, handler)
  assert.deepEqual(native.connections, [[destination]])
  assert.equal(fallbackCalls, 1)
  assert.equal(driveStopped, true)
})

test('falls back when worklet setup rejects', async () => {
  const ready = deferred<boolean>()
  const native = fakeNativeNode()
  let fallbackReason: unknown

  createWorkletBackedScriptProcessorNode({
    context: {} as AudioContext,
    args: [2048, 0, 2],
    originalCreateScriptProcessor: (() => native.node) as AudioContext['createScriptProcessor'],
    bridgeReady: ready.promise,
    startWorkletDrive: () => () => {},
    onFallback: reason => { fallbackReason = reason },
  })

  const failure = new Error('addModule rejected')
  ready.reject(failure)
  await tick()

  assert.equal(fallbackReason, failure)
})
