import { safeStorage } from 'electron'
import OpenAI from 'openai'
import { zodTextFormat } from 'openai/helpers/zod'
import {
  AiBankImportReviewResult,
  AiBankImportReviewResultStructured,
  AiBookingAnalysisResult,
  AiBookingAnalysisResultStructured,
  AiActionPlan,
  AiActionPlanStructured,
  AiTextDraftResult,
  AiTextDraftResultStructured,
  type TAiActionPlan,
  type TAiBankImportReviewResult,
  type TAiBookingAnalysisResult,
  type TAiTextDraftResult
} from '../ipc/schemas'
import { getSetting, setSetting } from './settings'

const API_KEY_SETTING = 'ai.openai.apiKey'
const MODEL_SETTING = 'ai.openai.model'
const TEXT_MODEL_SETTING = 'ai.openai.textModel'
const EFFORT_SETTING = 'ai.openai.reasoningEffort'
const DEFAULT_MODEL = 'gpt-5.5'
const DEFAULT_TEXT_MODEL = 'gpt-5.4-mini'

const MODEL_PRICING_USD_PER_MILLION: Record<string, { input: number; cachedInput: number; output: number }> = {
  'gpt-5.5': { input: 5, cachedInput: 0.5, output: 30 },
  'gpt-5.4': { input: 2.5, cachedInput: 0.25, output: 15 },
  'gpt-5.4-mini': { input: 0.75, cachedInput: 0.075, output: 4.5 },
  'gpt-5.4-nano': { input: 0.2, cachedInput: 0.02, output: 1.25 },
  'gpt-5': { input: 1.25, cachedInput: 0.125, output: 10 },
  'gpt-5-mini': { input: 0.25, cachedInput: 0.025, output: 2 },
  'gpt-5-nano': { input: 0.05, cachedInput: 0.005, output: 0.4 }
}

type AiStoredSecret = {
  encrypted: boolean
  value: string
}

export type AiSettings = {
  hasApiKey: boolean
  model: string
  textModel: string
  defaultReasoningEffort: 'low' | 'medium' | 'high'
}

export type AiUsage = {
  inputTokens: number
  cachedInputTokens: number
  outputTokens: number
  reasoningTokens: number
  totalTokens: number
  estimatedCostUsd: number | null
  pricingNote: string
}

export type AiContext = {
  organization?: { name?: string | null; activeName?: string | null }
  paymentAccounts?: Array<{ id: number; name: string; kind: string; ibanLast4?: string | null; color?: string | null; sortOrder?: number; isActive?: number }>
  budgets?: Array<{ id: number; label?: string; year?: number; sphere?: string; categoryName?: string | null; projectName?: string | null; amountPlanned?: number | null; isArchived?: number }>
  earmarks?: Array<{ id: number; code?: string; name?: string; isActive?: number }>
  tags?: Array<{ id?: number; name: string; color?: string | null; usage?: number }>
  members?: any
  reports?: any
  invoices?: any
  generatedAt?: string
}

export type AiInputFile = {
  fileName: string
  mimeType?: string | null
  dataBase64: string
}

export type AiBankReviewTransaction = {
  id: number
  bookingDate: string
  direction: 'IN' | 'OUT'
  amount: number
  currency?: string | null
  counterparty?: string | null
  purpose?: string | null
  endToEndId?: string | null
  bankReference?: string | null
  paymentAccountId?: number | null
  paymentAccountName?: string | null
  matches?: Array<{
    id: number
    voucherNo?: string | null
    date?: string | null
    type?: string | null
    description?: string | null
    grossAmount?: number | null
    paymentAccountId?: number | null
    paymentAccountName?: string | null
    score?: number | null
    sharedWords?: number | null
    dateDistance?: number | null
    paymentAccountMismatch?: boolean | null
    paymentAccountWarning?: string | null
  }>
}

function canEncrypt() {
  try {
    return safeStorage.isEncryptionAvailable()
  } catch {
    return false
  }
}

function encryptSecret(value: string): AiStoredSecret {
  if (canEncrypt()) {
    return {
      encrypted: true,
      value: safeStorage.encryptString(value).toString('base64')
    }
  }
  return { encrypted: false, value }
}

function decryptSecret(stored?: AiStoredSecret | string | null) {
  if (!stored) return ''
  if (typeof stored === 'string') return stored
  if (!stored.encrypted) return stored.value || ''
  try {
    return safeStorage.decryptString(Buffer.from(stored.value, 'base64'))
  } catch {
    return ''
  }
}

export function getAiSettings(): AiSettings {
  const apiKey = decryptSecret(getSetting<AiStoredSecret | string>(API_KEY_SETTING))
  const model = getSetting<string>(MODEL_SETTING) || DEFAULT_MODEL
  const textModel = getSetting<string>(TEXT_MODEL_SETTING) || DEFAULT_TEXT_MODEL
  const effort = getSetting<'low' | 'medium' | 'high'>(EFFORT_SETTING) || 'medium'
  return {
    hasApiKey: !!apiKey.trim(),
    model,
    textModel,
    defaultReasoningEffort: effort
  }
}

export function setAiSettings(input: {
  apiKey?: string
  model?: string
  textModel?: string
  defaultReasoningEffort?: 'low' | 'medium' | 'high'
}) {
  if (input.apiKey !== undefined) {
    const trimmed = input.apiKey.trim()
    if (trimmed) setSetting(API_KEY_SETTING, encryptSecret(trimmed))
  }
  if (input.model?.trim()) setSetting(MODEL_SETTING, input.model.trim())
  if (input.textModel?.trim()) setSetting(TEXT_MODEL_SETTING, input.textModel.trim())
  if (input.defaultReasoningEffort) setSetting(EFFORT_SETTING, input.defaultReasoningEffort)
  const next = getAiSettings()
  return {
    ok: true,
    hasApiKey: next.hasApiKey,
    model: next.model,
    textModel: next.textModel,
    defaultReasoningEffort: next.defaultReasoningEffort
  }
}

function getApiKey() {
  const key = decryptSecret(getSetting<AiStoredSecret | string>(API_KEY_SETTING)).trim()
  if (!key) throw new Error('OpenAI API-Key fehlt. Bitte in KI > Einstellungen hinterlegen.')
  return key
}

function createClient() {
  return new OpenAI({ apiKey: getApiKey() })
}

function extractOutputText(response: any) {
  if (typeof response?.output_text === 'string') return response.output_text
  const parts: string[] = []
  for (const item of response?.output || []) {
    for (const content of item?.content || []) {
      if (typeof content?.text === 'string') parts.push(content.text)
    }
  }
  return parts.join('\n').trim()
}

function parseStructured<T>(response: any, schema: { parse: (value: unknown) => T }): T {
  const parsed = response?.output_parsed
  if (parsed) return schema.parse(parsed)
  const text = extractOutputText(response)
  if (!text) throw new Error('OpenAI hat keine auswertbare Antwort geliefert.')
  return schema.parse(JSON.parse(text))
}

function normalizeUsage(response: any, model: string): AiUsage {
  const usage = response?.usage || {}
  const inputTokens = Number(usage.input_tokens ?? usage.prompt_tokens ?? 0)
  const outputTokens = Number(usage.output_tokens ?? usage.completion_tokens ?? 0)
  const totalTokens = Number(usage.total_tokens ?? inputTokens + outputTokens)
  const cachedInputTokens = Number(
    usage.input_tokens_details?.cached_tokens
    ?? usage.prompt_tokens_details?.cached_tokens
    ?? 0
  )
  const reasoningTokens = Number(
    usage.output_tokens_details?.reasoning_tokens
    ?? usage.completion_tokens_details?.reasoning_tokens
    ?? 0
  )
  const pricing = MODEL_PRICING_USD_PER_MILLION[model]
  const billableInputTokens = Math.max(0, inputTokens - cachedInputTokens)
  const estimatedCostUsd = pricing
    ? ((billableInputTokens * pricing.input) + (cachedInputTokens * pricing.cachedInput) + (outputTokens * pricing.output)) / 1_000_000
    : null
  return {
    inputTokens,
    cachedInputTokens,
    outputTokens,
    reasoningTokens,
    totalTokens,
    estimatedCostUsd: estimatedCostUsd == null ? null : Math.round(estimatedCostUsd * 1_000_000) / 1_000_000,
    pricingNote: pricing
      ? 'Geschaetzt mit OpenAI Standard API-Preisen pro 1M Token, ohne Batch/Flex/Priority/Data-Residency-Aufschlaege.'
      : `Keine lokale Preistabelle fuer Modell ${model}.`
  }
}

function compactContext(context: AiContext) {
  return {
    organization: context.organization,
    generatedAt: context.generatedAt,
    paymentAccounts: (context.paymentAccounts || [])
      .filter((account) => account.isActive !== 0)
      .map((account) => ({ id: account.id, name: account.name, kind: account.kind, ibanLast4: account.ibanLast4, color: account.color, sortOrder: account.sortOrder })),
    budgets: (context.budgets || [])
      .filter((budget) => budget.isArchived !== 1)
      .map((budget) => ({ id: budget.id, label: budget.label, year: budget.year, sphere: budget.sphere, categoryName: budget.categoryName, projectName: budget.projectName, amountPlanned: budget.amountPlanned })),
    earmarks: (context.earmarks || [])
      .filter((earmark) => earmark.isActive !== 0)
      .map((earmark) => ({ id: earmark.id, code: earmark.code, name: earmark.name })),
    tags: (context.tags || []).map((tag) => ({ id: tag.id, name: tag.name, color: tag.color, usage: tag.usage })).slice(0, 120),
    members: context.members,
    reports: context.reports,
    invoices: context.invoices
  }
}

function isVereinRelevantPrompt(prompt: string) {
  const normalized = prompt.toLowerCase()
  return /verein|vereino|mitglied|mitglieder|vorstand|kassier|kasse|beitrag|spende|rechnung|beleg|buchung|zahlung|bank|konto|konten|budget|budgets|zweckbindung|bericht|report|einnahm|ausgab|saldo|bilanz|jahr|steuer|gemeinnuetzig|gemeinnützig|einladung|veranstaltung|sommerfest|arbeitseinsatz|protokoll|finanz|sepa|lastschrift|zuwendung|quittung|import|offen|bezahlt|tag|tags|kategorie|kategorien|stammdaten|excel|xlsx|csv|tabelle|tabellen/.test(normalized)
}

function outOfScopeDraft(): TAiTextDraftResult {
  return {
    title: 'Nicht im VereinO-Kontext',
    body: 'Ich kann dir hier bei VereinO-Aufgaben helfen, zum Beispiel Mitglieder, Buchungen, Belege, Bankimport, Beiträge, Spenden, Einladungen und Vereinsberichte. Für Themen ohne Vereins- oder VereinO-Bezug nutze bitte einen separaten allgemeinen KI-Chat.',
    notes: ['Keine VereinO-Daten wurden fuer diese Anfrage ausgewertet.']
  }
}

function emptyUsage(note: string): AiUsage {
  return {
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    totalTokens: 0,
    estimatedCostUsd: 0,
    pricingNote: note
  }
}

function inferInputFileMimeType(file: AiInputFile) {
  const supplied = file.mimeType?.trim()
  if (supplied) return supplied
  const name = file.fileName.toLowerCase()
  if (name.endsWith('.png')) return 'image/png'
  if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image/jpeg'
  if (name.endsWith('.webp')) return 'image/webp'
  if (name.endsWith('.gif')) return 'image/gif'
  if (name.endsWith('.pdf')) return 'application/pdf'
  if (name.endsWith('.xlsx')) return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  if (name.endsWith('.xls')) return 'application/vnd.ms-excel'
  if (name.endsWith('.csv')) return 'text/csv'
  if (name.endsWith('.tsv')) return 'text/tab-separated-values'
  return 'application/octet-stream'
}

function toResponseFileContent(file: AiInputFile) {
  const mimeType = inferInputFileMimeType(file)
  const dataUrl = `data:${mimeType};base64,${file.dataBase64}`
  if (mimeType.startsWith('image/')) {
    return {
      type: 'input_image',
      image_url: dataUrl,
      detail: 'high'
    }
  }
  return {
    type: 'input_file',
    filename: file.fileName,
    file_data: dataUrl
  }
}

export async function testAiConnection() {
  try {
    const client = createClient()
    const settings = getAiSettings()
    await client.responses.create({
      model: settings.model,
      input: 'Antworte nur mit OK.',
      text: { verbosity: 'low' },
      reasoning: { effort: 'low' }
    } as any)
    if (settings.textModel !== settings.model) {
      await client.responses.create({
        model: settings.textModel,
        input: 'Antworte nur mit OK.',
        text: { verbosity: 'low' },
        reasoning: { effort: 'low' }
      } as any)
    }
    return { ok: true }
  } catch (error: any) {
    return { ok: false, error: error?.message || String(error) }
  }
}

export async function analyzeBookingDocuments(input: {
  files: AiInputFile[]
  context: AiContext
  model?: string | null
  reasoningEffort?: 'low' | 'medium' | 'high'
}): Promise<{ model: string; result: TAiBookingAnalysisResult; usage: AiUsage }> {
  if (!input.files.length) throw new Error('Bitte mindestens eine Rechnung oder einen Beleg hochladen.')
  const settings = getAiSettings()
  const model = input.model || settings.model
  const prompt = [
    'Du bist ein vorsichtiger Buchungsassistent fuer einen deutschen Verein.',
    'Extrahiere aus den angehaengten Belegen, Rechnungen oder Tabellen Buchungsvorschlaege fuer VereinO.',
    'Wenn eine Excel-/CSV-/Tabellendatei mehrere Buchungszeilen enthaelt, erstelle pro erkannter Buchungszeile einen eigenen Kandidaten.',
    'Erzeuge keine finale Buchung. Liefere nur Kandidaten, Warnungen und Evidenz.',
    'Nutze Budget-, Zweckbindungs- und Konto-IDs nur aus dem bereitgestellten Kontext.',
    'Bei Tags: Nutze vorhandene VereinO-Tags, wenn sie passen. Wenn eine Datei eine Tag-/Kategorie-Spalte mit einem noch nicht vorhandenen Tag enthaelt, uebernimm den Tag-Namen trotzdem als vorgeschlagenen Tag und ergaenze eine Warnung, dass der Tag vor dem Buchen angelegt werden muss.',
    'Wenn ein Feld unsicher ist, waehle den plausibelsten Wert und ergaenze eine Warnung.',
    'Betrage werden in Euro als positive Zahlen geliefert. Ausgabe/Einnahme steckt in type.',
    '',
    'VereinO-Kontext:',
    JSON.stringify(compactContext(input.context))
  ].join('\n')
  const response = await createClient().responses.create({
    model,
    reasoning: { effort: input.reasoningEffort || settings.defaultReasoningEffort },
    text: { format: zodTextFormat(AiBookingAnalysisResultStructured, 'vereino_booking_analysis') },
    input: [
      {
        role: 'user',
        content: [
          { type: 'input_text', text: prompt },
          ...input.files.map(toResponseFileContent)
        ]
      }
    ]
  } as any)
  return { model, result: AiBookingAnalysisResult.parse(parseStructured(response, AiBookingAnalysisResultStructured)), usage: normalizeUsage(response, model) } as any
}

export async function planAiAction(input: {
  prompt: string
  conversation?: Array<{ role: 'user' | 'assistant'; title?: string; body: string }>
  context: AiContext
  model?: string
}): Promise<{ model: string; plan: TAiActionPlan; usage: AiUsage }> {
  const settings = getAiSettings()
  const model = input.model || settings.textModel
  const conversation = (input.conversation || []).slice(-10).map((message) => ({
    role: message.role,
    title: message.title || null,
    body: String(message.body || '').slice(0, 1800)
  }))
  const toolCatalog = [
    {
      entity: 'vouchers',
      operations: ['read', 'create', 'update'],
      filters: ['tag', 'q', 'date', 'type', 'sphere', 'paymentMethod', 'amount'],
      changes: ['tags add/remove/set', 'description set', 'note append', 'paymentAccountId set', 'budget/earmark via review']
    },
    {
      entity: 'members',
      operations: ['read', 'create', 'update'],
      filters: ['name', 'status', 'boardRole', 'contribution'],
      changes: ['contribution_amount', 'contribution_interval', 'boardRole', 'status', 'join_date', 'leave_date', 'next_due_date']
    },
    {
      entity: 'payments',
      operations: ['read', 'create', 'update'],
      filters: ['memberName', 'memberId', 'periodKey', 'interval', 'openOnly'],
      changes: ['amount', 'date', 'paymentAccountId', 'paymentAccountName', 'description', 'tags']
    },
    {
      entity: 'tags',
      operations: ['read', 'create', 'update', 'delete'],
      filters: ['name'],
      changes: ['name', 'color']
    },
    {
      entity: 'reports',
      operations: ['read', 'export', 'generateText'],
      filters: ['year', 'from', 'to', 'type', 'format']
    },
    {
      entity: 'bankImport',
      operations: ['reviewBankImport']
    }
  ]

  const response = await createClient().responses.create({
    model,
    reasoning: { effort: 'low' },
    text: { format: zodTextFormat(AiActionPlanStructured, 'vereino_action_plan'), verbosity: 'low' },
    input: [
      {
        role: 'user',
        content: [{
          type: 'input_text',
          text: [
            'Du bist der Aktionsplaner fuer VereinO. Analysiere, was der Nutzer will, und liefere ausschliesslich einen strukturierten Action Plan.',
            'Du fuehrst keine finalen Schreibaktionen aus. Schreibende Aktionen muessen safety REVIEW_REQUIRED haben.',
            'Wenn die Anfrage ausserhalb von VereinO/Vereinsverwaltung liegt, setze entity unknown, operation none, safety BLOCKED und erklaere kurz in answer.',
            'Nutze echte Namen aus dem Kontext, z.B. vorhandene Tags, Mitglieder, Zahlungskonten, Budgets und Zweckbindungen.',
            'Bei Folgefragen nutze die Unterhaltung. Korrigiere fruehere Annahmen, wenn der Nutzer sie verbessert.',
            'Fuer Beispiele wie "alle Buchungen mit Tag X bekommen Tag Y": entity vouchers, operation update, filter field tag eq X, change field tags mode add value [Y].',
            'Fuer "lege Tags X, Y an": entity tags, operation create, changes field name mode add value [X,Y].',
            'Fuer "lege Mitglieder an": entity members, operation create, jedes Mitglied als items.values mit keys name, birthDate, joinDate, boardRole, contributionAmount, contributionInterval, nextDueDate. Datumswerte als YYYY-MM-DD, contributionAmount als Zahl.',
            'Fuer "Mitglieder bearbeiten": entity members, operation update, Zielgruppe als filters und Aenderungen als changes, z.B. contribution_amount set 20 und contribution_interval set MONTHLY.',
            'Fuer "offene/faellige Mitgliedsbeitraege, ausstehende Beitragszahlungen, wer schuldet Beitrag": entity payments, operation read, safety READ_ONLY.',
            'Fuer "erstelle eine Buchung fuer Mitgliedsbeitrag und verknuepfe sie": entity payments, operation create, filter memberName, change amount/date/paymentAccountName/tags. Das lokale Tool erstellt danach einen Review mit Buchung und Beitragsverknuepfung.',
            'Wenn vorher offene Mitgliedsbeitraege genannt wurden und der Nutzer danach "hierzu/dazu eine Buchung anlegen/verknuepfen" schreibt, ist das payments create, nicht members create.',
            'Wenn vorher ein Report/Controllingbericht besprochen wurde und der Nutzer einen anderen Zeitraum, "letzte X Monate", "was sticht heraus" oder weitere KPIs nennt, ist das entity reports, operation export/generateText, nicht members.',
            'Fuer "Report/Bericht fuer die letzten X Monate" oder "Controlling fuer Zeitraum" ist entity reports, operation export, safety REVIEW_REQUIRED.',
            'Fuer reine Fragen: operation read, safety READ_ONLY, answer nur wenn eine direkte kurze Antwort ohne Tool reicht.',
            '',
            'Erlaubtes Toolset:',
            JSON.stringify(toolCatalog),
            '',
            'VereinO-Kontext:',
            JSON.stringify(compactContext(input.context)),
            '',
            'Unterhaltung:',
            JSON.stringify(conversation),
            '',
            'Aktuelle Nutzernachricht:',
            input.prompt
          ].join('\n')
        }]
      }
    ]
  } as any)

  return {
    model,
    plan: AiActionPlan.parse(parseStructured(response, AiActionPlanStructured)),
    usage: normalizeUsage(response, model)
  }
}

export async function generateAiText(input: {
  type: 'INVITATION' | 'MEMBER_MESSAGE' | 'REPORT_TEXT'
  prompt: string
  tone?: string
  audience?: string
  model?: string
  context?: AiContext
  files?: AiInputFile[]
}): Promise<{ model: string; result: TAiTextDraftResult; usage: AiUsage }> {
  if (!input.files?.length && !isVereinRelevantPrompt(input.prompt)) {
    const settings = getAiSettings()
    const model = input.model || settings.textModel
    return { model, result: outOfScopeDraft(), usage: emptyUsage('Lokal abgelehnt, kein OpenAI API-Call.') }
  }
  const settings = getAiSettings()
  const model = input.model || settings.textModel
  const taskLabel = input.type === 'INVITATION'
    ? 'Einladung oder Ankuendigung fuer Vereinsmitglieder'
    : input.type === 'MEMBER_MESSAGE'
      ? 'Mitgliederkommunikation'
      : 'Berichtstext fuer Kassierbericht oder Vereinsbericht'
  const response = await createClient().responses.create({
    model,
    reasoning: { effort: 'low' },
    text: { format: zodTextFormat(AiTextDraftResultStructured, 'vereino_text_draft'), verbosity: 'low' },
    input: [
      {
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: [
              `Aufgabe: ${taskLabel}.`,
              `Zielgruppe: ${input.audience || 'Vereinsmitglieder'}.`,
              `Ton: ${input.tone || 'freundlich, klar, professionell'}.`,
              'Du bist die VereinO KI und hilfst ausschliesslich bei Vereinsverwaltung, Vereinsfinanzen, Mitgliedern, Belegen, Bankimport, Beitragen, Spenden, Einladungen und Reports.',
              'Wenn die Anfrage keinen Bezug zu VereinO oder Vereinsfragen hat, lehne sie kurz ab und verweise auf VereinO-Aufgaben.',
              'Nutze die bereitgestellten VereinO-Daten aktiv. Bei Fragen nach Mitgliedern, Einnahmen, Ausgaben, Salden, Reports oder offenen Punkten antworte mit konkreten Zahlen/Namen aus dem Kontext.',
              'Erfinde keine Daten. Wenn ein Detail im Kontext fehlt, sage konkret, welche Information fehlt.',
              'Schreibe auf Deutsch. Liefere direkt nutzbare Antworten oder Entwuerfe ohne Platzhalter, ausser fehlende Daten sind unvermeidbar.',
              input.files?.length ? 'Beruecksichtige die angehaengten Dateien. Bei Excel/CSV/Tabellen: analysiere Spalten, erkannte Stammdaten, moegliche Importzuordnung, Dublettenrisiken und fehlende Felder.' : '',
              '',
              'VereinO-Datenkontext:',
              JSON.stringify(compactContext(input.context || {})),
              '',
              input.prompt
            ].join('\n')
          },
          ...(input.files || []).map(toResponseFileContent)
        ]
      }
    ]
  } as any)
  return {
    model,
    result: AiTextDraftResult.parse(parseStructured(response, AiTextDraftResultStructured)),
    usage: normalizeUsage(response, model)
  }
}

export async function reviewBankImportTransactions(input: {
  transactions: AiBankReviewTransaction[]
  context: AiContext
  model?: string | null
}): Promise<{ model: string; result: TAiBankImportReviewResult; usage: AiUsage | null }> {
  if (!input.transactions.length) {
    return { model: getAiSettings().textModel, result: { suggestions: [], summary: 'Keine offenen Bankbelege vorhanden.', warnings: [] }, usage: null } as any
  }
  const settings = getAiSettings()
  const model = input.model || settings.textModel
  const prompt = [
    'Du bist ein vorsichtiger Bankimport-Assistent fuer einen deutschen Verein.',
    'Pruefe offene Bankbelege und entscheide pro Beleg genau eine Aktion:',
    '- LINK_EXISTING: wenn eine vorhandene Buchung sehr wahrscheinlich passt.',
    '- CREATE_BOOKING: wenn keine passende Buchung existiert und aus dem Bankbeleg eine neue Buchung vorbereitet werden soll.',
    '- MARK_CHECKED: wenn der Beleg nachweislich nicht buchungsrelevant ist.',
    '- NEEDS_MANUAL_REVIEW: wenn die Daten uneindeutig sind.',
    '',
    'Wichtige Regeln:',
    'Verknuepfe nur mit voucherId aus den mitgegebenen matches.',
    'LINK_EXISTING nur bei passendem Typ, Betrag und hoher Plausibilitaet.',
    'CREATE_BOOKING erzeugt nur einen Vorschlag, keine finale Buchung.',
    'Nutze fuer neue Buchungsvorschlaege Zahlungskonto, Datum, Betrag und Richtung des Bankbelegs.',
    'Wenn Budget-/Zweckbindungs-IDs unsicher sind, lasse diese Listen leer und schreibe eine Warnung.',
    'Betrage werden positiv geliefert; Ausgabe/Einnahme steckt in type.',
    '',
    'VereinO-Kontext:',
    JSON.stringify(compactContext(input.context)),
    '',
    'Offene Bankbelege mit lokalen Treffern:',
    JSON.stringify(input.transactions)
  ].join('\n')

  const response = await createClient().responses.create({
    model,
    reasoning: { effort: 'low' },
    text: { format: zodTextFormat(AiBankImportReviewResultStructured, 'vereino_bank_import_review'), verbosity: 'low' },
    input: [
      {
        role: 'user',
        content: [{ type: 'input_text', text: prompt }]
      }
    ]
  } as any)

  return { model, result: AiBankImportReviewResult.parse(parseStructured(response, AiBankImportReviewResultStructured)), usage: normalizeUsage(response, model) } as any
}
