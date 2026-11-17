import { voucherStatusKind, voucherStatusText } from './voucherStatus'

const entities: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }

export function escapeReportHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, character => entities[character])
}

type ReportVoucher = {
  description?: string | null
  originalId?: number | null
  originalVoucherNo?: string | null
  reversedById?: number | null
  reversedByVoucherNo?: string | null
}

export function voucherDescriptionHtml(row: ReportVoucher | null | undefined): string {
  const description = String(row?.description || '').trim() || '—'
  const status = voucherStatusText(row)
  const kind = voucherStatusKind(row)
  return `${escapeReportHtml(description)}${status ? `<div class="voucher-status voucher-status-${kind}">${escapeReportHtml(status)}</div>` : ''}`
}
