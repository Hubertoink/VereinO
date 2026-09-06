import type { TAiBankImportReviewOutput } from '../../../../electron/main/ipc/schemas'
import type { AiBankReviewState, AiBankReviewSuggestion } from './aiViewTypes'
import { normalizeLookup } from './aiText'

const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })

export function bankReviewBody(result: TAiBankImportReviewOutput) {
  if (!result.suggestions.length) return 'Es wurden keine offenen Bankbelege gefunden.'
  const grouped = result.suggestions.reduce<Record<string, number>>((acc, suggestion) => {
    acc[suggestion.action] = (acc[suggestion.action] || 0) + 1
    return acc
  }, {})
  const lines = [
    result.summary || `${result.suggestions.length} offene Bankbelege geprüft.`,
    `Zuordnen: ${grouped.LINK_EXISTING || 0}`,
    `Dauerbuchungen: ${grouped.APPLY_RECURRING || 0}`,
    `Neu anlegen: ${grouped.CREATE_BOOKING || 0}`,
    `Geprüft markieren: ${grouped.MARK_CHECKED || 0}`,
    `Manuell prüfen: ${grouped.NEEDS_MANUAL_REVIEW || 0}`
  ]
  return lines.join('\n')
}

export function bankSuggestionLabel(suggestion: AiBankReviewSuggestion) {
  if (suggestion.resolved === 'LINKED') return 'Verknüpft'
  if (suggestion.resolved === 'CREATED') return 'Gebucht'
  if (suggestion.resolved === 'CHECKED') return 'Geprüft'
  if (suggestion.action === 'LINK_EXISTING') return 'Treffer'
  if (suggestion.action === 'APPLY_RECURRING') return 'Dauerbuchung'
  if (suggestion.action === 'CREATE_BOOKING') return 'Neue Buchung'
  if (suggestion.action === 'MARK_CHECKED') return 'Ohne Buchung'
  return 'Manuell prüfen'
}

export function bankSuggestionTone(suggestion: AiBankReviewSuggestion) {
  if (suggestion.resolved) return 'done'
  if (suggestion.action === 'LINK_EXISTING') return 'match'
  if (suggestion.action === 'APPLY_RECURRING') return 'match'
  if (suggestion.action === 'CREATE_BOOKING') return 'create'
  if (suggestion.action === 'MARK_CHECKED') return 'check'
  return 'manual'
}

export function bankSuggestionTitle(suggestion: AiBankReviewSuggestion) {
  const transaction = suggestion.transaction || {}
  const counterparty = transaction.counterparty || suggestion.bookingCandidate?.counterparty || null
  const purpose = transaction.purpose || suggestion.bookingCandidate?.description || null
  return (
    [counterparty, purpose].filter(Boolean).join(' · ') || `Bankbeleg #${suggestion.transactionId}`
  )
}

export function bankSuggestionAmount(suggestion: AiBankReviewSuggestion) {
  const transaction = suggestion.transaction || {}
  const amount = Number(transaction.amount ?? suggestion.bookingCandidate?.grossAmount ?? 0)
  if (!amount) return ''
  const direction = transaction.direction || suggestion.bookingCandidate?.type
  return `${direction === 'OUT' ? '-' : '+'}${euro.format(Math.abs(amount))}`
}

export function isRestrictiveBankImportPrompt(prompt: string) {
  const normalized = normalizeLookup(prompt)
  return /(nur|ausschliesslich|lediglich|bestimmte|passende|zutun|bezug|mit .*tag|mit .*kategorie|getraenk|spende|mitgliedsbeitrag|miete|webhosting|kasse)/.test(
    normalized
  )
}

export function extractBankSuggestionIdsFromAiText(text: string, availableIds: number[]) {
  const available = new Set(availableIds.map(Number))
  const ids = new Set<number>()
  for (const match of String(text || '').matchAll(
    /(?:bankbeleg|bankimport|transaktion|beleg)\s*#?\s*(\d+)/gi
  )) {
    const id = Number(match[1])
    if (available.has(id)) ids.add(id)
  }
  return Array.from(ids)
}

export function bankSuggestionSearchText(suggestion: AiBankReviewSuggestion) {
  const transaction = suggestion.transaction || {}
  const candidate = (suggestion.bookingCandidate || {}) as Partial<
    NonNullable<AiBankReviewSuggestion['bookingCandidate']>
  >
  return normalizeLookup(
    [
      suggestion.transactionId,
      transaction.bookingDate,
      transaction.valueDate,
      transaction.counterparty,
      transaction.purpose,
      transaction.reference,
      transaction.amount,
      candidate.date,
      candidate.description,
      candidate.counterparty,
      candidate.grossAmount,
      (candidate.tags || []).join(' '),
      suggestion.reason,
      suggestion.recurringBookingName,
      suggestion.scheduledDate,
      (suggestion.warnings || []).join(' ')
    ]
      .filter(Boolean)
      .join(' ')
  )
}

export function bankSuggestionScoreFromText(suggestion: AiBankReviewSuggestion, text: string) {
  const haystack = bankSuggestionSearchText(suggestion)
  const normalizedText = normalizeLookup(text)
  let score = 0
  const transaction = suggestion.transaction || {}
  const candidate = (suggestion.bookingCandidate || {}) as Partial<
    NonNullable<AiBankReviewSuggestion['bookingCandidate']>
  >
  const important = [
    transaction.counterparty,
    transaction.purpose,
    transaction.reference,
    candidate.description,
    candidate.counterparty,
    ...(candidate.tags || [])
  ]
    .filter(Boolean)
    .map((value) => normalizeLookup(value))
  for (const token of important) {
    if (token && token.length >= 4 && normalizedText.includes(token))
      score += Math.min(80, token.length * 4)
  }
  const words = normalizedText.split(/\s+/).filter((word) => word.length >= 4)
  for (const word of words) {
    if (haystack.includes(word)) score += 6
  }
  const amount = Number(transaction.amount ?? candidate.grossAmount ?? 0)
  if (amount && normalizedText.includes(String(Math.abs(amount)).replace('.', ' '))) score += 20
  return score
}

export function extractBankSuggestionsFromAiText(result: TAiBankImportReviewOutput, text: string) {
  const allSuggestions = (result.suggestions || []) as AiBankReviewSuggestion[]
  const ids = extractBankSuggestionIdsFromAiText(
    text,
    allSuggestions.map((suggestion) => suggestion.transactionId)
  )
  if (ids.length)
    return allSuggestions.filter((suggestion) => ids.includes(Number(suggestion.transactionId)))
  const scored = allSuggestions
    .map((suggestion) => ({ suggestion, score: bankSuggestionScoreFromText(suggestion, text) }))
    .filter((item) => item.score >= 18)
    .sort((a, b) => b.score - a.score)
  if (!scored.length) return []
  const bestScore = scored[0].score
  return scored
    .filter((item) => item.score >= Math.max(18, bestScore - 12))
    .map((item) => item.suggestion)
}

export function filterBankReviewByAiText(
  result: TAiBankImportReviewOutput,
  userPrompt: string,
  aiText: string
): AiBankReviewState {
  const allSuggestions = (result.suggestions || []) as AiBankReviewSuggestion[]
  if (!isRestrictiveBankImportPrompt(userPrompt)) {
    return {
      ...(result as AiBankReviewState),
      suggestions: allSuggestions,
      allSuggestions,
      sourceTotal: allSuggestions.length
    }
  }
  const matched = extractBankSuggestionsFromAiText(result, aiText)
  const normalizedAiText = normalizeLookup(aiText)
  const saysNone = /(keine|kein|keinen).{0,80}(passend|relevant|treffer|bezug|vorschlag)/.test(
    normalizedAiText
  )
  const visible = matched.length ? matched : saysNone ? [] : allSuggestions
  return {
    ...(result as AiBankReviewState),
    suggestions: visible,
    allSuggestions,
    sourceTotal: allSuggestions.length,
    filterSummary:
      visible.length === allSuggestions.length
        ? null
        : `${visible.length} von ${allSuggestions.length} KI-Vorschlägen für diese Anfrage ausgewählt.`
  }
}
