import { applyReimbursementAction, applyReimbursementActions } from '../services/reimbursementActions'
import { reimbursementCommandSchema } from '../../../shared/reimbursementActions'
import { ipcMain } from 'electron'
import { z } from 'zod'
import { getDb } from '../db/database'
import { createReimbursement, deleteReimbursement, getReimbursement, linkReimbursement, listReimbursements, reimbursementCandidates, unlinkReimbursement, updateReimbursement } from '../repositories/reimbursements'

const id = z.number().int().positive()
const amountCents = z.number().int().positive().max(Number.MAX_SAFE_INTEGER)
const role = z.enum(['EXPENSE', 'PAYMENT'])
const metadata = z.object({
  title: z.string().trim().min(1).max(200), partner: z.string().trim().min(1).max(200),
  dueDate: z.string().date().nullable().optional(), note: z.string().max(10000).optional()
})
export function registerReimbursementHandlers() {
  ipcMain.handle('reimbursements.linkedVoucherIds', () => getDb().prepare('SELECT DISTINCT voucher_id AS id FROM reimbursement_links').all().map((row: { id: number }) => row.id))
  ipcMain.handle('reimbursements.applyActions', (_event, input) => applyReimbursementActions(z.object({ changes: z.array(z.object({ command: reimbursementCommandSchema, expectedState: z.string().max(2000000) })).min(1).max(100) }).parse(input).changes))
  ipcMain.handle('reimbursements.applyAction', (_event, input) => applyReimbursementAction(z.object({ command: reimbursementCommandSchema, expectedState: z.string().max(2000000) }).parse(input)))
  ipcMain.handle('reimbursements.list', (_event, input) => listReimbursements(z.object({ voucherId: id.optional(), q: z.string().max(200).optional() }).optional().parse(input)))
  ipcMain.handle('reimbursements.get', (_event, input) => getReimbursement(z.object({ id }).parse(input).id))
  ipcMain.handle('reimbursements.create', (_event, input) => createReimbursement(metadata.extend({ voucherId: id, amountCents }).parse(input)))
  ipcMain.handle('reimbursements.update', (_event, input) => updateReimbursement(metadata.extend({ id }).parse(input)))
  ipcMain.handle('reimbursements.link', (_event, input) => linkReimbursement(z.object({ id, voucherId: id, role, amountCents }).parse(input)))
  ipcMain.handle('reimbursements.unlink', (_event, input) => unlinkReimbursement(z.object({ id, linkId: id }).parse(input)))
  ipcMain.handle('reimbursements.delete', (_event, input) => deleteReimbursement(z.object({ id }).parse(input).id))
  ipcMain.handle('reimbursements.candidates', (_event, input) => reimbursementCandidates(z.object({ role, q: z.string().max(200).optional(), voucherId: id.optional() }).parse(input)))
}
