import { ipcMain } from 'electron'
import { VouchersListInput, VouchersListOutput, VoucherUpdateInput, VoucherMetaUpdateInput, VoucherUpdateOutput } from './schemas'
import { listJournalVouchers, updateVoucher, updateVoucherMeta } from '../repositories/vouchers'

export function registerJournalHandlers(withSchemaHealRetry: <T>(run: () => T, schemaIdentifiers: string[]) => Promise<T>) {
  const voucherListSchemaIdentifiers = [
    'cash_checks',
    'member_advances',
    'amount_mode',
    'budget_id',
    'budget_amount',
    'earmark_amount',
    'transfer_from',
    'transfer_to'
  ]

  ipcMain.handle('vouchers.list', async (_e, payload) => {
    return withSchemaHealRetry(() => {
      const parsed = VouchersListInput.parse(payload) ?? { limit: 20, offset: 0, sort: 'DESC' }
      return VouchersListOutput.parse(listJournalVouchers(parsed))
    }, voucherListSchemaIdentifiers)
  })

  ipcMain.handle('vouchers.update', async (_e, payload) => {
    const parsed = VoucherUpdateInput.parse(payload)
    const res = updateVoucher(parsed)
    return VoucherUpdateOutput.parse(res)
  })

  ipcMain.handle('vouchers.updateMeta', async (_e, payload) => {
    const parsed = VoucherMetaUpdateInput.parse(payload)
    return VoucherUpdateOutput.parse(updateVoucherMeta(parsed))
  })
}
