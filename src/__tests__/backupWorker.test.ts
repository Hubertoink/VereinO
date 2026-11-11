import { EventEmitter } from 'node:events'
import { utilityProcess } from 'electron'
import { runBackupIo } from '../../electron/main/services/backupWorker'

jest.mock('electron', () => ({ app: { once: jest.fn() }, utilityProcess: { fork: jest.fn() } }))

let child: EventEmitter & { kill: jest.Mock; postMessage: jest.Mock }
beforeEach(() => {
  jest.useFakeTimers()
  child = Object.assign(new EventEmitter(), { kill: jest.fn(), postMessage: jest.fn() })
  ;(utilityProcess.fork as jest.Mock).mockReturnValue(child)
})
afterEach(() => { jest.useRealTimers() })

test('kills a stalled network operation and rejects within the idle limit', async () => {
  const operation = runBackupIo({ action: 'list', dir: 'H:\\Backups' }, undefined, { idleMs: 100, totalMs: 500 })
  const assertion = expect(operation).rejects.toThrow('Zeitüberschreitung')
  child.emit('spawn')
  expect(child.postMessage).toHaveBeenCalledWith({ action: 'list', dir: 'H:\\Backups' })
  await jest.advanceTimersByTimeAsync(100)
  await assertion
  expect(child.kill).toHaveBeenCalledTimes(1)
  child.emit('message', { type: 'result', result: { files: [] } })
  expect(child.kill).toHaveBeenCalledTimes(1)
})

test('real progress extends the idle limit but cannot bypass the total deadline', async () => {
  const operation = runBackupIo({ action: 'publish', source: 'local.sqlite', dir: 'H:\\Backups' }, undefined, { idleMs: 100, totalMs: 250 })
  const assertion = expect(operation).rejects.toThrow('Zeitüberschreitung')
  for (let i = 0; i < 3; i++) {
    await jest.advanceTimersByTimeAsync(80)
    child.emit('message', { type: 'progress', progress: { stage: 'transfer', message: 'copy', completedBytes: i + 1 } })
  }
  await jest.advanceTimersByTimeAsync(10)
  await assertion
  expect(child.kill).toHaveBeenCalledTimes(1)
})

test('successful completion stops timers and disposes the helper', async () => {
  const operation = runBackupIo({ action: 'probe', dir: 'H:\\Backups' })
  child.emit('message', { type: 'result', result: {} })
  await expect(operation).resolves.toEqual({})
  expect(jest.getTimerCount()).toBe(0)
  expect(child.kill).toHaveBeenCalledTimes(1)
})

test('a crashed helper produces an actionable error instead of hanging', async () => {
  const operation = runBackupIo({ action: 'list', dir: 'H:\\Backups' })
  child.emit('exit', 1)
  await expect(operation).rejects.toThrow('unerwartet beendet')
  expect(jest.getTimerCount()).toBe(0)
})
