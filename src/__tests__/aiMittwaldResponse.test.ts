const mockChatCreate = jest.fn()
const mockResponsesCreate = jest.fn()
const mockModelsList = jest.fn()

jest.mock('openai', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    chat: { completions: { create: mockChatCreate } },
    responses: { create: mockResponsesCreate },
    models: { list: mockModelsList }
  }))
}))
jest.mock('electron', () => ({
  safeStorage: {},
  session: { fromPartition: () => ({ setProxy: async () => {}, resolveProxy: async () => 'DIRECT' }) }
}))
jest.mock('../../electron/main/services/settings', () => ({ getSetting: jest.fn(), setSetting: jest.fn() }))

import { getSetting } from '../../electron/main/services/settings'
import { createAiResponse, reviewBankImportTransactions, testAiConnection } from '../../electron/main/services/ai'

const structuredRequest = {
  model: 'Qwen3.6-35B-A3B-FP8', input: 'Prüfe die Belege.',
  text: { format: { type: 'json_schema', schema: { type: 'object' } } }
}
function completion(content: string, finish_reason = 'stop') {
  return { choices: [{ finish_reason, message: { content } }], usage: { prompt_tokens: 100, completion_tokens: 200, total_tokens: 300 } }
}

beforeEach(() => {
  jest.clearAllMocks()
  mockChatCreate.mockReset()
  jest.mocked(getSetting).mockImplementation(((key: string) => ({
    'ai.openai.provider': 'mittwald', 'ai.openai.apiKey': 'test-key'
  } as Record<string, unknown>)[key]) as any)
})

it('honors a structured request budget instead of capping it at 2048 tokens', async () => {
  mockChatCreate.mockResolvedValue(completion('{"ok":true}'))
  expect((await createAiResponse({ ...structuredRequest, max_output_tokens: 8192 })).output_parsed).toEqual({ ok: true })
  expect(mockChatCreate.mock.calls[0][0]).toMatchObject({ max_tokens: 8192, chat_template_kwargs: { enable_thinking: false } })
})

it('retries a truncated answer once with a larger budget and counts both responses', async () => {
  mockChatCreate.mockResolvedValueOnce(completion('{"ok":', 'length')).mockResolvedValueOnce(completion('{"ok":true}'))
  const result = await createAiResponse({ ...structuredRequest, max_output_tokens: 8192 })
  expect(mockChatCreate.mock.calls.map(([request]) => request.max_tokens)).toEqual([8192, 16384])
  expect(result.output_parsed).toEqual({ ok: true })
  expect(result.usage.total_tokens).toBe(600)
})

it('rejects even syntactically valid JSON when the provider reports truncation', async () => {
  mockChatCreate.mockResolvedValue(completion('{"ok":true}', 'length'))
  await expect(createAiResponse(structuredRequest)).rejects.toThrow('Ausgabelimits abgeschnitten')
  expect(mockChatCreate).toHaveBeenCalledTimes(2)
})

it('requests a corrected format once without guessing at malformed content', async () => {
  mockChatCreate.mockResolvedValueOnce(completion('Hier sind die Ergebnisse.')).mockResolvedValueOnce(completion('```json\n{"ok":true}\n```'))
  expect((await createAiResponse(structuredRequest)).output_parsed).toEqual({ ok: true })
  expect(mockChatCreate.mock.calls[1][0].messages.at(-1).content).toContain('vollständigen JSON-Objekt')
})

it('distinguishes an invalid response from an unavailable connection after one retry', async () => {
  mockChatCreate.mockResolvedValue(completion('kein JSON'))
  await expect(createAiResponse(structuredRequest)).rejects.toThrow('Mittwald ist erreichbar')
  expect(mockChatCreate).toHaveBeenCalledTimes(2)
})

it('does not parse plain text output as JSON or retry network failures', async () => {
  mockChatCreate.mockResolvedValueOnce(completion('OK'))
  expect((await createAiResponse({ ...structuredRequest, text: { format: { type: 'text' } } })).output_text).toBe('OK')
  mockChatCreate.mockRejectedValueOnce(new Error('HTTP 401'))
  await expect(createAiResponse(structuredRequest)).rejects.toThrow('HTTP 401')
  expect(mockChatCreate).toHaveBeenCalledTimes(2)
})

it('reviews 34 transactions in seven complete batches and accepts a nullable summary', async () => {
  mockChatCreate.mockImplementation(async (request) => {
    const prompt = request.messages.find((message: any) => message.role === 'user').content[0].text
    const transactions = JSON.parse(prompt.split('Offene Bankbelege mit lokalen Treffern:\n')[1])
    expect(transactions.length).toBeLessThanOrEqual(5)
    return completion(JSON.stringify({
      summary: null, warnings: [], suggestions: transactions.map(({ id }: { id: number }) => ({
        transactionId: id, action: 'NEEDS_MANUAL_REVIEW', confidence: 0.5, reason: 'Bitte prüfen.',
        voucherId: null, voucherNo: null, recurringBookingId: null, recurringBookingName: null,
        occurrenceId: null, scheduledDate: null, bookingCandidate: null, warnings: [], evidence: []
      }))
    }))
  })
  const transactions = Array.from({ length: 34 }, (_, index) => ({ id: index + 1, bookingDate: '2026-09-24', amount: 50, direction: 'OUT' as const }))
  const result = await reviewBankImportTransactions({ transactions, context: {} })
  expect(result.result.suggestions.map(s => s.transactionId)).toEqual(transactions.map(t => t.id))
  expect(mockChatCreate).toHaveBeenCalledTimes(7)
  expect(result.usage?.totalTokens).toBe(2100)
})

it('checks structured JSON during the Mittwald connection test', async () => {
  mockModelsList.mockResolvedValue({ data: [{ id: 'Qwen3.6-35B-A3B-FP8' }] })
  mockChatCreate.mockResolvedValue(completion('{"ok":true}'))
  expect(await testAiConnection()).toMatchObject({ ok: true })
  expect(mockChatCreate.mock.calls[0][0].messages[0].content).toContain('JSON')
  mockChatCreate.mockResolvedValue(completion('{"ok":false}'))
  expect(await testAiConnection()).toMatchObject({ ok: false })
})

it('completes the bank review when one provider suggestion contains a null required string', async () => {
  mockChatCreate.mockResolvedValue(completion(JSON.stringify({
    summary: null,
    suggestions: [
      { transactionId: 1, action: 'LINK_EXISTING', reason: 'Betrag passt.', voucherId: 42, warnings: null },
      { transactionId: 2, action: 'LINK_EXISTING', reason: null, voucherId: 43 }
    ]
  })))
  const result = await reviewBankImportTransactions({
    context: {},
    transactions: [1, 2].map(id => ({ id, bookingDate: '2026-09-24', direction: 'OUT', amount: 50 }))
  })
  expect(result.result.suggestions[0]).toMatchObject({ action: 'LINK_EXISTING', voucherId: 42 })
  expect(result.result.suggestions[1]).toMatchObject({ action: 'NEEDS_MANUAL_REVIEW', reason: expect.stringContaining('reason') })
})
