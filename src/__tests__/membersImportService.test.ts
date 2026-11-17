import ExcelJS from 'exceljs'
import { getDb } from '../../electron/main/db/database'
import { createMember, updateMember } from '../../electron/main/repositories/members'
import { executeMembersImport, previewMembersXlsx } from '../../electron/main/services/membersImport'

jest.mock('electron', () => ({ dialog: {}, app: {} }))
jest.mock('../../electron/main/db/database', () => ({ getDb: jest.fn() }))
jest.mock('../../electron/main/repositories/members', () => ({ createMember: jest.fn(), updateMember: jest.fn() }))
jest.mock('../../electron/main/services/audit', () => ({ writeAudit: jest.fn() }))

async function workbook() {
  const wb = new ExcelJS.Workbook()
  const sheet = wb.addWorksheet('Mitglieder')
  sheet.addRow(['Mitgliedsnummer', 'Name', 'Eintrittsdatum', 'Beitrag'])
  sheet.addRow(['001', 'Testmitglied', '01.01.2026', 60])
  return Buffer.from(await wb.xlsx.writeBuffer()).toString('base64')
}

beforeEach(() => jest.clearAllMocks())

test('previews real XLSX data and preserves worksheet row numbers for edits', async () => {
  const preview = await previewMembersXlsx(await workbook())
  expect(preview.headerRowIndex).toBe(1)
  expect(preview.sample[0]).toMatchObject({ _rowIndex: 2, Name: 'Testmitglied' })
  expect(preview.suggestedMapping).toMatchObject({ memberNo: 'Mitgliedsnummer', name: 'Name', join_date: 'Eintrittsdatum' })
})

test.each([false, true])('imports through the member repository (existing=%s)', async existing => {
  jest.mocked(getDb).mockReturnValue({ prepare: () => ({ get: () => existing ? { id: 7 } : undefined }) } as any)
  const result = await executeMembersImport(await workbook(), {
    memberNo: 'Mitgliedsnummer', name: 'Name', join_date: 'Eintrittsdatum', contribution_amount: 'Beitrag'
  }, { updateExisting: true, rowEdits: { 2: { Name: 'Bearbeitet' } } })
  expect(result.errors).toEqual([])
  expect(result).toMatchObject({ imported: existing ? 0 : 1, updated: existing ? 1 : 0 })
  expect(existing ? updateMember : createMember).toHaveBeenCalledWith(expect.objectContaining({
    name: 'Bearbeitet', join_date: '2026-01-01', contribution_amount: 60
  }))
})
