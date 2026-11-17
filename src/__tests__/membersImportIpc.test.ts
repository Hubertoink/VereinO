import { ipcMain, contextBridge } from 'electron'
import { registerMembersImportHandlers } from '../../electron/main/ipc/membersImport'
import * as service from '../../electron/main/services/membersImport'

jest.mock('electron', () => ({
  ipcMain: { handle: jest.fn() },
  ipcRenderer: { on: jest.fn(), invoke: jest.fn() },
  contextBridge: { exposeInMainWorld: jest.fn() }
}))
jest.mock('../../electron/main/services/membersImport', () => ({
  previewMembersXlsx: jest.fn(), executeMembersImport: jest.fn(),
  createMembersTemplate: jest.fn(), createMembersTestData: jest.fn()
}))

const changed = jest.fn()
let handlers: Map<string, Parameters<typeof ipcMain.handle>[1]>
beforeEach(() => {
  jest.clearAllMocks()
  handlers = new Map()
  jest.mocked(ipcMain.handle).mockImplementation((name, handler) => { handlers.set(name, handler) })
  registerMembersImportHandlers(changed)
})

test('the preload exposes all four member import operations and invokes registered channels', async () => {
  await import('../../electron/preload/index')
  const api = jest.mocked(contextBridge.exposeInMainWorld).mock.calls.find(([name]) => name === 'api')![1]
  const { ipcRenderer } = await import('electron')
  const input = { fileBase64: 'd29ya2Jvb2s=', mapping: { name: 'Name' } }
  await api.members.import.preview(input)
  await api.members.import.execute(input)
  await api.members.import.template()
  await api.members.import.testdata()
  expect(jest.mocked(ipcRenderer.invoke).mock.calls.map(([channel]) => channel)).toEqual([...handlers.keys()])
})

test('validates payloads before entering the import service', async () => {
  await expect(handlers.get('members.import.preview')!(undefined as never, { fileBase64: '' })).rejects.toThrow()
  await expect(handlers.get('members.import.execute')!(undefined as never, { fileBase64: 'data', mapping: {}, rowEdits: { '-1': {} } })).rejects.toThrow()
  expect(service.previewMembersXlsx).not.toHaveBeenCalled()
  expect(service.executeMembersImport).not.toHaveBeenCalled()
})

test('forwards mapping and edits and broadcasts only actual mutations', async () => {
  const result = { imported: 1, updated: 0, skipped: 0, errors: [] }
  jest.mocked(service.executeMembersImport).mockResolvedValue(result)
  const options = { updateExisting: true, rowEdits: { 2: { Name: 'Geändert' } } }
  await expect(handlers.get('members.import.execute')!(undefined as never, { fileBase64: 'data', mapping: { name: 'Name' }, ...options })).resolves.toEqual(result)
  expect(service.executeMembersImport).toHaveBeenCalledWith('data', { name: 'Name' }, options)
  expect(changed).toHaveBeenCalledTimes(1)
  jest.mocked(service.executeMembersImport).mockResolvedValue({ ...result, imported: 0, skipped: 1 })
  await handlers.get('members.import.execute')!(undefined as never, { fileBase64: 'data', mapping: {} })
  expect(changed).toHaveBeenCalledTimes(1)
})
