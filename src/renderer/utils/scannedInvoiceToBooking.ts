import type { LocalInvoiceScanResult } from '../components/modals/LocalInvoiceScanModal'
import type { QA } from '../hooks/useQuickAdd'
import { invoiceDescription } from './invoiceDescription'

export function scannedInvoiceToBooking(result: LocalInvoiceScanResult):
  | { initial: { qa: QA; files: File[] }; missing?: never }
  | { missing: string[]; initial?: never } {
  const clean = String(result.fields.grossAmount || '').replace(/[^0-9,.-]/g, '')
  const decimalIndex = Math.max(clean.lastIndexOf(','), clean.lastIndexOf('.'))
  const normalized = decimalIndex >= 0
    ? `${clean.slice(0, decimalIndex).replace(/[.,]/g, '')}.${clean.slice(decimalIndex + 1)}`
    : clean.replace(/[^0-9-]/g, '')
  const parsedAmount = Number(normalized)
  const grossAmount = Number.isFinite(parsedAmount) ? Math.round(parsedAmount * 100) / 100 : 0
  const missing = [
    !result.fields.invoiceDate && 'Rechnungsdatum',
    !result.fields.supplier.trim() && 'Lieferant',
    grossAmount <= 0 && 'Bruttobetrag'
  ].filter(Boolean) as string[]
  if (missing.length) return { missing }

  const invoiceDetails = [
    result.note.trim(),
    result.fields.netAmount && `Netto: ${result.fields.netAmount} €`,
    result.fields.taxAmount && `Umsatzsteuer: ${result.fields.taxAmount} €`,
    result.fields.iban && `IBAN: ${result.fields.iban}`
  ].filter(Boolean).join('\n')
  return {
    initial: {
      qa: {
        date: result.fields.invoiceDate,
        type: result.bookingMeta.type === 'IN' ? 'IN' : 'OUT',
        bookingTypeSelected: true,
        sphere: result.bookingMeta.sphere || 'IDEELL',
        primaryClassificationValueId: result.bookingMeta.primaryClassificationValueId ?? undefined,
        mode: 'GROSS',
        grossAmount,
        vatRate: 0,
        description: invoiceDescription(result.fields.description.trim() || result.fields.supplier.trim(), result.fields.invoiceNumber),
        counterparty: result.fields.supplier.trim() || null,
        partyId: result.partyId,
        partyCreationSource: result.partyCreationSource,
        note: invoiceDetails,
        paymentMethod: result.bookingMeta.paymentMethod || 'BANK',
        paymentAccountId: result.bookingMeta.paymentAccountId ?? null,
        budgets: result.budgets,
        earmarksAssigned: result.earmarksAssigned,
        budgetId: result.budgets[0]?.budgetId ?? null,
        earmarkId: result.earmarksAssigned[0]?.earmarkId ?? null,
        tags: result.tags
      },
      files: [result.file]
    }
  }
}
