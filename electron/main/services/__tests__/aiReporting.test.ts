jest.mock('../../repositories/vouchers', () => ({ monthlyVouchers: jest.fn() }))
jest.mock('../dashboardSnapshot', () => ({ getDashboardSnapshot: jest.fn(() => ({ members: {}, invoices: {} })) }))
jest.mock('../../repositories/budgets', () => ({ listBudgets: jest.fn(() => []) }))
jest.mock('../ai', () => ({ createAiResponse: jest.fn(), extractOutputText: jest.fn(), normalizeUsage: () => ({}), getAiSettings: () => ({ textModel: 'test-model' }) }))

import { answerReportQuestion, generateReportAnswer } from '../aiReporting'
import { monthlyVouchers } from '../../repositories/vouchers'
import { createAiResponse } from '../ai'

beforeEach(() => {
  jest.clearAllMocks()
  ;(monthlyVouchers as jest.Mock).mockImplementation(filter => filter.type === 'IN' ? [{ month: '2026-08', gross: 910 }]
    : filter.type === 'OUT' ? [{ month: '2026-08', gross: -1693.75 }] : [{ month: '2025-01', gross: 1000 }])
  ;(createAiResponse as jest.Mock).mockResolvedValue({ output_parsed: { title: 'Saldoentwicklung', summary: 'Die Ausgaben übersteigen die Einnahmen.', notes: [], blocks: ['metrics', 'balance'], income: 99999 } })
})

test('graphical reporting receives active organization rules with scope, excluding disabled rules', async () => {
  await generateReportAnswer({ question: 'Wie stehen wir da?', from: '2026-08-01', to: '2026-11-07' }, [
    { id: 1, name: 'Vorstand', scope: 'ALL', instruction: 'Erkläre für den Vorstand ohne Fachjargon.', enabled: 1 },
    { id: 2, name: 'Buchungen', scope: 'BOOKINGS', instruction: 'Weise auf den Buchungszeitraum hin.', enabled: true },
    { id: 3, name: 'Deaktiviert', scope: 'ALL', instruction: 'NICHT_ANWENDEN', enabled: 0 }
  ])
  const request = (createAiResponse as jest.Mock).mock.calls[0][0]
  expect(request.instructions).toContain('Erkläre für den Vorstand ohne Fachjargon.')
  expect(request.instructions).toContain('"scope":"BOOKINGS"')
  expect(request.instructions).not.toContain('NICHT_ANWENDEN')
})

test('model chooses blocks but cannot supply amounts; queries use the exact period and opening cutoff', async () => {
  const answer = await answerReportQuestion({ question: 'Saldo?', from: '2026-08-12', to: '2026-11-07' })
  expect(monthlyVouchers).toHaveBeenNthCalledWith(1, { to: '2026-08-11' })
  expect(monthlyVouchers).toHaveBeenNthCalledWith(2, { from: '2026-08-12', to: '2026-11-07', type: 'IN' })
  expect(answer.datasets.finance).toMatchObject({ income: 910, expense: 1693.75, change: -783.75, opening: 1000, closing: 216.25 })
  expect(answer.blocks.map(block => block.type)).toEqual(['metrics', 'balance'])
})

test('unsupported questions use text without attaching an unrelated chart', async () => {
  ;(createAiResponse as jest.Mock).mockResolvedValue({ output_parsed: { title: 'Kontenvergleich', summary: 'Es liegen hier nur Gesamtwerte vor.', notes: [], blocks: [] } })
  const answer = await answerReportQuestion({ question: 'Nur Bank?', from: '2026-08-01', to: '2026-11-07' })
  expect(answer.blocks).toEqual([])
})

test('invalid scopes do not query the database or model', async () => {
  await expect(answerReportQuestion({ question: 'Saldo?', from: '2026-11-07', to: '2026-08-01' })).rejects.toThrow()
  expect(monthlyVouchers).not.toHaveBeenCalled()
  expect(createAiResponse).not.toHaveBeenCalled()
})

test('free-form questions reach the model unchanged and it can choose only a metric block', async () => {
  ;(createAiResponse as jest.Mock).mockResolvedValue({ output_parsed: { title: 'Einnahmen', summary: 'Die Einnahmen sind gebucht.', notes: [], blocks: ['metrics'] } })
  const question = 'Nach dem Sommerfest: Wie sieht unsere finanzielle Lage inzwischen aus?'
  const answer = await answerReportQuestion({ question, from: '2026-08-01', to: '2026-11-07' })
  expect(JSON.parse((createAiResponse as jest.Mock).mock.calls[0][0].input[0].content).question).toBe(question)
  expect(answer.blocks).toEqual([{ type: 'metrics', data: 'finance' }])
})
