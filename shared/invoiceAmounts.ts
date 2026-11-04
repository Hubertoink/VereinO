/** Compare rounded cents, allowing one cent of invoice rounding. */
export function invoiceAmountMismatch(gross: number | null, net: number | null, tax: number | null) {
  if (gross == null || net == null || tax == null || ![gross, net, tax].every(Number.isFinite)) return false
  return Math.abs(Math.round(net * 100) + Math.round(tax * 100) - Math.round(gross * 100)) > 1
}
