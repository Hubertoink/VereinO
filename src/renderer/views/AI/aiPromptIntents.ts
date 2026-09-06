import type { TAiActionPlan, TAiTextGenerateInput, TReportsExportInput } from '../../../../electron/main/ipc/schemas'
import type { TagRow } from './aiViewTypes'
import { isoDate, normalizeLookup } from './aiText'
import { findPlanChange, findPlanFilter, planItemValue, planValueList, planValueString } from './aiPlanDomain'

const TAG_ACTION_COLORS = [
  '#2962FF', '#00B8D4', '#26A69A', '#00C853', '#FFD600',
  '#FF9100', '#FF7043', '#F50057', '#9C27B0', '#7C4DFF'
]

export function tagPromptFromPlan(plan: TAiActionPlan, fallbackPrompt: string) {
  const names = [
    ...planValueList(
      findPlanChange(plan, ['name', 'names', 'tag', 'tags'], ['add', 'set', 'append'])
    ),
    ...plan.items.flatMap((item) => planValueList(planItemValue(item, ['name', 'tag', 'tags'])))
  ]
    .map(cleanTagCandidateName)
    .filter(isLikelyTagName)
    .filter(
      (name, idx, list) =>
        list.findIndex((item) => normalizeLookup(item) === normalizeLookup(name)) === idx
    )
  if (names.length) return `Lege Tags ${names.join(', ')} an.`
  return fallbackPrompt
}

export function voucherTagPromptFromPlan(plan: TAiActionPlan, fallbackPrompt: string) {
  const sourceTag = cleanTagCandidateName(
    planValueString(findPlanFilter(plan, ['tag', 'tags', 'sourceTag', 'source_tag']))
  )
  const addedTags = planValueList(
    findPlanChange(plan, ['tags', 'tag', 'addedTags', 'added_tags'], ['add', 'append'])
  )
    .map(cleanTagCandidateName)
    .filter(isLikelyTagName)
  if (sourceTag && addedTags.length) {
    return `Ergänze bei allen Buchungen mit Tag ${sourceTag} zusätzlich den Tag ${addedTags.join(', ')}.`
  }
  return fallbackPrompt
}

export function routeTextType(prompt: string): TAiTextGenerateInput['type'] {
  const normalized = prompt.toLowerCase()
  if (
    /(bericht|report|kassier|jahres|finanz|auswertung|einnahm|ausgab|saldo|bilanz|umsatz|gewinn|verlust|tag|tags|kategorie|kategorien|stammdaten|konto|konten|budget|budgets)/.test(
      normalized
    )
  )
    return 'REPORT_TEXT'
  if (/(mitglied|info|nachricht|mail|email|einladung|veranstaltung|fest)/.test(normalized)) {
    return normalized.includes('einladung') ? 'INVITATION' : 'MEMBER_MESSAGE'
  }
  return 'MEMBER_MESSAGE'
}

export function isVereinRelevantPrompt(prompt: string) {
  return /verein|vereino|geschaeftspartner|geschäftspartner|lieferant|kunde|kunden|händler|handler|zahlungsempfaenger|zahlungsempfänger|zahlungspflichtiger|mitglied|mitglieder|vorstand|kassier|kasse|beitrag|spende|rechnung|beleg|buchung|zahlung|bank|konto|konten|budget|budgets|zweckbindung|bericht|report|einnahm|ausgab|saldo|bilanz|jahr|steuer|gemeinnuetzig|gemeinnützig|einladung|veranstaltung|sommerfest|arbeitseinsatz|protokoll|finanz|sepa|lastschrift|zuwendung|quittung|import|offen|bezahlt|tag|tags|kategorie|kategorien|stammdaten|excel|xlsx|csv|tabelle|tabellen/i.test(
    prompt
  )
}

export function wantsBankImportReview(prompt: string) {
  return /(bankimport|bankbeleg|kontoauszug|offene bank|bank import|banktransaktion)/i.test(prompt)
}

export function wantsReportExport(prompt: string) {
  const normalized = normalizeLookup(prompt)
  // A report/table in the chat is a read request. Only the current message
  // may authorize a file; a planner decision or previous export is insufficient.
  if (/\b(kein|keine|keinen|keinem|keiner|ohne)\b.*\b(pdf|datei|export|download)\b|\b(nicht exportieren|nicht speichern|nur im chat)\b/.test(normalized)) {
    return false
  }
  const reportSubject = /\b(bericht|berichte|report|reports|controlling|controllingbericht|journal|auswertung|buchungen|finanzbericht|kassierbericht|jahresabschluss|budgets)\b/.test(normalized)
  const exportAction = /\b(export|exportiere|exportieren|exportier|exportiert|download|herunterladen|herunterlade)\b/.test(normalized)
  const fileFormat = /\b(pdf|csv|xlsx|excel|datei)\b/.test(normalized)
  const fileRequest = /\b(als|export|exportiere|exportieren|erstelle|erstellen|erzeuge|erzeugen|speichere|speichern|download|herunterladen)\b/.test(normalized)
  return (
    (exportAction && reportSubject) || (fileFormat && fileRequest)
  )
}

export function wantsReportFollowup(prompt: string) {
  const normalized = normalizeLookup(prompt)
  return /(bericht|report|controlling|kpi|kennzahl|auswertung|saldo|salden|einnahm|ausgab|jahresergebnis|spendenanteil|top|zeitraum|monat|monate|quartal|auffaellig|auffallig|heraussticht|raussticht)/.test(
    normalized
  )
}

export function wantsTagRead(prompt: string) {
  const normalized = normalizeLookup(prompt)
  return (
    /(tag|tags|kategorie|kategorien|stammdaten)/.test(normalized) &&
    /(welche|zeige|zeig|liste|uebersicht|ubersicht|haben wir|angelegt|gibt es)/.test(normalized)
  )
}

export function wantsTagAction(prompt: string) {
  const normalized = normalizeLookup(prompt)
  return (
    !wantsTagRead(prompt) &&
    /(tag|tags)/.test(normalized) &&
    /(anleg|erstell|speicher|uebernehm|ubernehm|loesch|losch|entfern|benenn|umbenenn|aender|ander|farbe|color)/.test(
      normalized
    )
  )
}

export function wantsVoucherTagAction(prompt: string) {
  const normalized = normalizeLookup(prompt)
  return (
    /(buchung|buchungen|beleg|belege|journal|voucher)/.test(normalized) &&
    /(tag|tags)/.test(normalized) &&
    /(ergaenz|erganz|hinzufueg|hinzufug|setze|setz|versehen|markier|markiere|entfern|loesch|losch)/.test(
      normalized
    )
  )
}

export function wantsApplyPendingTagActions(prompt: string) {
  const normalized = normalizeLookup(prompt)
  return (
    /(ja|mach|bitte|ok|okay|passt|uebernehm|ubernehm|anwenden|speicher|anlegen|erstellen|ausfuehr|ausfuhr)/.test(
      normalized
    ) && !/(nicht|abbrechen|stop)/.test(normalized)
  )
}

export function wantsApplyPendingVoucherActions(prompt: string) {
  const normalized = normalizeLookup(prompt)
  return (
    /(ja|mach|bitte|ok|okay|passt|uebernehm|ubernehm|anwenden|speicher|aendern|andern|ausfuehr|ausfuhr)/.test(
      normalized
    ) && !/(nicht|abbrechen|stop)/.test(normalized)
  )
}

export function wantsModifyPendingReview(prompt: string) {
  const normalized = normalizeLookup(prompt)
  return (
    /(aender|ander|korrigier|korrekt|setze|setz|fueg|fug|hinzufueg|hinzufug|hinzufügen|ergaenz|erganz|ergänz|tausch|wechsel|statt|auf)/.test(
      normalized
    ) &&
    /(sphaere|sphare|zweck|ideell|vermoegen|wgb|rechnungsnummer|nummer|datum|faellig|fallig|betrag|beschreibung|partei|stadt|budget|zweckbindung|tag|tags|konto|zahlungskonto)/.test(
      normalized
    ) &&
    !/(nicht|abbrechen|stop)/.test(normalized)
  )
}

export function tagColorForName(name: string) {
  let hash = 0
  for (let idx = 0; idx < name.length; idx += 1)
    hash = ((hash << 5) - hash + name.charCodeAt(idx)) | 0
  return TAG_ACTION_COLORS[Math.abs(hash) % TAG_ACTION_COLORS.length]
}

export function cleanTagCandidateName(value: string) {
  return String(value || '')
    .replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '')
    .replace(/\*\*/g, '')
    .replace(/\s*\([^)]*\)\s*$/g, '')
    .replace(/\s+[–-]\s+.*$/g, '')
    .replace(/^[„"']|[“"'.:,;]$/g, '')
    .trim()
}

export function isLikelyTagName(value: string) {
  const name = cleanTagCandidateName(value)
  const normalized = normalizeLookup(name)
  if (!name || name.length > 36 || name.length < 2) return false
  if (!/[A-Za-zÄÖÜäöüß0-9]/.test(name)) return false
  if (
    /(bereits|vorhanden|empfehlung|wenn du|moechtest|mochtest|sinnvoll|folgende|angelegt|kategorie|kategorien|budget|budgets|zweckbindung|bericht|tabelle|verein|kontext|tags?)/.test(
      normalized
    )
  )
    return false
  if (/[.!?]/.test(name)) return false
  return true
}

export function extractTagNamesFromText(text: string) {
  const names: string[] = []
  const push = (raw: string) => {
    const name = cleanTagCandidateName(raw)
    if (!isLikelyTagName(name)) return
    if (!names.some((existing) => normalizeLookup(existing) === normalizeLookup(name)))
      names.push(name)
  }

  for (const match of text.matchAll(/[„"']([^„“"']{2,36})[“"']/g)) push(match[1])

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const normalized = normalizeLookup(trimmed)
    if (
      /(bereits|empfehlung|wenn du|vorhanden|angelegt|budget|zweckbindung|kategorie)/.test(
        normalized
      )
    )
      continue
    const listed = trimmed.match(/^\s*(?:[-*•]|\d+[.)])\s+(.+)$/)
    if (listed) push(listed[1])
  }

  const explicit = text.match(
    /(?:tags?\s*(?:anlegen|erstellen|speichern)?|lege\s+(?:die\s+)?tags?|erstelle\s+(?:die\s+)?tags?)[^:\n\r]*:?\s*([^\n\r]+)/i
  )
  if (explicit) explicit[1].split(/[,;/]| und /i).forEach(push)

  return names
}

export function extractVoucherTagAppendRequest(prompt: string) {
  const names: string[] = []
  const push = (value: string) => {
    const name = cleanTagCandidateName(value)
    if (!isLikelyTagName(name)) return
    if (!names.some((existing) => normalizeLookup(existing) === normalizeLookup(name)))
      names.push(name)
  }

  const pair = prompt.match(
    /(?:buchungen|belege|journal)[\s\S]*?(?:mit\s+(?:dem\s+)?)tag\s+(.+?)(?:,|\s+noch|\s+zusätzlich|\s+zusaetzlich|\s+und)[\s\S]*?(?:mit\s+(?:dem\s+)?)tag\s+(.+?)(?:\s+(?:ergänz|ergaenz|erganz|hinzufüg|hinzufueg|hinzufug|versehen|setzen|setze|markier|markiere)|[.?!]|$)/i
  )
  if (pair) {
    push(pair[1])
    push(pair[2])
  }

  for (const match of prompt.matchAll(
    /(?:mit\s+(?:dem\s+)?|vom\s+)?tag\s+[„"']?([^,.;\n\r]+?)[“"']?(?=\s+(?:noch|zusätzlich|zusaetzlich|ergänz|ergaenz|erganz|hinzufüg|hinzufueg|hinzufug|setzen|setze|versehen|markier|markiere)|[,.;\n\r]|$)/gi
  )) {
    push(match[1])
  }

  if (names.length < 2) return null
  return { sourceTag: names[0], addedTags: names.slice(1) }
}

export function resolveExistingTagName(candidate: string, tags: TagRow[]) {
  const raw = cleanTagCandidateName(candidate)
  const normalized = normalizeLookup(raw)
  if (!normalized) return raw
  const exact = tags.find((tag) => normalizeLookup(tag.name) === normalized)
  if (exact) return exact.name
  const contained = tags
    .filter((tag) => {
      const tagName = normalizeLookup(tag.name)
      return tagName && (normalized.includes(tagName) || tagName.includes(normalized))
    })
    .sort((a, b) => normalizeLookup(b.name).length - normalizeLookup(a.name).length)[0]
  if (contained) return contained.name
  const withoutTrailingVerb = raw
    .replace(
      /\s+(haben|hat|habe|bekommen|ergaenzen|ergänzen|hinzufuegen|hinzufügen|setzen|setze)$/i,
      ''
    )
    .trim()
  const fallback = tags.find(
    (tag) => normalizeLookup(tag.name) === normalizeLookup(withoutTrailingVerb)
  )
  return fallback?.name || withoutTrailingVerb || raw
}

export function extractVoucherTagCorrection(prompt: string) {
  const match = prompt.match(/tag\s+(?:heisst|heißt|ist|lautet)\s+[„"']?([^,.;\n\r]+)[“"']?/i)
  return match ? cleanTagCandidateName(match[1]) : null
}

export function parseReportExportRequest(prompt: string): { payload: TReportsExportInput; label: string } {
  const normalized = normalizeLookup(prompt)
  const yearMatch = normalized.match(/\b(20\d{2})\b/)
  const year = yearMatch ? Number(yearMatch[1]) : new Date().getFullYear()
  const isoDates = Array.from(prompt.matchAll(/\b(20\d{2})-(\d{2})-(\d{2})\b/g)).map(
    (match) => match[0]
  )
  const relativeMonths = normalized.match(/letzte(?:n|r|s)?\s+(\d{1,2})\s+monat/)
  const today = new Date()
  const to = isoDates[1] || (relativeMonths ? isoDate(today) : `${year}-12-31`)
  const from =
    isoDates[0] ||
    (relativeMonths
      ? (() => {
          const start = new Date(today)
          start.setMonth(start.getMonth() - Number(relativeMonths[1]))
          return isoDate(start)
        })()
      : `${year}-01-01`)
  const format: TReportsExportInput['format'] = /\b(csv)\b/.test(normalized)
    ? 'CSV'
    : /\b(xlsx|excel)\b/.test(normalized)
      ? 'XLSX'
      : 'PDF'
  const type: TReportsExportInput['type'] = /(budget|plan.*ist|soll.*ist)/.test(normalized)
    ? 'BUDGET_VS_ACTUAL'
    : /(sphaere|sphare|ideell|zweckbetrieb|vermoegen|wirtschaft)/.test(normalized)
      ? 'SPHERE_SUMMARY'
      : /(zweckbindung|mittelverwendung)/.test(normalized)
        ? 'EARMARK_USAGE'
        : 'JOURNAL'
  return {
    label: `${format}-Controllingbericht ${from} bis ${to}`,
    payload: {
      type,
      format,
      from,
      to,
      fields: [
        'date',
        'voucherNo',
        'type',
        'sphere',
        'description',
        'status',
        'paymentMethod',
        'netAmount',
        'vatAmount',
        'grossAmount',
        'tags'
      ],
      amountMode: 'OUT_NEGATIVE',
      sort: 'ASC',
      sortBy: 'date'
    }
  }
}

export function wantsBookingFromFiles(prompt: string, attachedFiles: File[]) {
  const normalized = prompt.toLowerCase()
  const hasSpreadsheet = attachedFiles.some((file) => /\.(xlsx|xls|csv|tsv)$/i.test(file.name))
  if (
    /(buchung|buchungen|buchungsvorschlag|buchungsvorschläge|buche|buchen|verbuch|anlegen|lege.*buch|erstelle.*buch|rechnung|beleg|quittung|zahlung|ausgabe|ausgaben|einnahme|einnahmen|kassenzettel)/i.test(
      normalized
    )
  )
    return true
  if (
    hasSpreadsheet &&
    /(import|stammdaten|tag|tags|kategorie|kategorien|mitglied|mitglieder|tabelle|spalten|zuordnung)/i.test(
      normalized
    )
  )
    return false
  return !hasSpreadsheet
}

export function shouldProcessFilesAsBookingDocuments(prompt: string, attachedFiles: File[]) {
  return wantsBookingFromFiles(prompt, attachedFiles)
}
