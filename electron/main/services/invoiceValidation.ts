import { invoiceAmountMismatch } from '../../../shared/invoiceAmounts'
import type { TAiInvoiceExtractionResult } from '../ipc/schemas'

type Reference = { id: number; name?: string; label?: string; isActive?: number | boolean; isArchived?: number | boolean; kind?: string }
export type InvoiceValidationContext = {
  organization?: { profile?: string }
  paymentAccounts?: Reference[]
  primaryClassifications?: Reference[]
  parties?: Reference[]
  budgets?: Reference[]
  earmarks?: Reference[]
  tags?: Array<{ name: string }>
}

/** Preserve signed credit amounts as positive booking amounts; direction remains explicit. */
export function normalizeCreditAmounts(raw: Record<string, unknown>) {
  const result = { ...raw }
  const warnings = Array.isArray(raw.warnings) ? [...raw.warnings] : []
  let negative = false
  let positive = false
  for (const field of ['grossAmount', 'netAmount', 'taxAmount']) {
    const value = raw[field]
    if (value == null || value === '') continue
    const amount = typeof value === 'number' ? value : Number(String(value).replace(',', '.'))
    if (!Number.isFinite(amount)) continue
    negative ||= amount < 0
    positive ||= amount > 0
    result[field] = Math.abs(amount)
  }
  if (negative || raw.documentType === 'CREDIT_NOTE') {
    warnings.push('Gutschrift oder negativer Rechnungsbetrag: Beträge werden positiv übernommen. Einnahme/Ausgabe und Verrechnung mit der Ursprungsrechnung bitte prüfen.')
    if (negative && positive) warnings.push('Uneinheitliche Vorzeichen in den Rechnungsbeträgen. Bitte Originalbeleg prüfen.')
  }
  result.warnings = warnings
  return result
}

export function validateInvoiceExtraction(result: TAiInvoiceExtractionResult, context: InvoiceValidationContext, explicitAccountId?: number | null): TAiInvoiceExtractionResult {
  const next = { ...result, warnings: [...result.warnings] }
  const warn = (message: string) => { next.warnings.push(message); next.confidence = Math.min(next.confidence, 0.74) }
  const active = (rows: Reference[] | undefined, id: number) => rows?.find((row) => row.id === id && row.isActive !== 0 && row.isActive !== false && row.isArchived !== 1 && row.isArchived !== true)
  if (next.grossAmount != null && next.netAmount != null && next.taxAmount != null) {
    const difference = Math.abs(Math.round(next.netAmount * 100) + Math.round(next.taxAmount * 100) - Math.round(next.grossAmount * 100))
    if (invoiceAmountMismatch(next.grossAmount, next.netAmount, next.taxAmount)) warn(`Betragsabweichung: Netto + Steuer stimmen nicht mit Brutto überein (Differenz ${(difference / 100).toFixed(2)} EUR). Bitte Originalbeleg prüfen.`)
  }
  for (const [field, rows, label] of [
    ['paymentAccountId', context.paymentAccounts, 'Zahlungskonto'],
    ['primaryClassificationValueId', context.primaryClassifications, 'Kategorie'],
    ['partyId', context.parties, 'Geschäftspartner']
  ] as const) {
    const id = next[field]
    if (id != null && !active(rows, id)) {
      next[field] = null
      warn(`Die KI hat eine Zuordnung für „${label}“ vorgeschlagen, die keinem verfügbaren Eintrag in deinen Stammdaten entspricht. Der Vorschlag wurde nicht übernommen. Bitte bei Bedarf einen vorhandenen Eintrag auswählen.`)
    }
  }
  if (next.paymentAccountId != null && next.paymentAccountId !== explicitAccountId && !next.paymentAccountEvidence?.trim()) {
    next.paymentAccountId = null
    warn('Das eigene Zahlungskonto ist aus dem Beleg nicht eindeutig erkennbar. Bitte das tatsächlich verwendete Konto auswählen.')
  }
  if (next.paymentAccountId == null) {
    next.paymentMethod = null
    warn('Zahlungskonto fehlt. Bitte vor der Übernahme ein aktives Konto auswählen.')
  }
  const account = next.paymentAccountId == null ? undefined : active(context.paymentAccounts, next.paymentAccountId)
  if (account?.kind) {
    const method = account.kind === 'CASH' ? 'BAR' : 'BANK'
    if (next.paymentMethod && next.paymentMethod !== method) warn('Zahlweg wurde an das gewählte Zahlungskonto angepasst.')
    next.paymentMethod = method
  }
  if (context.organization?.profile === 'GENERAL') {
    next.sphere = 'IDEELL'
    if (next.primaryClassificationValueId == null) warn('Eine aktive Kategorie muss vor der Übernahme ausgewählt werden.')
  }
  for (const [field, rows, label] of [['budgets', context.budgets, 'Budget'], ['earmarks', context.earmarks, 'Zweckbindung']] as const) {
    next[field] = next[field].filter((assignment) => {
      if (active(rows, assignment.id)) return true
      const reference = rows?.find((row) => row.id === assignment.id)
      const name = reference?.name || reference?.label
      warn(name
        ? `Die KI hat ${label} „${name}“ vorgeschlagen. Dieser Eintrag ist nicht mehr aktiv; die Zuordnung wurde nicht übernommen. Bitte bei Bedarf einen aktiven Eintrag auswählen.`
        : `Die KI hat eine ${label === 'Budget' ? 'Budgetzuordnung' : 'Zweckbindung'} vorgeschlagen, für die kein verfügbarer Eintrag in deinen Stammdaten gefunden wurde. Der Vorschlag wurde nicht übernommen. Bitte nur bei Bedarf selbst zuordnen.`)
      return false
    })
  }
  next.tags = next.tags.filter((tag) => {
    if (context.tags?.some((entry) => entry.name === tag)) return true
    warn(`Tag „${tag}“ ist nicht in den Stammdaten enthalten. Zuordnung entfernt.`)
    return false
  })
  if (next.warnings.some((warning) => warning.startsWith('Gutschrift oder negativer'))) next.confidence = Math.min(next.confidence, 0.74)
  next.warnings = [...new Set(next.warnings)]
  return next
}

/** Direction is relative to our organization, never to the invoice's supplier. */
export function normalizeInvoiceDirection(raw: Record<string, unknown>) {
  const result = { ...raw }
  const warnings = Array.isArray(raw.warnings) ? [...raw.warnings] : []
  const evidence = typeof raw.organizationRoleEvidence === 'string' ? raw.organizationRoleEvidence.trim() : ''
  const role = evidence ? raw.organizationRole : 'UNKNOWN'
  if (raw.documentType === 'CREDIT_NOTE') {
    if (role === 'RECIPIENT') result.type = 'IN'
    else if (role === 'ISSUER') result.type = 'OUT'
    else warnings.push('Zahlungsrichtung der Gutschrift unklar. Einnahme/Ausgabe bitte prüfen.')
  } else {
    result.type = role === 'ISSUER' ? 'IN' : 'OUT'
    if (role !== 'ISSUER' && role !== 'RECIPIENT') {
      warnings.push('Rechnungssteller und Empfänger nicht sicher zugeordnet. Vorsorglich als Ausgabe eingeordnet; bitte prüfen.')
    }
  }
  result.warnings = warnings
  return result
}
