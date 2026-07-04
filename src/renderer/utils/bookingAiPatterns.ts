export type BookingAIType = 'IN' | 'OUT' | 'TRANSFER' | 'INTERNAL'
export type BookingAISphere = 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'

export type BookingAIAssignment = {
  id: number
  amount?: number
  amountMode?: 'FULL' | 'FIXED'
}

export type BookingAIAccount = {
  id: number
  name: string
  kind: 'CASH' | 'BANK' | 'PAYPAL' | 'CARD' | 'OTHER'
  isActive?: number
}

export type BookingAIPattern = {
  accepted: number
  ignored?: number
  disabled?: boolean
  tags?: string[]
  type?: BookingAIType
  sphere?: BookingAISphere
  budgets?: BookingAIAssignment[]
  earmarks?: BookingAIAssignment[]
  paymentAccountId?: number | null
  transferFromAccountId?: number | null
  transferToAccountId?: number | null
  amountCents?: number
  lastUsedAt?: number
}

export type BookingAISuggestion = {
  key: string
  title: string
  reason: string
  tags?: string[]
  type?: BookingAIType
  sphere?: BookingAISphere
  budgets?: BookingAIAssignment[]
  earmarks?: BookingAIAssignment[]
  paymentAccountId?: number | null
  transferFromAccountId?: number | null
  transferToAccountId?: number | null
  learned?: boolean
  score?: number
}

export type BookingAIPatternRow = {
  key: string
  title: string
  kind: 'rule' | 'learned'
  enabled: boolean
  accepted: number
  tags?: string[]
  type?: BookingAIType
  sphere?: BookingAISphere
  budgets?: BookingAIAssignment[]
  earmarks?: BookingAIAssignment[]
  paymentAccountId?: number | null
  transferFromAccountId?: number | null
  transferToAccountId?: number | null
  amountCents?: number
  lastUsedAt?: number
}

export const AI_SUGGESTION_STORAGE_KEY = 'booking.aiSuggestions.v1'
export const AI_SUGGESTION_ENABLED_KEY = 'booking.aiSuggestions.enabled'
export const AI_PATTERNS_CHANGED_EVENT = 'booking-ai-patterns:changed'

export const BUILT_IN_BOOKING_AI_RULES: BookingAISuggestion[] = [
  {
    key: 'rule:mitgliedsbeitrag',
    title: 'Mitgliedsbeitrag erkannt',
    reason: 'Beschreibung enthält Beitrag/Mitglied.',
    tags: ['Mitgliedsbeitrag'],
    type: 'IN',
    sphere: 'IDEELL',
    score: 40,
  },
  {
    key: 'rule:spende',
    title: 'Spende erkannt',
    reason: 'Beschreibung wirkt wie eine Zuwendung.',
    tags: ['Spende'],
    type: 'IN',
    sphere: 'IDEELL',
    score: 40,
  },
  {
    key: 'rule:hosting',
    title: 'Web/Hosting erkannt',
    reason: 'Beschreibung enthält Hosting- oder Domain-Begriffe.',
    tags: ['Projekt'],
    type: 'OUT',
    score: 30,
  },
  {
    key: 'rule:ausgabe',
    title: 'Ausgabe wahrscheinlich',
    reason: 'Beschreibung klingt nach Kosten oder Einkauf.',
    type: 'OUT',
    score: 20,
  },
  {
    key: 'rule:transfer',
    title: 'Transfer erkannt',
    reason: 'Beschreibung klingt nach Umbuchung.',
    type: 'TRANSFER',
    score: 30,
  },
]

const GENERIC_TOKENS = new Set([
  'rechnung',
  'beitrag',
  'mitglied',
  'mitgliedsbeitrag',
  'jahresbeitrag',
  'spende',
  'zuwendung',
  'einkauf',
  'zahlung',
  'gebuehr',
  'gebuhr',
  'gebühr',
  'hosting',
  'webhosting',
  'domain',
  'server',
  'material',
])

export function normalizeSuggestionText(value: string) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9äöüß]+/g, ' ')
    .trim()
}

export function readAISuggestionLearning(): Record<string, BookingAIPattern> {
  try {
    const raw = localStorage.getItem(AI_SUGGESTION_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export function writeAISuggestionLearning(data: Record<string, BookingAIPattern>) {
  try {
    localStorage.setItem(AI_SUGGESTION_STORAGE_KEY, JSON.stringify(data))
    window.dispatchEvent(new CustomEvent(AI_PATTERNS_CHANGED_EVENT))
  } catch {}
}

export function isBookingAIPatternsEnabled() {
  try {
    return localStorage.getItem(AI_SUGGESTION_ENABLED_KEY) !== 'false'
  } catch {
    return true
  }
}

export function setBookingAIPatternsEnabled(enabled: boolean) {
  try {
    localStorage.setItem(AI_SUGGESTION_ENABLED_KEY, String(enabled))
    window.dispatchEvent(new CustomEvent(AI_PATTERNS_CHANGED_EVENT))
  } catch {}
}

export function resolveSuggestionTag(name: string, tagDefs: Array<{ id: number; name: string; color?: string | null }>) {
  const found = tagDefs.find((tag) => tag.name.toLowerCase() === name.toLowerCase())
  return found?.name || name
}

export function textLearningKeys(description: string) {
  const tokens = normalizeSuggestionText(description)
    .split(/\s+/)
    .filter((token) => token.length >= 5 && !GENERIC_TOKENS.has(token))
    .slice(0, 3)
  const keys = tokens.map((token) => `text:${token}`)
  if (tokens.length >= 2) keys.unshift(`phrase:${tokens[0]} ${tokens[1]}`)
  return Array.from(new Set(keys))
}

function hasAny(text: string, ...words: string[]) {
  return words.some((word) => text.includes(word))
}

function matchTransferPhrase(text: string) {
  const source = '(kasse|bar|cash|bank|konto)'
  const target = '(kasse|bar|cash|bank|konto)'
  const match = text.match(new RegExp(`\\b${source}\\s+(?:an|zu|auf|nach|in|->)\\s+${target}\\b`))
  if (!match) return null
  return { from: match[1], to: match[2] }
}

function accountForToken(token: string | undefined, accounts?: BookingAIAccount[]) {
  if (!token || !accounts?.length) return null
  const active = accounts.filter((account) => account.isActive !== 0)
  if (['kasse', 'bar', 'cash'].includes(token)) {
    return active.find((account) => account.kind === 'CASH') || active.find((account) => normalizeSuggestionText(account.name).includes('kasse')) || null
  }
  if (['bank', 'konto'].includes(token)) {
    return active.find((account) => account.kind === 'BANK') || active.find((account) => account.kind !== 'CASH') || null
  }
  return null
}

function normalizeAssignments(items?: BookingAIAssignment[]) {
  return (items || [])
    .filter((item) => Number(item.id) > 0)
    .map((item) => ({
      id: Number(item.id),
      amount: typeof item.amount === 'number' ? item.amount : undefined,
      amountMode: item.amountMode,
    }))
}

function suggestionSignature(suggestion: BookingAISuggestion) {
  const tags = [...(suggestion.tags || [])].map((tag) => tag.toLowerCase()).sort().join(',')
  const budgets = normalizeAssignments(suggestion.budgets).map((b) => `${b.id}:${b.amountMode || ''}:${Math.round((b.amount || 0) * 100)}`).sort().join(',')
  const earmarks = normalizeAssignments(suggestion.earmarks).map((e) => `${e.id}:${e.amountMode || ''}:${Math.round((e.amount || 0) * 100)}`).sort().join(',')
  return [
    suggestion.type || '',
    suggestion.sphere || '',
    tags,
    budgets,
    earmarks,
    suggestion.paymentAccountId || '',
    suggestion.transferFromAccountId || '',
    suggestion.transferToAccountId || '',
  ].join('|')
}

function materialChange(input: {
  suggestion: BookingAISuggestion
  currentTags: string[]
  currentType: BookingAIType
  currentSphere: BookingAISphere
  currentBudgets: BookingAIAssignment[]
  currentEarmarks: BookingAIAssignment[]
  currentPaymentAccountId?: number | null
  currentTransferFromAccountId?: number | null
  currentTransferToAccountId?: number | null
}) {
  const currentTagsLower = new Set((input.currentTags || []).map((tag) => tag.toLowerCase()))
  const currentBudgetIds = new Set((input.currentBudgets || []).map((item) => Number(item.id)))
  const currentEarmarkIds = new Set((input.currentEarmarks || []).map((item) => Number(item.id)))
  const tags = (input.suggestion.tags || []).filter((tag) => !currentTagsLower.has(tag.toLowerCase()))
  const budgets = normalizeAssignments(input.suggestion.budgets).filter((item) => !currentBudgetIds.has(item.id))
  const earmarks = normalizeAssignments(input.suggestion.earmarks).filter((item) => !currentEarmarkIds.has(item.id))
  return {
    tags,
    budgets,
    earmarks,
    changesType: !!input.suggestion.type && input.suggestion.type !== input.currentType,
    changesSphere: !!input.suggestion.sphere && input.suggestion.sphere !== input.currentSphere,
    changesPaymentAccount: !!input.suggestion.paymentAccountId && Number(input.suggestion.paymentAccountId) !== Number(input.currentPaymentAccountId || 0),
    changesTransferFrom: !!input.suggestion.transferFromAccountId && Number(input.suggestion.transferFromAccountId) !== Number(input.currentTransferFromAccountId || 0),
    changesTransferTo: !!input.suggestion.transferToAccountId && Number(input.suggestion.transferToAccountId) !== Number(input.currentTransferToAccountId || 0),
  }
}

export function buildAISuggestions(input: {
  description: string
  grossAmount: number
  currentTags: string[]
  currentType: BookingAIType
  currentSphere: BookingAISphere
  currentBudgets: BookingAIAssignment[]
  currentEarmarks: BookingAIAssignment[]
  currentPaymentAccountId?: number | null
  currentTransferFromAccountId?: number | null
  currentTransferToAccountId?: number | null
  tagDefs: Array<{ id: number; name: string; color?: string | null }>
  paymentAccounts?: BookingAIAccount[]
  learning: Record<string, BookingAIPattern>
}): BookingAISuggestion[] {
  if (!isBookingAIPatternsEnabled()) return []
  const text = normalizeSuggestionText(input.description)
  if (text.length < 3) return []
  const bySignature = new Map<string, BookingAISuggestion>()

  const add = (raw: BookingAISuggestion) => {
    const stored = input.learning[raw.key]
    if (stored?.disabled) return
    const resolved: BookingAISuggestion = {
      ...raw,
      tags: (raw.tags || []).map((tag) => resolveSuggestionTag(tag, input.tagDefs)),
      budgets: normalizeAssignments(raw.budgets),
      earmarks: normalizeAssignments(raw.earmarks),
    }
    const changes = materialChange({
      suggestion: resolved,
      currentTags: input.currentTags,
      currentType: input.currentType,
      currentSphere: input.currentSphere,
      currentBudgets: input.currentBudgets,
      currentEarmarks: input.currentEarmarks,
      currentPaymentAccountId: input.currentPaymentAccountId,
      currentTransferFromAccountId: input.currentTransferFromAccountId,
      currentTransferToAccountId: input.currentTransferToAccountId,
    })
    if (!changes.tags.length && !changes.budgets.length && !changes.earmarks.length && !changes.changesType && !changes.changesSphere && !changes.changesPaymentAccount && !changes.changesTransferFrom && !changes.changesTransferTo) return
    const suggestion: BookingAISuggestion = {
      ...resolved,
      tags: changes.tags,
      budgets: changes.budgets,
      earmarks: changes.earmarks,
      paymentAccountId: changes.changesPaymentAccount ? resolved.paymentAccountId : undefined,
      transferFromAccountId: changes.changesTransferFrom ? resolved.transferFromAccountId : undefined,
      transferToAccountId: changes.changesTransferTo ? resolved.transferToAccountId : undefined,
    }
    const signature = suggestionSignature(suggestion)
    const existing = bySignature.get(signature)
    if (!existing || (suggestion.score || 0) > (existing.score || 0)) bySignature.set(signature, suggestion)
  }

  if (hasAny(text, 'mitgliedsbeitrag', 'mitglied beitrag', 'jahresbeitrag', 'beitrag')) add(BUILT_IN_BOOKING_AI_RULES[0])
  if (hasAny(text, 'spende', 'zuwendung', 'donation')) add(BUILT_IN_BOOKING_AI_RULES[1])
  if (hasAny(text, 'hosting', 'webhosting', 'domain', 'server')) add(BUILT_IN_BOOKING_AI_RULES[2])
  if (hasAny(text, 'material', 'einkauf', 'rechnung', 'miete', 'gebuehr', 'gebühr')) add(BUILT_IN_BOOKING_AI_RULES[3])
  const transferMatch = matchTransferPhrase(text)
  if (hasAny(text, 'umbuchung', 'transfer') || transferMatch) {
    const transferRule = BUILT_IN_BOOKING_AI_RULES[4] || { key: 'rule:transfer', title: 'Transfer erkannt', reason: 'Beschreibung klingt nach Umbuchung.', type: 'TRANSFER' as const, score: 30 }
    const fromAccount = accountForToken(transferMatch?.from, input.paymentAccounts)
    const toAccount = accountForToken(transferMatch?.to, input.paymentAccounts)
    add({
      ...transferRule,
      reason: transferMatch ? `Beschreibung klingt nach Kontowechsel: ${transferMatch.from} an ${transferMatch.to}.` : transferRule.reason,
      transferFromAccountId: fromAccount?.id ?? undefined,
      transferToAccountId: toAccount?.id ?? undefined,
      score: (transferRule.score || 30) + (fromAccount || toAccount ? 18 : 0),
    })
  }

  for (const [key, learned] of Object.entries(input.learning)) {
    if (!key.startsWith('text:') && !key.startsWith('phrase:')) continue
    if (learned.disabled || learned.accepted <= 0) continue
    const token = key.includes(':') ? key.slice(key.indexOf(':') + 1) : ''
    if (!token || !text.includes(token)) continue
    const amountMatches = learned.amountCents ? Math.abs(Math.round(input.grossAmount * 100) - learned.amountCents) <= 1 : false
    add({
      key,
      title: 'Gelerntes Muster',
      reason: amountMatches ? `Passt zu "${token}" und Betrag.` : `Ähnliche Beschreibung wie früher: "${token}".`,
      tags: learned.tags || [],
      type: learned.type,
      sphere: learned.sphere,
      budgets: learned.budgets,
      earmarks: learned.earmarks,
      paymentAccountId: learned.paymentAccountId,
      transferFromAccountId: learned.transferFromAccountId,
      transferToAccountId: learned.transferToAccountId,
      learned: true,
      score: 60 + (amountMatches ? 20 : 0) + (learned.budgets?.length || 0) * 12 + (learned.earmarks?.length || 0) * 12 + (learned.paymentAccountId ? 10 : 0),
    })
  }

  return [...bySignature.values()]
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, 4)
}

export function rememberBookingAIPattern(input: {
  description: string
  grossAmount: number
  tags?: string[]
  type?: BookingAIType
  sphere?: BookingAISphere
  budgets?: Array<{ budgetId: number; amount: number }>
  earmarks?: Array<{ earmarkId: number; amount: number }>
  paymentAccountId?: number | null
  transferFromAccountId?: number | null
  transferToAccountId?: number | null
}) {
  if (!isBookingAIPatternsEnabled()) return
  const keys = textLearningKeys(input.description)
  if (!keys.length) return
  const gross = Number(input.grossAmount || 0)
  const hasUsefulPayload =
    !!input.tags?.length ||
    !!input.type ||
    !!input.sphere ||
    !!input.budgets?.some((item) => item.budgetId) ||
    !!input.earmarks?.some((item) => item.earmarkId) ||
    !!input.paymentAccountId ||
    !!input.transferFromAccountId ||
    !!input.transferToAccountId
  if (!hasUsefulPayload) return

  const next = readAISuggestionLearning()
  for (const key of keys) {
    const current = next[key] || { accepted: 0 }
    next[key] = {
      ...current,
      accepted: Number(current.accepted || 0) + 1,
      tags: input.tags?.length ? Array.from(new Set(input.tags)) : current.tags,
      type: input.type || current.type,
      sphere: input.sphere || current.sphere,
      budgets: input.budgets
        ?.filter((item) => item.budgetId)
        .map((item) => ({
          id: item.budgetId,
          amount: Number(item.amount || 0),
          amountMode: gross > 0 && Math.abs(Number(item.amount || 0) - gross) <= 0.01 ? 'FULL' : 'FIXED',
        })) || current.budgets,
      earmarks: input.earmarks
        ?.filter((item) => item.earmarkId)
        .map((item) => ({
          id: item.earmarkId,
          amount: Number(item.amount || 0),
          amountMode: gross > 0 && Math.abs(Number(item.amount || 0) - gross) <= 0.01 ? 'FULL' : 'FIXED',
        })) || current.earmarks,
      paymentAccountId: input.paymentAccountId || current.paymentAccountId,
      transferFromAccountId: input.transferFromAccountId || current.transferFromAccountId,
      transferToAccountId: input.transferToAccountId || current.transferToAccountId,
      amountCents: gross > 0 ? Math.round(gross * 100) : current.amountCents,
      lastUsedAt: Date.now(),
    }
  }
  writeAISuggestionLearning(next)
}

export function setBookingAIPatternEnabled(key: string, enabled: boolean) {
  const next = readAISuggestionLearning()
  const current = next[key] || { accepted: 0 }
  next[key] = { ...current, disabled: !enabled }
  writeAISuggestionLearning(next)
}

export function deleteBookingAIPattern(key: string) {
  const next = readAISuggestionLearning()
  delete next[key]
  writeAISuggestionLearning(next)
}

export function listBookingAIPatternRows(): BookingAIPatternRow[] {
  const learning = readAISuggestionLearning()
  const builtIns = BUILT_IN_BOOKING_AI_RULES.map((rule) => ({
    key: rule.key,
    title: rule.title,
    kind: 'rule' as const,
    enabled: !learning[rule.key]?.disabled,
    accepted: Number(learning[rule.key]?.accepted || 0),
    tags: rule.tags,
    type: rule.type,
    sphere: rule.sphere,
    budgets: rule.budgets,
    earmarks: rule.earmarks,
    paymentAccountId: learning[rule.key]?.paymentAccountId,
    transferFromAccountId: learning[rule.key]?.transferFromAccountId,
    transferToAccountId: learning[rule.key]?.transferToAccountId,
    amountCents: learning[rule.key]?.amountCents,
    lastUsedAt: learning[rule.key]?.lastUsedAt,
  }))
  const learned = Object.entries(learning)
    .filter(([key]) => key.startsWith('text:') || key.startsWith('phrase:'))
    .map(([key, value]) => ({
      key,
      title: key.startsWith('phrase:') ? key.slice(7) : key.slice(5),
      kind: 'learned' as const,
      enabled: !value.disabled,
      accepted: Number(value.accepted || 0),
      tags: value.tags,
      type: value.type,
      sphere: value.sphere,
      budgets: value.budgets,
      earmarks: value.earmarks,
      paymentAccountId: value.paymentAccountId,
      transferFromAccountId: value.transferFromAccountId,
      transferToAccountId: value.transferToAccountId,
      amountCents: value.amountCents,
      lastUsedAt: value.lastUsedAt,
    }))
  return [...builtIns, ...learned].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'rule' ? -1 : 1
    return (b.lastUsedAt || 0) - (a.lastUsedAt || 0) || a.title.localeCompare(b.title)
  })
}
