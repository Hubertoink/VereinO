import { ipcMain } from 'electron'
import { MembersImportExecuteInput, MembersImportPreviewInput } from '../../../shared/membersImport'

const loadService = () => import('../services/membersImport')

export function registerMembersImportHandlers(onChanged: () => void): void {
  ipcMain.handle('members.import.preview', async (_event, input: unknown) => {
    const { fileBase64 } = MembersImportPreviewInput.parse(input)
    return (await loadService()).previewMembersXlsx(fileBase64)
  })
  ipcMain.handle('members.import.execute', async (_event, input: unknown) => {
    const { fileBase64, mapping, ...options } = MembersImportExecuteInput.parse(input)
    const result = await (await loadService()).executeMembersImport(fileBase64, mapping, options)
    if (result.imported || result.updated) onChanged()
    return result
  })
  ipcMain.handle('members.import.template', async () => (await loadService()).createMembersTemplate())
  ipcMain.handle('members.import.testdata', async () => (await loadService()).createMembersTestData())
}
