import { getDatabase } from '../config/database.js'
import { decryptAiSecret } from './aiSecrets.js'

export type AiProvider = 'openai' | 'minimax' | 'mittwald'
export type AiProviderSettings = { provider: AiProvider; model: string; apiKey: string }
const endpoints: Record<AiProvider, string> = {
  openai: 'https://api.openai.com/v1/responses',
  minimax: 'https://api.minimaxi.com/v1/responses',
  mittwald: 'https://llm.aihosting.mittwald.de/v1/chat/completions'
}
const failure = (message: string, statusCode = 502) => Object.assign(new Error(message), { statusCode })
export async function loadAiProvider(organizationId: number, task: 'text' | 'invoice' = 'text'): Promise<AiProviderSettings> {
  const row = (await getDatabase().query('SELECT * FROM web_ai_settings WHERE organization_id=$1', [organizationId])).rows[0]
  if (!row?.enabled || !row.encrypted_api_key) throw failure('KI ist für diese Organisation noch nicht eingerichtet oder deaktiviert.', 409)
  let apiKey: string
  try { apiKey = decryptAiSecret(row.encrypted_api_key, organizationId, row.provider) }
  catch { throw failure('Der gespeicherte KI-Schlüssel kann nicht gelesen werden. Bitte die Serverkonfiguration prüfen.', 503) }
  return { provider: row.provider, model: task === 'invoice' ? row.model : row.text_model, apiKey }
}

/** Fixed provider destinations; no caller-supplied URLs, redirects or provider error bodies. */
export async function requestAiText(settings: AiProviderSettings, instructions: string, input: string, transport: typeof fetch = fetch, document?: { mimeType: string; fileName: string; data: Buffer; pages?: Buffer[] }): Promise<{ text: string; usage: { inputTokens: number; outputTokens: number } }> {
  const endpoint = endpoints[settings.provider]
  if (!endpoint) throw failure('Unbekannter KI-Anbieter.', 400)
  const chat = settings.provider === 'mittwald'
  if (document && chat && document.mimeType === 'application/pdf' && !document.pages?.length) throw failure('Für diesen Anbieter bitte die PDF-Seiten als Bilder bereitstellen.', 400)
  const dataUrl = document ? `data:${document.mimeType};base64,${document.data.toString('base64')}` : ''
  const responseInput = document ? [{ role: 'user', content: [
    { type: 'input_text', text: input },
    document.mimeType === 'application/pdf' ? { type: 'input_file', filename: document.fileName, file_data: dataUrl } : { type: 'input_image', image_url: dataUrl }
  ] }] : input
  const chatImages = document?.pages?.map(page => `data:image/jpeg;base64,${page.toString('base64')}`) || [dataUrl]
  const chatInput = document ? [{ type: 'text', text: input }, ...chatImages.map(url => ({ type: 'image_url', image_url: { url } }))] : input
  const body = chat ? {
    model: settings.model,
    messages: [{ role: 'system', content: instructions }, { role: 'user', content: chatInput }],
    max_tokens: 4096,
    chat_template_kwargs: { enable_thinking: false }
  } : { model: settings.model, instructions, input: responseInput, store: false, max_output_tokens: 4096 }
  let result: any
  try {
    const response = await transport(endpoint, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(60000), headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.apiKey}` }, body: JSON.stringify(body) })
    if (!response.ok) {
      await response.body?.cancel()
      throw failure(response.status === 401 || response.status === 403 ? 'Der KI-Anbieter hat den API-Schlüssel abgelehnt.' : response.status === 429 ? 'Das KI-Limit des Anbieters wurde erreicht. Bitte später erneut versuchen.' : 'Der KI-Anbieter konnte die Anfrage nicht verarbeiten.')
    }
    // Bound both declared and streamed bodies before parsing untrusted provider JSON.
    if (Number(response.headers.get('content-length') || 0) > 2_000_000) throw failure('Die KI-Antwort ist zu groß.')
    const reader = response.body?.getReader()
    if (!reader) throw failure('Der KI-Anbieter hat keine Antwort geliefert.')
    const chunks: Uint8Array[] = []; let size = 0
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        size += value.byteLength
        if (size > 2_000_000) { await reader.cancel(); throw failure('Die KI-Antwort ist zu groß.') }
        chunks.push(value)
      }
    } finally { reader.releaseLock() }
    result = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch (error) {
    if (error instanceof Error && 'statusCode' in error) throw error
    throw failure('Der KI-Anbieter ist nicht erreichbar oder hat keine gültige Antwort geliefert.')
  }
  if (result.status === 'incomplete' || result.error || (chat && result.choices?.[0]?.finish_reason !== 'stop')) throw failure('Die KI-Antwort wurde nicht vollständig erzeugt. Bitte erneut versuchen.')
  const text = chat ? result.choices?.[0]?.message?.content : (result.output || []).filter((item: any) => item.type === 'message').flatMap((item: any) => item.content || []).filter((item: any) => item.type === 'output_text').map((item: any) => item.text).join('\n')
  if (typeof text !== 'string' || !text.trim()) throw failure('Der KI-Anbieter hat keine Textantwort geliefert.')
  const count = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0
  return { text: text.trim(), usage: { inputTokens: count(result.usage?.input_tokens ?? result.usage?.prompt_tokens), outputTokens: count(result.usage?.output_tokens ?? result.usage?.completion_tokens) } }
}
