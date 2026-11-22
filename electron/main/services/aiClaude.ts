import type Anthropic from '@anthropic-ai/sdk'
import type { ContentBlockParam, MessageParam, Tool } from '@anthropic-ai/sdk/resources/messages'

import type { AiConversationRequest, AiInputPart } from './aiProviderProtocol'

async function claudeContent(part: AiInputPart): Promise<ContentBlockParam> {
  if (part.type === 'input_text') return { type: 'text', text: part.text }
  const uri = part.type === 'input_image' ? part.image_url : part.file_data
  const comma = uri.indexOf(',')
  const mime = /^data:([^;]+);base64$/i.exec(uri.slice(0, comma))?.[1]
  const data = uri.slice(comma + 1)
  if (!mime || !data) throw new Error('Der Anhang enthält keine gültigen Dateidaten.')
  if (mime === 'application/pdf') {
    return { type: 'document', source: { type: 'base64', media_type: mime, data } }
  }
  if (mime === 'image/jpeg' || mime === 'image/png' || mime === 'image/gif' || mime === 'image/webp') {
    return { type: 'image', source: { type: 'base64', media_type: mime, data } }
  }
  if (part.type === 'input_file') {
    if (mime.startsWith('text/') || /\.(csv|tsv)$/i.test(part.filename)) {
      return { type: 'text', text: Buffer.from(data, 'base64').toString('utf8') }
    }
    if (/\.xlsx$/i.test(part.filename)) {
      const { loadAiImportWorkbook } = await import('./aiImportFiles')
      const workbook = await loadAiImportWorkbook(part.filename, data)
      const sheets = []
      for (const sheet of workbook.worksheets.filter(sheet => sheet.state === 'visible')) {
        const csv = await workbook.csv.writeBuffer({ sheetName: sheet.name })
        sheets.push(sheet.name + '\n' + Buffer.from(csv).toString('utf8'))
      }
      return { type: 'text', text: sheets.join('\n\n') }
    }
  }
  throw new Error('Für Claude bitte ein PDF, Bild oder eine Tabelle als XLSX, CSV oder TSV verwenden.')
}

// Each agent run owns its Messages history. Preserve signed thinking blocks and tool IDs
// between turns while exposing only visible text and local tool calls to VereinO.
export function createClaudeResponder(client: Anthropic) {
  const history: MessageParam[] = []
  return async (request: AiConversationRequest) => {
    const system = [request.instructions || '']
    const items = typeof request.input === 'string'
      ? [{ role: 'user' as const, content: request.input }]
      : request.input
    const messages = [...history]
    const results: ContentBlockParam[] = []
    for (const item of items) {
      if ('type' in item) {
        results.push({ type: 'tool_result', tool_use_id: item.call_id, content: item.output })
        continue
      }
      if (results.length) messages.push({ role: 'user', content: results.splice(0) })
      if (item.role === 'system') {
        system.push(typeof item.content === 'string' ? item.content : item.content.map(p => p.type === 'input_text' ? p.text : '').join('\n'))
      } else {
        const content = typeof item.content === 'string' ? item.content : await Promise.all(item.content.map(claudeContent))
        messages.push({ role: item.role, content })
      }
    }
    if (results.length) messages.push({ role: 'user', content: results })

    const tools: Tool[] = (request.tools || []).map(tool => ({
      name: tool.name, description: tool.description, input_schema: { ...tool.parameters, type: 'object' }
    }))
    const format = request.text?.format?.type === 'json_schema' ? request.text.format : undefined
    if (format?.type === 'json_schema') {
      // Invoice and bank schemas exceed the strict-output limit for nullable fields.
      // Return the result as a tool input and let the existing domain validators check it.
      tools.push({ name: format.name, description: 'Strukturiertes Ergebnis der Aufgabe.', input_schema: { ...format.schema, type: 'object' } })
      system.push('Übermittle das vollständige Ergebnis mit dem Werkzeug ' + format.name + '.')
    }
    const response = await client.messages.create({
      model: request.model,
      max_tokens: request.max_output_tokens ?? 16384,
      system: system.filter(Boolean).join('\n\n') || undefined,
      messages,
      output_config: request.reasoning ? { effort: request.reasoning.effort } : undefined,
      tools: tools.length ? tools : undefined,
      tool_choice: request.tool_choice === 'none' ? { type: 'none' } : undefined
    })
    if (response.stop_reason === 'max_tokens' || response.stop_reason === 'model_context_window_exceeded') {
      throw new Error('Claude hat das Tokenlimit erreicht. Bitte den Auftrag oder die Belegmenge verkleinern.')
    }
    if (response.stop_reason === 'refusal') throw new Error('Claude hat die Anfrage abgelehnt.')
    const calls = response.content.filter(block => block.type === 'tool_use')
    const visibleText = response.content.filter(block => block.type === 'text').map(block => block.text).join('\n')
    const parsed = format ? calls.find(call => call.name === format.name)?.input : undefined
    if (format && !parsed && !visibleText.trim()) throw new Error('Claude hat kein strukturiertes Ergebnis geliefert.')
    history.push(...messages.slice(history.length), { role: 'assistant', content: response.content })
    return {
      id: response.id,
      output_text: parsed === undefined ? visibleText : JSON.stringify(parsed),
      output_parsed: parsed,
      output: calls.filter(call => call.name !== format?.name).map(call => ({
        type: 'function_call', call_id: call.id, name: call.name, arguments: JSON.stringify(call.input)
      })),
      usage: response.usage
    }
  }
}
