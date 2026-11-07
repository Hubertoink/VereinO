jest.mock('../ai', () => ({
  createClient: () => ({ responses: { create: mockCreate } }),
  getAiSettings: () => ({ provider: 'openai', textModel: 'test-model', defaultReasoningEffort: 'low' }),
  compactContext: () => ({}), extractOutputText: (response: any) => jest.requireActual('../../../../shared/aiVisibleText').visibleAiText(response.output_text || ''),
  normalizeUsage: () => ({ inputTokens: 1, cachedInputTokens: 0, outputTokens: 1, reasoningTokens: 0, totalTokens: 2, estimatedCostUsd: 0, pricingNote: 'test' })
}))
jest.mock('../aiMcp', () => ({ VereinoMcpHost: { create: async () => mockHost } }))
jest.mock('../../repositories/aiAgentSessions', () => ({ appendAiAgentEvent: jest.fn(), getOrCreateAiAgentSession: () => ({ id: 'session', title: 'Finanzfrage' }), listAiAgentEvents: () => [], updateAiAgentSession: jest.fn() }))
jest.mock('../../repositories/aiAgentKnowledge', () => ({ listAiAgentAutoRules: () => [], listAiAgentMemory: () => [], matchingAiAgentAutoRules: () => [] }))

import { runAiAgent } from '../aiAgent'
import { buildReportFinance } from '../../../../shared/aiReporting'

const mockCreate = jest.fn()
const mockCallTool = jest.fn()
const mockHost = {
  listTools: async () => [{ name: 'reports_answer', description: 'Finanzauswertung', annotations: { readOnlyHint: true } }, { name: 'reports_summary', annotations: { readOnlyHint: true } }],
  readResource: async () => ({ contents: [] }), getAgentInstructions: async () => '', providerToolDefinitions: async () => [],
  callTool: mockCallTool, close: jest.fn(async () => {})
}
const call = (name = 'reports_answer') => ({ id: 'response', output: [{ type: 'function_call', name, arguments: JSON.stringify({ question: 'Wie läuft es finanziell?', from: '2026-08-01', to: '2026-08-31' }), call_id: 'call' }] })
const report = { title: 'Finanzen', summary: 'Die Ausgaben übersteigen die Einnahmen.', notes: [], blocks: [{ type: 'metrics' as const, data: 'finance' as const }],
  datasets: { finance: buildReportFinance({ from: '2026-08-01', to: '2026-08-31' }, [], [{ month: '2026-08', gross: -119 }], 0) } }

beforeEach(() => jest.clearAllMocks())

test.each(['Dashboard', 'AI'])('organization rules reach the central agent from %s', async activeArea => {
  mockCreate.mockResolvedValueOnce({ output_text: 'Antwort nach Vereinsregel.' })
  await runAiAgent({ prompt: 'Wie stehen wir da?', uiContext: { activeArea }, context: { aiRules: [
    { id: 7, name: 'Vorstandsbericht', scope: 'ALL', instruction: 'Fasse Berichte in einfacher Sprache zusammen.' }
  ] } })
  expect(JSON.stringify(mockCreate.mock.calls[0][0].input)).toContain('Fasse Berichte in einfacher Sprache zusammen.')
})

test('an unfinished thinking block requests a clean final answer instead of leaking provider reasoning', async () => {
  mockCreate.mockResolvedValueOnce({ id: 'reasoning', output_text: '<think>Interne Überlegung' })
    .mockResolvedValueOnce({ output_text: 'Bitte wähle einen der beiden Bankbelege aus.' })
  const result = await runAiAgent({ prompt: 'Bereite den Bankimport als Buchung vor.', context: {} })
  expect(result.answer).toBe('Bitte wähle einen der beiden Bankbelege aus.')
  expect(mockCreate.mock.calls[1][0].tool_choice).toBe('none')
})

test('structured report survives an empty final response and repeated read calls run only once', async () => {
  mockCreate.mockResolvedValueOnce(call()).mockResolvedValueOnce(call()).mockResolvedValueOnce({ output_text: '' })
  mockCallTool.mockResolvedValue({ agentResult: { ok: true, report }, mcpResult: {} })
  const result = await runAiAgent({ prompt: 'Wie läuft es finanziell?', context: {} })
  expect(result.reports).toEqual([report])
  expect(result.answer).toBe(report.summary)
  expect(mockCallTool).toHaveBeenCalledTimes(1)
  // Only the compact explanation is sent back to the model, not the entire chart dataset.
  const feedback = JSON.parse(mockCreate.mock.calls[1][0].input[0].output)
  expect(feedback.report.scope).toEqual(report.datasets.finance.scope)
  expect(feedback.report.datasets).toBeUndefined()
})

test('a tool call at the step limit receives an explicit finalization with tools disabled', async () => {
  mockCreate.mockResolvedValueOnce(call('reports_summary')).mockResolvedValueOnce(call('reports_summary')).mockResolvedValueOnce({ output_text: 'Die Ausgaben betragen 119 €.' })
  mockCallTool.mockResolvedValue({ agentResult: { ok: true, data: { expense: 119 } }, mcpResult: {} })
  const result = await runAiAgent({ prompt: 'Was wurde ausgegeben?', context: {}, maxSteps: 1 })
  expect(mockCreate.mock.calls[2][0].tool_choice).toBe('none')
  expect(mockCreate.mock.calls[2][0].input[0]).toMatchObject({ type: 'function_call_output', call_id: 'call' })
  expect(mockCallTool).toHaveBeenCalledTimes(1)
  expect(result.answer).toBe('Die Ausgaben betragen 119 €.')
  expect(result.answer).not.toContain('Daten geprüft')
})

test('a graphical report does not swallow the answer to additional parts of a free-form request', async () => {
  mockCreate.mockResolvedValueOnce(call()).mockResolvedValueOnce({ output_text: 'Zusätzlich sind zwei Mitgliedsbeiträge offen.' })
  mockCallTool.mockResolvedValue({ agentResult: { ok: true, report }, mcpResult: {} })
  const result = await runAiAgent({ prompt: 'Ordne unsere Finanzen ein und prüfe offene Beiträge.', context: {} })
  expect(result.reports).toEqual([report])
  expect(result.answer).toBe('Zusätzlich sind zwei Mitgliedsbeiträge offen.')
})
