export type InvoicePacketGroupProposal = {
  pageNumbers: number[]
  confidence: number
  reason: string
  warnings: string[]
}

export function normalizeInvoicePacketGroups(groups: InvoicePacketGroupProposal[], pageCount: number) {
  const normalized = groups
    .map((group) => ({
      ...group,
      pageNumbers: [...new Set(group.pageNumbers)]
        .filter((page) => page >= 1 && page <= pageCount)
        .sort((a, b) => a - b)
    }))
    .filter((group) => group.pageNumbers.length > 0)
    .sort((a, b) => a.pageNumbers[0] - b.pageNumbers[0])
  const flattened = normalized.flatMap((group) => group.pageNumbers)
  const expected = Array.from({ length: pageCount }, (_, index) => index + 1)
  const validCoverage = flattened.length === expected.length
    && flattened.every((page, index) => page === expected[index])
    && normalized.every((group) => group.pageNumbers.every((page, index, pages) => index === 0 || page === pages[index - 1] + 1))
  if (!validCoverage) {
    throw new Error('Die KI konnte die Seiten des Scanpakets nicht eindeutig und vollständig gruppieren. Bitte PDF prüfen oder Rechnungen einzeln hochladen.')
  }
  return normalized
}
