import { routeDefaultAiPrompt } from '../renderer/views/AI/aiPromptRouter'
import { aiViewUiReducer, initialAiViewUiState } from '../renderer/views/AI/aiViewReducer'
import { openReviewWorkflowIds } from '../renderer/views/AI/reviewWorkflowState'
import { formatIsoDate, normalizeLookup, parseGermanDate } from '../renderer/views/AI/aiText'

describe('AIView extracted domain logic', () => {
  it('normalizes and formats user-facing date values consistently', () => {
    expect(normalizeLookup('Müller & Söhne')).toBe('muller sohne')
    expect(parseGermanDate('fällig am 3.9.2026')).toBe('2026-09-03')
    expect(formatIsoDate('2026-09-03')).toBe('03.09.2026')
  })

  it('keeps only one AI drawer open at a time', () => {
    const settingsOpen = aiViewUiReducer(initialAiViewUiState, {
      type: 'OPEN_ONLY',
      drawer: 'settings'
    })
    expect(settingsOpen).toEqual({ history: false, agentContext: false, settings: true, rules: false })
    expect(aiViewUiReducer(settingsOpen, { type: 'TOGGLE', drawer: 'history' })).toEqual({
      history: true,
      agentContext: false,
      settings: false,
      rules: false
    })
  })

  it('routes attachments and bank questions before the generic text task', () => {
    const spreadsheet = { name: 'mitglieder.csv' } as File
    const invoice = { name: 'rechnung.pdf' } as File
    expect(routeDefaultAiPrompt('Importiere die Mitglieder', [spreadsheet])).toBe('FILE_TEXT_TASK')
    expect(routeDefaultAiPrompt('Lies die Rechnung aus', [invoice])).toBe('DOCUMENT_ANALYSIS')
    expect(routeDefaultAiPrompt('Prüfe offene Bankbelege', [])).toBe('BANK_IMPORT')
    expect(routeDefaultAiPrompt('Formuliere eine Einladung', [])).toBe('TEXT')
  })

  it('uses one lifecycle rule for all pending review workflows', () => {
    expect(openReviewWorkflowIds([
      { id: 'member', state: { status: 'DRAFT' }, terminalStatuses: ['CREATED'] },
      { id: 'voucher', state: { status: 'APPLIED' }, terminalStatuses: ['APPLIED'] },
      { id: 'question', state: { status: 'RESOLVED' }, terminalStatuses: ['RESOLVED'] }
    ])).toEqual(['member'])
  })
})
