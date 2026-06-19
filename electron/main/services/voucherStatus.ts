export type VoucherStatusKind = 'storno' | 'storniert' | ''

function refLabel(no?: string | null, id?: number | string | null) {
  if (no) return `#${no}`
  if (id != null && id !== '') return `#${id}`
  return ''
}

export function voucherStatusKind(row: any): VoucherStatusKind {
  if (row?.originalId) return 'storno'
  if (row?.reversedById) return 'storniert'
  return ''
}

export function voucherStatusText(row: any, activeLabel = '') {
  if (row?.originalId) {
    const ref = refLabel(row.originalVoucherNo, row.originalId)
    return `Stornobuchung${ref ? ` zu ${ref}` : ''}`
  }
  if (row?.reversedById) {
    const ref = refLabel(row.reversedByVoucherNo, row.reversedById)
    return `Storniert${ref ? ` durch ${ref}` : ''}`
  }
  return activeLabel
}

export function voucherDescriptionWithStatus(row: any) {
  const description = String(row?.description || '').trim() || '-'
  const status = voucherStatusText(row)
  return status ? `${description} (${status})` : description
}
