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

import { getSetting, setSetting } from '../../electron/main/services/settings'
import { createAiResponse, getAiSettings, setAiSettings, reviewBankImportTransactions, testAiConnection } from '../../electron/main/services/ai'
import { AI_BOOKING_COMMENTS_SETTING } from '../../shared/aiBookingPolicy'

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

it('gives bank reviews the payment participant and applicable booking rules', async () => {
  mockChatCreate.mockResolvedValue(completion(JSON.stringify({
    summary: 'Manuell prüfen.', warnings: [], suggestions: [{
      transactionId: 77, action: 'NEEDS_MANUAL_REVIEW', confidence: 0.5,
      reason: 'Bitte prüfen.', warnings: [], evidence: []
    }]
  })))
  await reviewBankImportTransactions({
    transactions: [{ id: 77, bookingDate: '2026-09-21', direction: 'OUT', amount: 441.11,
      counterparty: 'Getränke Fessler', counterpartyIban: 'DE123', purpose: '26N0773 SecureGo plus: GENODE61SPE' }],
    context: { aiRules: [
      { id: 1, name: 'Getränke', scope: 'ALL', instruction: 'Getränke Fessler als Getränke und Tickets behandeln.', enabled: 1 },
      { id: 2, name: 'Rechnungen', scope: 'INVOICES', instruction: 'Nur Rechnungen.', enabled: 1 }
    ] } as any
  })
  const prompt = mockChatCreate.mock.calls[0][0].messages.find((message: any) => message.role === 'user').content[0].text as string
  const context = JSON.parse(prompt.split('VereinO-Kontext:\n')[1].split('\n\nOffene Bankbelege')[0])
  const transactions = JSON.parse(prompt.split('Offene Bankbelege mit lokalen Treffern:\n')[1])
  expect(context.aiRules).toEqual([{ id: 1, name: 'Getränke', scope: 'ALL', instruction: 'Getränke Fessler als Getränke und Tickets behandeln.' }])
  expect(transactions[0]).toMatchObject({ counterparty: 'Getränke Fessler', counterpartyIban: 'DE123', purpose: '26N0773 SecureGo plus: GENODE61SPE' })
  expect(prompt).toContain('Pruefe ihre Bedingungen auch gegen counterparty')
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
  expect(mockChatCreate).toHaveBeenCalledTimes(2)
})

it('repairs missing voucher IDs for bank closing fees without changing already valid suggestions', async () => {
  const valid = { transactionId: 72, action: 'LINK_EXISTING', reason: 'Passende Buchung fuer August.', voucherId: 42 }
  mockChatCreate
    .mockResolvedValueOnce(completion(JSON.stringify({ summary: 'Manuell prüfen.', suggestions: [
      { transactionId: 71, action: 'LINK_EXISTING', reason: 'Abschlussgebuehren.', voucherId: null }, valid
    ] })))
    .mockResolvedValueOnce(completion(JSON.stringify({ suggestions: [
      { transactionId: 71, action: 'CREATE_BOOKING', reason: 'Bankabschluss April ohne vorhandene Buchung.',
        bookingCandidate: { date: '2026-04-30', type: 'OUT', sphere: 'IDEELL', description: 'Bankgebühren – Abschluss per 30.04.2026',
          grossAmount: 8.85, paymentMethod: 'BANK', paymentAccountId: 1, counterparty: null } },
      // The provider must not be able to replace a previously valid row during repair.
      { ...valid, action: 'MARK_CHECKED', reason: 'Ignorieren.' }
    ] })))
  const result = await reviewBankImportTransactions({ context: {}, transactions: [
    { id: 71, bookingDate: '2026-04-30', direction: 'OUT', amount: 8.85, counterparty: null,
      purpose: 'Abschluss per 30.04.2026', paymentAccountId: 1, matches: [] },
    { id: 72, bookingDate: '2026-08-31', direction: 'OUT', amount: 4.9, counterparty: null,
      purpose: 'Abschluss per 31.08.2026', paymentAccountId: 1, matches: [{ id: 42, matchKind: 'VOUCHER' }] }
  ] })
  expect(mockChatCreate).toHaveBeenCalledTimes(2)
  const prompt = mockChatCreate.mock.calls[0][0].messages.find((m: any) => m.role === 'user').content[0].text
  expect(prompt).toContain('Bankabschlussgebuehren')
  expect(prompt).toContain('der Bankbuchungstag kann vor dem genannten Monatsende liegen')
  expect(prompt).toContain('Eine fehlende Gegenpartei ist dabei normal')
  expect(prompt).toContain('Ein Eingang bleibt IN')
  const repairPrompt = mockChatCreate.mock.calls[1][0].messages.find((m: any) => m.role === 'user').content[0].text
  const corrections = JSON.parse(repairPrompt.split('Korrekturauftrag:')[1].split('\n')[1])
  expect(corrections).toEqual([{ transactionId: 71, reason: expect.stringContaining('voucherId') }])
  expect(result.result.suggestions[0]).toMatchObject({ action: 'CREATE_BOOKING', bookingCandidate: {
    type: 'OUT', grossAmount: 8.85, date: '2026-04-30', description: 'Bankgebühren – Abschluss per 30.04.2026', counterparty: null
  } })
  expect(result.result.suggestions[1]).toMatchObject(valid)
  expect(result.result.summary).toBe('2 Bankbelege geprüft.')
  expect(result.usage?.totalTokens).toBe(600)
})

it('leaves repeated invalid fee links open after exactly one correction attempt', async () => {
  mockChatCreate.mockResolvedValue(completion(JSON.stringify({ suggestions: [
    { transactionId: 71, action: 'LINK_EXISTING', reason: 'Abschlussgebuehren.', voucherId: 999 }
  ] })))
  const result = await reviewBankImportTransactions({ context: {}, transactions: [
    { id: 71, bookingDate: '2026-05-29', direction: 'OUT', amount: 4.9, purpose: 'Abschluss per 31.05.2026', matches: [] }
  ] })
  expect(mockChatCreate).toHaveBeenCalledTimes(2)
  expect(result.result.suggestions[0]).toMatchObject({ action: 'NEEDS_MANUAL_REVIEW', reason: expect.stringContaining('voucherId') })
  expect(result.result.suggestions[0].voucherId).toBeUndefined()
  expect(result.result.suggestions[0].bookingCandidate).toBeUndefined()
})

it('preserves valid results and the safe fallback when the correction request fails', async () => {
  mockChatCreate.mockResolvedValueOnce(completion(JSON.stringify({ suggestions: [
    { transactionId: 71, action: 'LINK_EXISTING', reason: 'Abschlussgebuehren.', voucherId: null },
    { transactionId: 72, action: 'NEEDS_MANUAL_REVIEW', reason: 'Abrechnung enthaelt unklare Einzelposten.' }
  ] }))).mockRejectedValueOnce(new Error('Provider offline'))
  const result = await reviewBankImportTransactions({ context: {}, transactions: [71, 72].map(id => ({
    id, bookingDate: '2026-04-30', direction: 'OUT', amount: 8.85, purpose: 'Abschluss per 30.04.2026', matches: []
  })) })
  expect(mockChatCreate).toHaveBeenCalledTimes(2)
  expect(result.result.suggestions.map(s => s.action)).toEqual(['NEEDS_MANUAL_REVIEW', 'NEEDS_MANUAL_REVIEW'])
  expect(result.result.suggestions[1].reason).toBe('Abrechnung enthaelt unklare Einzelposten.')
  expect(result.result.warnings).toContainEqual(expect.stringContaining('Nachprüfung'))
  expect(result.usage?.totalTokens).toBe(300)
})

it.each([false, true])('passes comment rules into bank analysis and gates note output with opt-in %s', async enabled => {
  const original = jest.mocked(getSetting).getMockImplementation()!
  jest.mocked(getSetting).mockImplementation(((key: string) => key === AI_BOOKING_COMMENTS_SETTING ? enabled : original(key)) as any)
  mockChatCreate.mockResolvedValue(completion(JSON.stringify({ suggestions: [{
    transactionId: 77, action: 'CREATE_BOOKING', reason: 'Keine vorhandene Buchung.', warnings: ['Kein Budget zugeordnet.'],
    bookingCandidate: { date: '2026-08-13', type: 'OUT', sphere: 'IDEELL', description: 'Software', grossAmount: 29.99,
      note: 'Referenz BREF-123', warnings: ['Kein Budget zugeordnet.'] }
  }] })))
  const result = await reviewBankImportTransactions({
    transactions: [{ id: 77, bookingDate: '2026-08-13', direction: 'OUT', amount: 29.99 }],
    context: { aiRules: [{ id: 1, name: 'Kommentare', scope: 'BOOKINGS', instruction: 'Im Kommentar nur die Bankreferenz nennen.', enabled: 1 }] }
  })
  const suggestion = result.result.suggestions[0]
  expect(suggestion.bookingCandidate?.note).toBe(enabled ? 'Referenz BREF-123' : '')
  expect(suggestion.warnings).toEqual([])
  expect(suggestion.bookingCandidate?.warnings).toEqual([])
  const prompt = mockChatCreate.mock.calls[0][0].messages.find((message: any) => message.role === 'user').content[0].text as string
  expect(prompt).toContain('Im Kommentar nur die Bankreferenz nennen.')
  expect(prompt).toContain(enabled ? 'KI-Kommentare sind aktiviert' : 'KI-Kommentare sind deaktiviert')
  expect(prompt).toContain('Kategorie/Sphäre und Budget sind getrennte Konzepte')
})

it('defaults comments on and preserves explicit preferences across provider updates', () => {
  const settings = new Map<string, unknown>()
  jest.mocked(getSetting).mockImplementation(((key: string) => settings.get(key)) as any)
  jest.mocked(setSetting).mockImplementation((key, value) => { settings.set(key, value) })
  expect(getAiSettings().bookingCommentsEnabled).toBe(true)
  expect(setAiSettings({ bookingCommentsEnabled: true }).bookingCommentsEnabled).toBe(true)
  expect(setAiSettings({ provider: 'mittwald' }).bookingCommentsEnabled).toBe(true)
  expect(setAiSettings({ bookingCommentsEnabled: false }).bookingCommentsEnabled).toBe(false)
  expect(setAiSettings({ provider: 'openai' }).bookingCommentsEnabled).toBe(false)
})

it('reports only real completed analysis batches, keeping a failed batch unfinished', async () => {
  const progress = jest.fn()
  mockChatCreate.mockImplementation(async request => {
    const prompt = request.messages.find((message: any) => message.role === 'user').content[0].text
    const transactions = JSON.parse(prompt.split('Offene Bankbelege mit lokalen Treffern:\n')[1])
    if (transactions[0].id === 6) throw new Error('Provider offline')
    expect(progress).toHaveBeenLastCalledWith({ activeIds: [1, 2, 3, 4, 5], completedIds: [] })
    return completion(JSON.stringify({ suggestions: transactions.map((t: any) => ({ transactionId: t.id, action: 'NEEDS_MANUAL_REVIEW', reason: 'Bitte prüfen.' })) }))
  })
  await expect(reviewBankImportTransactions({ context: {}, onProgress: progress,
    transactions: Array.from({ length: 7 }, (_, i) => ({ id: i + 1, bookingDate: '2026-08-13', direction: 'OUT', amount: 10 }))
  })).rejects.toThrow('Provider offline')
  expect(progress.mock.calls.map(([value]) => value)).toEqual([
    { activeIds: [1, 2, 3, 4, 5], completedIds: [] },
    { activeIds: [], completedIds: [1, 2, 3, 4, 5] },
    { activeIds: [6, 7], completedIds: [1, 2, 3, 4, 5] }
  ])
})

it.each(['GENERAL', 'NONPROFIT'] as const)('passes profile-specific classification and language instructions for %s', async profile => {
  mockChatCreate.mockResolvedValue(completion(JSON.stringify({ suggestions: [{ transactionId: 77, action: 'NEEDS_MANUAL_REVIEW', reason: 'Bitte prüfen.' }] })))
  await reviewBankImportTransactions({ context: { organization: { profile }, primaryClassifications: [{ id: 6, name: 'Sonstiges', stableKey: 'OTHER' }] },
    transactions: [{ id: 77, bookingDate: '2026-08-13', direction: 'IN', amount: 350, counterparty: 'Stadt Höchstädt', purpose: 'Zuschuss Jugendarbeit' }] })
  const prompt = mockChatCreate.mock.calls[0][0].messages.find((message: any) => message.role === 'user').content[0].text
  if (profile === 'GENERAL') {
    expect(prompt).toContain('Es gibt fachlich keine steuerlichen Sphären')
    expect(prompt).toContain('nicht in reason, evidence, warnings, note')
    expect(prompt).toContain('keine Gemeinnützigkeit')
    expect(prompt).not.toContain('Profil NONPROFIT und verwendet steuerliche Sphären')
  } else expect(prompt).toContain('Profil NONPROFIT und verwendet steuerliche Sphären')
  expect(prompt).toContain('"stableKey":"OTHER"')
})
