import type { AiMentionOption } from './aiViewTypes'
import { normalizeLookup } from './aiText'

export const STATIC_AI_MENTIONS: AiMentionOption[] = [
  {
    id: 'area-bankimport',
    label: 'Bankimport',
    insert: 'Bankimport',
    scope: 'Bereich',
    description: 'Offene Bankbelege prüfen, verknüpfen oder als Buchung vorbereiten',
    plannerHint: 'entity bankImport; nutze Bankimport-Tools und offene Banktransaktionen.'
  },
  {
    id: 'area-buchungen',
    label: 'Buchungen',
    insert: 'Buchungen',
    scope: 'Bereich',
    description: 'Journal, Belege, Tags und Buchungsvorschläge',
    plannerHint: 'entity vouchers; nutze Buchungs-/Journal-Tools.'
  },
  {
    id: 'area-rechnungen',
    label: 'Rechnungen',
    insert: 'Rechnungen',
    scope: 'Bereich',
    description: 'Belege oder Rechnungen auslesen und Buchungsvorschläge erstellen',
    plannerHint: 'entity vouchers; bei Anhängen Beleganalyse verwenden.'
  },
  {
    id: 'area-mitglieder',
    label: 'Mitglieder',
    insert: 'Mitglieder',
    scope: 'Bereich',
    description: 'Mitglieder lesen, anlegen, bearbeiten und Beiträge prüfen',
    plannerHint: 'entity members/payments; nutze Mitglieder- und Beitragsdaten.'
  },
  {
    id: 'area-beitraege',
    label: 'Beiträge',
    insert: 'Beiträge',
    scope: 'Bereich',
    description: 'Offene Mitgliedsbeiträge, Zahlungen und Verknüpfungen',
    plannerHint: 'entity payments; nutze Beitragsstatus und Zahlungsvorschläge.'
  },
  {
    id: 'area-reports',
    label: 'Reports',
    insert: 'Reports',
    scope: 'Bereich',
    description: 'Controlling, KPIs und PDF/CSV/XLSX-Exporte',
    plannerHint: 'entity reports; nutze Reporting- und Export-Tools.'
  },
  {
    id: 'area-tags',
    label: 'Tags',
    insert: 'Tags',
    scope: 'Bereich',
    description: 'Tags anzeigen, anlegen, ändern oder Buchungen taggen',
    plannerHint: 'entity tags oder vouchers.update tags; nutze Tag-Kontext.'
  },
  {
    id: 'area-budgets',
    label: 'Budgets',
    insert: 'Budgets',
    scope: 'Bereich',
    description: 'Budgets, Kategorien und Plan/Ist-Auswertungen',
    plannerHint: 'entity budgets/reports; nutze Budget- und Kategorie-Kontext.'
  },
  {
    id: 'area-zweckbindungen',
    label: 'Zweckbindungen',
    insert: 'Zweckbindungen',
    scope: 'Bereich',
    description: 'Zweckbindungen und Mittelverwendung',
    plannerHint: 'entity earmarks/reports; nutze Zweckbindungs-Kontext.'
  },
  {
    id: 'area-zahlungskonten',
    label: 'Zahlungskonten',
    insert: 'Zahlungskonten',
    scope: 'Bereich',
    description: 'Bank, Kasse und Kontosalden',
    plannerHint: 'nutze Zahlungskonten, Kontosalden und paymentAccountId.'
  },
  {
    id: 'sphere-ideell',
    label: 'IDEELL',
    insert: 'IDEELL',
    scope: 'Sphäre',
    description: 'Ideeller Bereich',
    plannerHint: 'filter/set sphere IDEELL.'
  },
  {
    id: 'sphere-zweck',
    label: 'ZWECK',
    insert: 'ZWECK',
    scope: 'Sphäre',
    description: 'Zweckbetrieb',
    plannerHint: 'filter/set sphere ZWECK.'
  },
  {
    id: 'sphere-vermoegen',
    label: 'VERMÖGEN',
    insert: 'VERMÖGEN',
    scope: 'Sphäre',
    description: 'Vermögensverwaltung',
    plannerHint: 'filter/set sphere VERMOEGEN.'
  },
  {
    id: 'sphere-wgb',
    label: 'WGB',
    insert: 'WGB',
    scope: 'Sphäre',
    description: 'Wirtschaftlicher Geschäftsbetrieb',
    plannerHint: 'filter/set sphere WGB.'
  }
]

export function mentionInsertToken(option: AiMentionOption) {
  return `@${option.insert.replace(/\s+/g, '-')}`
}

export function activeMentionTrigger(text: string, cursor: number) {
  const beforeCursor = text.slice(0, cursor)
  const match = beforeCursor.match(/(^|\s)@([^\s@]*)$/)
  if (!match) return null
  const start = beforeCursor.length - match[2].length - 1
  return { start, end: cursor, query: match[2] }
}

export function extractMentionTokens(text: string) {
  return Array.from(String(text || '').matchAll(/@([^\s,.;!?]+)/g))
    .map((match) => match[1])
    .filter(Boolean)
}

export function buildMentionPlannerHint(prompt: string, options: AiMentionOption[]) {
  const tokens = extractMentionTokens(prompt)
  if (!tokens.length) return ''
  const optionByInsert = new Map(
    options.map((option) => [normalizeLookup(option.insert.replace(/\s+/g, '-')), option])
  )
  const matched = tokens
    .map((token) => optionByInsert.get(normalizeLookup(token)))
    .filter(Boolean) as AiMentionOption[]
  if (!matched.length) return ''
  return [
    'Explizite @-Kontexthinweise des Nutzers:',
    ...matched.map(
      (option) => `- @${option.insert}: ${option.scope} ${option.label}. ${option.plannerHint}`
    )
  ].join('\n')
}
