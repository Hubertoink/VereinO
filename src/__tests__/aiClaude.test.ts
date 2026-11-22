import type Anthropic from '@anthropic-ai/sdk'
import { createClaudeResponder } from '../../electron/main/services/aiClaude'

const create = jest.fn()
const client = { messages: { create } } as unknown as Anthropic
const model = 'claude-haiku-5-5'
const usage = { input_tokens: 10, output_tokens: 12 }

beforeEach(() => create.mockReset())

it('sends the system instructions and real PDF/image blocks and returns the structured tool input', async () => {
  const fields = { invoiceNumber: 'TEST-1', grossAmount: 119 }
  create.mockResolvedValue({ stop_reason: 'tool_use', usage,
    content: [{ type: 'tool_use', name: 'invoice', id: 'result', input: fields }] })
  const response = await createClaudeResponder(client)({
    model, reasoning: { effort: 'low' }, max_output_tokens: 8192,
    input: [{ role: 'system', content: 'Lies die Rechnung.' }, { role: 'user', content: [
      { type: 'input_text', text: 'Beleg 1' },
      { type: 'input_file', filename: 'Beleg.pdf', file_data: 'data:application/pdf;base64,JVBERg==' },
      { type: 'input_image', image_url: 'data:image/png;base64,aQ==' }
    ] }],
    text: { format: { name: 'invoice', type: 'json_schema', schema: { type: 'object' } } }
  })
  expect(create).toHaveBeenCalledWith(expect.objectContaining({
    model, max_tokens: 8192, output_config: { effort: 'low' }, system: expect.stringContaining('Lies die Rechnung.'),
    tools: [expect.objectContaining({ name: 'invoice', input_schema: { type: 'object' } })],
    messages: [{ role: 'user', content: [
      { type: 'text', text: 'Beleg 1' },
      { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: 'JVBERg==' } },
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'aQ==' } }
    ] }]
  }))
  expect(response).toMatchObject({ output: [], output_parsed: fields, output_text: JSON.stringify(fields), usage })
})

it('replays signed assistant blocks and groups parallel tool results before finalization', async () => {
  const respond = createClaudeResponder(client)
  const content = [
    { type: 'thinking', thinking: 'intern', signature: 'sig' },
    ...['a', 'b'].map(id => ({ type: 'tool_use', id, name: 'reports_summary', input: { id } }))
  ]
  create.mockResolvedValueOnce({ content, usage, stop_reason: 'tool_use' })
    .mockResolvedValueOnce({ content: [{ type: 'text', text: 'Fertig.' }], usage, stop_reason: 'end_turn' })
  const tools = [{ name: 'reports_summary', parameters: { type: 'object' } }]
  const first = await respond({ model, instructions: 'Vereinsregeln', tools, input: 'Bericht' })
  expect(first.output_text).toBe('')
  expect(first.output.map(call => call.call_id)).toEqual(['a', 'b'])
  const last = await respond({ model, tools, tool_choice: 'none', input: [
    { type: 'function_call_output', call_id: 'a', output: '1' },
    { type: 'function_call_output', call_id: 'b', output: '2' },
    { role: 'user', content: 'Zusammenfassen' }
  ] })
  expect(create.mock.calls[1][0]).toMatchObject({ tool_choice: { type: 'none' }, messages: [
    { role: 'user', content: 'Bericht' }, { role: 'assistant', content },
    { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'a', content: '1' }, { type: 'tool_result', tool_use_id: 'b', content: '2' }] },
    { role: 'user', content: 'Zusammenfassen' }
  ] })
  expect(last.output_text).toBe('Fertig.')
})

it('rejects truncated tool calls before any local action is executed', async () => {
  create.mockResolvedValue({ stop_reason: 'max_tokens', content: [{ type: 'tool_use', id: 'x', name: 'draft', input: {} }], usage })
  await expect(createClaudeResponder(client)({ model, input: 'Erstelle einen Entwurf.' })).rejects.toThrow('Tokenlimit')
})

it('offers only supported Claude attachments for the picker and drop validator', () => {
  const { attachmentAccept, isAiAttachmentFile } = require('../renderer/views/AI/aiAttachments')
  const file = { name: 'Bank.xls', type: 'application/vnd.ms-excel' }
  expect(attachmentAccept('anthropic').split(',')).not.toContain('.xls')
  expect(isAiAttachmentFile(file, 'anthropic')).toBe(false)
  expect(isAiAttachmentFile(file, 'openai')).toBe(true)
  expect(isAiAttachmentFile({ name: 'Bank.xlsx' }, 'anthropic')).toBe(true)
})
