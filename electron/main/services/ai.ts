import { safeStorage, session } from 'electron'
import OpenAI from 'openai'
import { zodTextFormat } from 'openai/helpers/zod'
import { PDFDocument } from 'pdf-lib'
import { z } from 'zod'
import {
  AiBankImportReviewResult,
  AiBankImportReviewResultStructured,
  AiBookingAnalysisResult,
  AiBookingAnalysisResultStructured,
  AiInvoiceExtractionResult,
  AiInvoiceExtractionResultStructured,
  AiActionPlan,
  AiActionPlanStructured,
  AiTextDraftResult,
  AiTextDraftResultStructured,
  type TAiActionPlan,
  type TAiBankImportReviewResult,
  type TAiBookingAnalysisResult,
  type TAiInvoiceExtractionResult,
  type TAiTextDraftResult
} from '../ipc/schemas'
import { getSetting, setSetting } from './settings'
import { normalizeInvoicePacketGroups } from './invoicePacketSegmentation'

const API_KEY_SETTING = 'ai.openai.apiKey'
const MODEL_SETTING = 'ai.openai.model'
const TEXT_MODEL_SETTING = 'ai.openai.textModel'
const EFFORT_SETTING = 'ai.openai.reasoningEffort'
const PROVIDER_SETTING = 'ai.openai.provider'
const PROXY_MODE_SETTING = 'ai.network.proxyMode'
const PROXY_URL_SETTING = 'ai.network.proxyUrl'
const PROXY_BYPASS_SETTING = 'ai.network.proxyBypassRules'
const DEFAULT_PROVIDER = 'openai'

type AiProvider = 'openai' | 'minimax'
type AiProxyMode = 'system' | 'direct' | 'manual'

type AiProviderPreset = {
  apiBaseUrl: string
  defaultModel: string
  defaultTextModel: string
  allowedModels: string[]
}

const AI_PROVIDER_PRESETS: Record<AiProvider, AiProviderPreset> = {
  openai: {
    apiBaseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-5.5',
    defaultTextModel: 'gpt-5.4-mini',
    allowedModels: ['gpt-5.5', 'gpt-5.4', 'gpt-5.4-mini', 'gpt-5.4-nano']
  },
  minimax: {
    apiBaseUrl: 'https://api.minimaxi.com/v1',
    defaultModel: 'MiniMax-M3',
    defaultTextModel: 'MiniMax-M3',
    allowedModels: ['MiniMax-M3', 'MiniMax-M1', 'MiniMax-Text-01']
  }
}

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
  provider: AiProvider
  apiBaseUrl: string
  proxyMode: AiProxyMode
  proxyUrl: string
  proxyBypassRules: string
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

type AiAnalysisSource = {
  fileName: string
  pageNumber?: number
  pageCount?: number
  label: string
}

type ExpandedAiInputFile = {
  file: AiInputFile
  source: AiAnalysisSource
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

function getProviderPreset(provider?: string | null): AiProviderPreset {
  if (provider === 'minimax') return AI_PROVIDER_PRESETS.minimax
  return AI_PROVIDER_PRESETS.openai
}

function normalizeProviderModel(provider: AiProvider, model: string | null | undefined, kind: 'model' | 'textModel') {
  const preset = getProviderPreset(provider)
  const fallback = kind === 'model' ? preset.defaultModel : preset.defaultTextModel
  const value = model?.trim()
  return value && preset.allowedModels.includes(value) ? value : fallback
}

export function getAiSettings(): AiSettings {
  const apiKey = decryptSecret(getSetting<AiStoredSecret | string>(API_KEY_SETTING))
  const effort = getSetting<'low' | 'medium' | 'high'>(EFFORT_SETTING) || 'medium'
  const provider = getSetting<AiProvider>(PROVIDER_SETTING) || DEFAULT_PROVIDER
  const model = normalizeProviderModel(provider, getSetting<string>(MODEL_SETTING), 'model')
  const textModel = normalizeProviderModel(provider, getSetting<string>(TEXT_MODEL_SETTING), 'textModel')
  const apiBaseUrl = getProviderPreset(provider).apiBaseUrl
  const proxyMode = getSetting<AiProxyMode>(PROXY_MODE_SETTING) || 'system'
  return {
    hasApiKey: !!apiKey.trim(),
    model,
    textModel,
    defaultReasoningEffort: effort,
    provider,
    apiBaseUrl,
    proxyMode: ['system', 'direct', 'manual'].includes(proxyMode) ? proxyMode : 'system',
    proxyUrl: getSetting<string>(PROXY_URL_SETTING) || '',
    proxyBypassRules: getSetting<string>(PROXY_BYPASS_SETTING) || '<local>'
  }
}

export function setAiSettings(input: {
  apiKey?: string
  model?: string
  textModel?: string
  defaultReasoningEffort?: 'low' | 'medium' | 'high'
  provider?: AiProvider
  apiBaseUrl?: string
  proxyMode?: AiProxyMode
  proxyUrl?: string
  proxyBypassRules?: string
}) {
  const current = getAiSettings()
  const provider = input.provider || current.provider

  if (input.apiKey !== undefined) {
    const trimmed = input.apiKey.trim()
    if (trimmed) setSetting(API_KEY_SETTING, encryptSecret(trimmed))
  }
  setSetting(MODEL_SETTING, normalizeProviderModel(provider, input.model ?? current.model, 'model'))
  setSetting(TEXT_MODEL_SETTING, normalizeProviderModel(provider, input.textModel ?? current.textModel, 'textModel'))
  if (input.defaultReasoningEffort) setSetting(EFFORT_SETTING, input.defaultReasoningEffort)
  if (input.provider) setSetting(PROVIDER_SETTING, input.provider)
  if (input.proxyMode) setSetting(PROXY_MODE_SETTING, input.proxyMode)
  if (input.proxyUrl !== undefined) {
    const proxyUrl = input.proxyUrl.trim()
    if (proxyUrl) {
      let parsed: URL
      try {
        parsed = new URL(proxyUrl)
      } catch {
        throw new Error('Die manuelle Proxy-Adresse ist ungültig.')
      }
      if (!['http:', 'https:', 'socks4:', 'socks5:'].includes(parsed.protocol)) {
        throw new Error('Der Proxy muss HTTP, HTTPS, SOCKS4 oder SOCKS5 verwenden.')
      }
      if (parsed.username || parsed.password) {
        throw new Error('Proxy-Zugangsdaten bitte über Windows bzw. die Firmenanmeldung verwalten.')
      }
    }
    setSetting(PROXY_URL_SETTING, proxyUrl)
  }
  if (input.proxyBypassRules !== undefined) {
    setSetting(PROXY_BYPASS_SETTING, input.proxyBypassRules.trim())
  }
  const next = getAiSettings()
  return {
    ok: true,
    hasApiKey: next.hasApiKey,
    model: next.model,
    textModel: next.textModel,
    defaultReasoningEffort: next.defaultReasoningEffort,
    provider: next.provider,
    apiBaseUrl: next.apiBaseUrl,
    proxyMode: next.proxyMode,
    proxyUrl: next.proxyUrl,
    proxyBypassRules: next.proxyBypassRules
  }
}

function getApiKey() {
  const key = decryptSecret(getSetting<AiStoredSecret | string>(API_KEY_SETTING)).trim()
  if (!key) throw new Error('API-Key fehlt. Bitte in KI > Einstellungen hinterlegen.')
  return key
}

const aiNetworkSession = () => session.fromPartition('persist:vereino-ai-network')
let appliedProxySignature = ''
let proxyConfiguration: Promise<void> | null = null

function electronProxyConfig(settings: AiSettings) {
  if (settings.proxyMode === 'direct') return { mode: 'direct' as const }
  if (settings.proxyMode === 'manual') {
    if (!settings.proxyUrl.trim()) throw new Error('Bitte eine manuelle Proxy-Adresse eintragen.')
    return {
      mode: 'fixed_servers' as const,
      proxyRules: settings.proxyUrl.trim(),
      proxyBypassRules: settings.proxyBypassRules.trim()
    }
  }
  return { mode: 'system' as const }
}

async function configureAiNetwork(settings: AiSettings) {
  const config = electronProxyConfig(settings)
  const signature = JSON.stringify(config)
  if (signature === appliedProxySignature && proxyConfiguration) return proxyConfiguration
  appliedProxySignature = signature
  proxyConfiguration = aiNetworkSession().setProxy(config).catch((error) => {
    appliedProxySignature = ''
    proxyConfiguration = null
    throw error
  })
  return proxyConfiguration
}

function createElectronFetch(settings: AiSettings): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    await configureAiNetwork(settings)
    return aiNetworkSession().fetch(input as any, init as any) as any
  }) as typeof fetch
}

export function createClient() {
  const settings = getAiSettings()
  return new OpenAI({
    apiKey: getApiKey(),
    baseURL: settings.apiBaseUrl,
    fetch: createElectronFetch(settings)
  })
}

export function extractOutputText(response: any) {
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

export function normalizeUsage(response: any, model: string): AiUsage {
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

export function compactContext(context: AiContext) {
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

function buildAnalysisSourceLabel(fileName: string, pageNumber?: number, pageCount?: number) {
  if (pageNumber && pageCount && pageCount > 1) return `${fileName} · Seite ${pageNumber} von ${pageCount}`
  return fileName
}

function derivedPdfPageName(fileName: string, pageNumber: number, pageCount: number) {
  const match = fileName.match(/^(.*?)(\.pdf)$/i)
  const baseName = match?.[1] || fileName
  const suffix = String(pageNumber).padStart(String(pageCount).length, '0')
  return `${baseName}__page_${suffix}.pdf`
}

async function splitPdfIntoAnalysisFiles(file: AiInputFile): Promise<ExpandedAiInputFile[]> {
  const pdfBytes = Buffer.from(file.dataBase64, 'base64')
  const loaded = await PDFDocument.load(pdfBytes, { ignoreEncryption: true })
  const pageCount = loaded.getPageCount()
  if (pageCount <= 1) {
    return [{
      file,
      source: {
        fileName: file.fileName,
        pageNumber: 1,
        pageCount,
        label: buildAnalysisSourceLabel(file.fileName, pageCount > 1 ? 1 : undefined, pageCount > 1 ? pageCount : undefined)
      }
    }]
  }

  const pages: ExpandedAiInputFile[] = []
  for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
    const singlePage = await PDFDocument.create()
    const [copiedPage] = await singlePage.copyPages(loaded, [pageIndex])
    singlePage.addPage(copiedPage)
    const bytes = await singlePage.save()
    const pageNumber = pageIndex + 1
    pages.push({
      file: {
        fileName: derivedPdfPageName(file.fileName, pageNumber, pageCount),
        mimeType: 'application/pdf',
        dataBase64: Buffer.from(bytes).toString('base64')
      },
      source: {
        fileName: file.fileName,
        pageNumber,
        pageCount,
        label: buildAnalysisSourceLabel(file.fileName, pageNumber, pageCount)
      }
    })
  }
  return pages
}

async function expandInputFilesForAnalysis(files: AiInputFile[]): Promise<ExpandedAiInputFile[]> {
  const expanded: ExpandedAiInputFile[] = []
  for (const file of files) {
    const mimeType = inferInputFileMimeType(file)
    if (mimeType === 'application/pdf') {
      expanded.push(...await splitPdfIntoAnalysisFiles(file))
      continue
    }
    expanded.push({
      file,
      source: {
        fileName: file.fileName,
        label: buildAnalysisSourceLabel(file.fileName)
      }
    })
  }
  return expanded
}

export async function testAiConnection() {
  const settings = getAiSettings()
  let resolvedProxy = ''
  try {
    await configureAiNetwork(settings)
    resolvedProxy = await aiNetworkSession().resolveProxy(settings.apiBaseUrl)
    const client = createClient()
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
    return {
      ok: true,
      proxyMode: settings.proxyMode,
      resolvedProxy: resolvedProxy || 'DIRECT',
      targetUrl: settings.apiBaseUrl
    }
  } catch (error: any) {
    const rawMessage = error?.message || String(error)
    const errorCode = String(error?.code || error?.cause?.code || '').trim()
    const combined = `${errorCode} ${rawMessage}`.toUpperCase()
    let errorMessage = rawMessage
    if (combined.includes('407') || combined.includes('PROXY_AUTH')) {
      errorMessage = 'Der Proxy verlangt eine Anmeldung (HTTP 407). Bitte Windows-/Firmenanmeldung oder Proxy-Richtlinie prüfen.'
    } else if (combined.includes('CERT') || combined.includes('SELF_SIGNED') || combined.includes('UNABLE_TO_VERIFY')) {
      errorMessage = 'Die TLS-Zertifikatsprüfung ist fehlgeschlagen. Vermutlich fehlt das Firmen-CA-Zertifikat im Windows-Zertifikatsspeicher.'
    } else if (combined.includes('TIMEDOUT') || combined.includes('TIMEOUT') || combined.includes('ABORT')) {
      errorMessage = 'Die Verbindung ist abgelaufen. Proxy oder Firewall haben die Anfrage möglicherweise nicht weitergeleitet.'
    } else if (combined.includes('ENOTFOUND') || combined.includes('NAME_NOT_RESOLVED')) {
      errorMessage = 'Der API-Host konnte nicht aufgelöst werden. Bitte DNS- und Proxy-Konfiguration prüfen.'
    } else if (combined.includes('401') || combined.includes('UNAUTHORIZED')) {
      errorMessage = 'Die API hat den Schlüssel abgelehnt (HTTP 401).'
    } else if (combined.includes('403') || combined.includes('FORBIDDEN')) {
      errorMessage = 'Die API oder Firmenrichtlinie hat die Anfrage abgelehnt (HTTP 403).'
    }
    return {
      ok: false,
      error: errorMessage,
      errorCode: errorCode || undefined,
      proxyMode: settings.proxyMode,
      resolvedProxy: resolvedProxy || undefined,
      targetUrl: settings.apiBaseUrl
    }
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
  const expandedFiles = await expandInputFilesForAnalysis(input.files)
  const sourceManifest = expandedFiles.map((item, idx) => `${idx + 1}. ${item.source.label}`).join('\n')
  const prompt = [
    'Du bist ein vorsichtiger Buchungsassistent fuer einen deutschen Verein.',
    'Extrahiere aus den angehaengten Belegen, Rechnungen oder Tabellen Buchungsvorschlaege fuer VereinO.',
    'Jede angehaengte Quelle ist eine eigenstaendige Quelleinheit. Mehrseitige PDFs wurden vorab seitenweise getrennt.',
    'Vermische niemals Inhalte aus verschiedenen Quelleinheiten in einem Kandidaten.',
    'Setze fuer jeden Kandidaten source.fileName exakt auf den Originaldateinamen aus der Quellenliste.',
    'Wenn eine Quelle aus einer PDF-Seite stammt, setze source.pageNumber und source.pageCount passend zur Quellenliste.',
    'Wenn eine Quelle genau einen einzelnen Beleg oder Kassenbon enthaelt, erzeuge dafuer genau einen Kandidaten.',
    'Wenn eine Excel-/CSV-/Tabellendatei mehrere Buchungszeilen enthaelt, erstelle pro erkannter Buchungszeile einen eigenen Kandidaten.',
    'Erzeuge keine finale Buchung. Liefere nur Kandidaten, Warnungen und Evidenz.',
    'Nutze Budget-, Zweckbindungs- und Konto-IDs nur aus dem bereitgestellten Kontext.',
    'Bei Tags: Nutze vorhandene VereinO-Tags, wenn sie passen. Wenn eine Datei eine Tag-/Kategorie-Spalte mit einem noch nicht vorhandenen Tag enthaelt, uebernimm den Tag-Namen trotzdem als vorgeschlagenen Tag und ergaenze eine Warnung, dass der Tag vor dem Buchen angelegt werden muss.',
    'Wenn ein Feld unsicher ist, waehle den plausibelsten Wert und ergaenze eine Warnung.',
    'Betrage werden in Euro als positive Zahlen geliefert. Ausgabe/Einnahme steckt in type.',
    '',
    'Quellenliste:',
    sourceManifest,
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
          ...expandedFiles.flatMap((item, idx) => ([
            { type: 'input_text', text: `Quelle ${idx + 1}: ${item.source.label}` },
            toResponseFileContent(item.file)
          ]))
        ]
      }
    ]
  } as any)
  return { model, result: AiBookingAnalysisResult.parse(parseStructured(response, AiBookingAnalysisResultStructured)), usage: normalizeUsage(response, model) } as any
}

const MAX_TRANSIENT_INVOICE_BYTES = 10 * 1024 * 1024
const MAX_TRANSIENT_INVOICE_PAGES = 50

const InvoicePacketSegmentationStructured = z.object({
  groups: z.array(z.object({
    pageNumbers: z.array(z.number().int().positive()),
    confidence: z.number().min(0).max(1),
    reason: z.string(),
    warnings: z.array(z.string())
  })).min(1),
  warnings: z.array(z.string())
})

export type InvoicePacketGroup = {
  pageNumbers: number[]
  confidence: number
  reason: string
  warnings: string[]
  dataBase64: string
}

async function pdfForPages(source: PDFDocument, pageNumbers: number[]) {
  const output = await PDFDocument.create()
  const pages = await output.copyPages(source, pageNumbers.map((page) => page - 1))
  for (const page of pages) output.addPage(page)
  return Buffer.from(await output.save()).toString('base64')
}

export async function segmentInvoicePacket(file: AiInputFile): Promise<{
  groups: InvoicePacketGroup[]
  warnings: string[]
}> {
  await validateTransientInvoiceFile(file)
  const bytes = Buffer.from(file.dataBase64, 'base64')
  const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true })
  const pageCount = pdf.getPageCount()
  if (pageCount <= 1) {
    return {
      groups: [{ pageNumbers: [1], confidence: 1, reason: 'Einseitige PDF', warnings: [], dataBase64: file.dataBase64 }],
      warnings: []
    }
  }

  const pageFiles = await splitPdfIntoAnalysisFiles(file)
  const settings = getAiSettings()
  const response = await createClient().responses.create({
    model: settings.model,
    reasoning: { effort: settings.defaultReasoningEffort },
    text: { format: zodTextFormat(InvoicePacketSegmentationStructured, 'vereino_invoice_packet_segmentation') },
    input: [{
      role: 'user',
      content: [
        {
          type: 'input_text',
          text: [
            `Diese PDF hat ${pageCount} Seiten und kann mehrere hintereinander gescannte Rechnungen enthalten.`,
            'Gruppiere ausschließlich aufeinanderfolgende Seiten, die zu derselben Rechnung gehören.',
            'Nutze Rechnungsnummer, Lieferant, Datum, Seitennummern, Überträge, Summen und Layout als Indizien.',
            'Jede Seite von 1 bis zur letzten Seite muss exakt einmal vorkommen; keine Seite auslassen oder doppelt verwenden.',
            'Eine neue Rechnungsnummer oder ein klar neuer Rechnungskopf beginnt normalerweise eine neue Gruppe.',
            'Folgeseiten, Anlagen und Seitenangaben wie Seite 2 von 3 bleiben bei ihrer Rechnung.',
            'Bei unsicheren Grenzen senke confidence und erkläre die Unsicherheit in warnings.',
            'Extrahiere noch keine Buchungsdaten.'
          ].join('\n')
        },
        ...pageFiles.flatMap((page, index) => ([
          { type: 'input_text', text: `Seite ${index + 1} von ${pageCount}` },
          toResponseFileContent(page.file)
        ]))
      ]
    }]
  } as any)
  const segmented = InvoicePacketSegmentationStructured.parse(
    parseStructured(response, InvoicePacketSegmentationStructured)
  )
  const normalized = normalizeInvoicePacketGroups(segmented.groups, pageCount)
  return {
    groups: await Promise.all(normalized.map(async (group) => ({
      ...group,
      dataBase64: normalized.length === 1 && group.pageNumbers.length === pageCount
        ? file.dataBase64
        : await pdfForPages(pdf, group.pageNumbers)
    }))),
    warnings: segmented.warnings
  }
}

function hasInvoiceMagic(bytes: Buffer, mimeType: string) {
  if (mimeType === 'application/pdf') return bytes.subarray(0, 5).toString('ascii') === '%PDF-'
  if (mimeType === 'image/png') {
    return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  }
  if (mimeType === 'image/jpeg') return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  if (mimeType === 'image/webp') {
    return bytes.length >= 12 && bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP'
  }
  return false
}

async function validateTransientInvoiceFile(file: AiInputFile) {
  const mimeType = inferInputFileMimeType(file)
  const bytes = Buffer.from(file.dataBase64, 'base64')
  if (!bytes.length || bytes.length > MAX_TRANSIENT_INVOICE_BYTES) {
    throw new Error('Die KI-Analyse unterstützt Rechnungen bis 10 MB.')
  }
  if (!hasInvoiceMagic(bytes, mimeType)) {
    throw new Error('Dateityp und Dateiinhalt der Rechnung stimmen nicht überein.')
  }
  if (mimeType === 'application/pdf') {
    const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true })
    if (pdf.getPageCount() > MAX_TRANSIENT_INVOICE_PAGES) {
      throw new Error(`Die KI-Analyse unterstützt PDFs bis ${MAX_TRANSIENT_INVOICE_PAGES} Seiten.`)
    }
  }
}

export async function analyzeInvoiceDocument(input: {
  file: AiInputFile
  context: Pick<AiContext, 'paymentAccounts' | 'budgets' | 'earmarks' | 'tags' | 'generatedAt'>
}): Promise<{ model: string; result: TAiInvoiceExtractionResult; usage: AiUsage }> {
  await validateTransientInvoiceFile(input.file)
  const settings = getAiSettings()
  const model = settings.model
  const context = {
    generatedAt: input.context.generatedAt,
    paymentAccounts: (input.context.paymentAccounts || [])
      .filter((account) => account.isActive !== 0)
      .map((account) => ({ id: account.id, name: account.name, kind: account.kind })),
    budgets: (input.context.budgets || [])
      .filter((budget) => budget.isArchived !== 1)
      .map((budget) => ({ id: budget.id, label: budget.label, year: budget.year, sphere: budget.sphere })),
    earmarks: (input.context.earmarks || [])
      .filter((earmark) => earmark.isActive !== 0)
      .map((earmark) => ({ id: earmark.id, code: earmark.code, name: earmark.name })),
    tags: (input.context.tags || []).map((tag) => ({ id: tag.id, name: tag.name })).slice(0, 120)
  }
  const prompt = [
    'Analysiere genau diese eine Rechnung fuer einen deutschen Verein.',
    'Liefere ausschliesslich die strukturierten Rechnungs- und Buchungsfelder.',
    'Erfinde keine Werte: Nutze null, leere Arrays und Warnungen, wenn etwas nicht sicher erkennbar ist.',
    'Bewahre Rechnungsnummer und IBAN exakt; Datumswerte muessen YYYY-MM-DD sein.',
    'grossAmount, netAmount und taxAmount sind positive Euro-Betraege. type zeigt Einnahme oder Ausgabe.',
    'Nutze Konto-, Budget- und Zweckbindungs-IDs nur aus dem folgenden Stammdatenkontext.',
    'Schlage nur passende vorhandene Tags vor. Vermische keine Daten aus anderen Rechnungen.',
    '',
    'Minimaler VereinO-Stammdatenkontext:',
    JSON.stringify(context)
  ].join('\n')
  const response = await createClient().responses.create({
    model,
    reasoning: { effort: settings.defaultReasoningEffort },
    text: { format: zodTextFormat(AiInvoiceExtractionResultStructured, 'vereino_invoice_extraction') },
    input: [
      {
        role: 'user',
        content: [
          { type: 'input_text', text: prompt },
          toResponseFileContent(input.file)
        ]
      }
    ]
  } as any)
  return {
    model,
    result: AiInvoiceExtractionResult.parse(
      parseStructured(response, AiInvoiceExtractionResultStructured)
    ),
    usage: normalizeUsage(response, model)
  }
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
      operations: ['reviewBankImport', 'linkExisting']
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
            'Denke wie ein Kassier: Belege, Bankimporte, Buchungen und Zahlungskonten muessen nachvollziehbar zusammenpassen. Plane keine Aktion, die Duplikate erzeugt oder Bankbelege unverbunden laesst.',
            'Wenn der Nutzer eine fachliche Aktion verlangt, die im erlaubten Toolset nicht sicher abbildbar ist, waehle keine ungefaehr passende Ersatzaktion. Setze safety BLOCKED oder REVIEW_REQUIRED mit einer klaren Rueckfrage in answer.',
            'Nutze echte Namen aus dem Kontext, z.B. vorhandene Tags, Mitglieder, Zahlungskonten, Budgets und Zweckbindungen.',
            'Bei Folgefragen nutze die Unterhaltung. Korrigiere fruehere Annahmen, wenn der Nutzer sie verbessert.',
            'Fuer Beispiele wie "alle Buchungen mit Tag X bekommen Tag Y": entity vouchers, operation update, filter field tag eq X, change field tags mode add value [Y].',
            'Fuer "lege Tags X, Y an": entity tags, operation create, changes field name mode add value [X,Y].',
            'Fuer "lege Mitglieder an": entity members, operation create, jedes Mitglied als items.values mit keys name, birthDate, joinDate, boardRole, contributionAmount, contributionInterval, nextDueDate. Datumswerte als YYYY-MM-DD, contributionAmount als Zahl.',
            'Fuer "Mitglieder bearbeiten": entity members, operation update, Zielgruppe als filters und Aenderungen als changes, z.B. contribution_amount set 20 und contribution_interval set MONTHLY.',
            'Fuer "offene/faellige Mitgliedsbeitraege, ausstehende Beitragszahlungen, wer schuldet Beitrag": entity payments, operation read, safety READ_ONLY.',
            'Fuer "erstelle eine Buchung fuer Mitgliedsbeitrag und verknuepfe sie": entity payments, operation create, filter memberName, change amount/date/paymentAccountName/tags. Das lokale Tool erstellt danach einen Review mit Buchung und Beitragsverknuepfung.',
            'Wenn vorher offene Mitgliedsbeitraege genannt wurden und der Nutzer danach "hierzu/dazu eine Buchung anlegen/verknuepfen" schreibt, ist das payments create, nicht members create.',
            'Fuer "Bankbeleg/Bankimport mit bestehender Buchung verknuepfen": entity bankImport, operation linkExisting, safety REVIEW_REQUIRED. Das ist kein Storno und keine Ersatzbuchung.',
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
    'Denke wie ein Kassier: Jeder offene Bankbeleg soll entweder mit einer vorhandenen Buchung verknuepft, als neue Buchung vorbereitet, als nicht buchungsrelevant markiert oder bewusst manuell geklaert werden. Lass Bankbelege nicht unverbunden, wenn du eine Buchung daraus erzeugst.',
    'Pruefe offene Bankbelege und entscheide pro Beleg genau eine Aktion:',
    '- LINK_EXISTING: wenn eine vorhandene Buchung sehr wahrscheinlich passt.',
    '- CREATE_BOOKING: wenn keine passende Buchung existiert und aus dem Bankbeleg eine neue Buchung vorbereitet werden soll.',
    '- MARK_CHECKED: wenn der Beleg nachweislich nicht buchungsrelevant ist.',
    '- NEEDS_MANUAL_REVIEW: wenn die Daten uneindeutig sind.',
    '',
    'Wichtige Regeln:',
    'Verknuepfe nur mit voucherId aus den mitgegebenen matches.',
    'LINK_EXISTING nur bei passendem Typ, Betrag und hoher Plausibilitaet.',
    'Wenn ein lokaler Treffer passt, ist LINK_EXISTING vorrangig. Erstelle dann keine neue Buchung.',
    'CREATE_BOOKING erzeugt nur einen Vorschlag, keine finale Buchung.',
    'CREATE_BOOKING wird spaeter mit dem Bankbeleg verknuepft; die Beschreibung soll den Zahler/Zweck nachvollziehbar enthalten, aber keine IBAN-Fuelltexte.',
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
