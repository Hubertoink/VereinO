/** Append the invoice reference once, keeping the user's description intact. */
export function invoiceDescription(description: string, invoiceNumber: string) {
  const text = description.trim()
  const number = invoiceNumber.trim()
  if (!number) return text
  const escaped = number.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const present = new RegExp(`(^|[^\\p{L}\\p{N}_/.-])${escaped}($|[^\\p{L}\\p{N}_/.-])`, 'iu')
  if (present.test(text)) return text
  return [text, `(Rechnungsnr. ${number})`].filter(Boolean).join(' ')
}
