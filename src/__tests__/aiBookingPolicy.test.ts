import { aiBookingComment, aiBookingCommentInstruction, filterOptionalAssignmentWarnings } from '../../shared/aiBookingPolicy'
import { AiSettingsGetOutput, AiSettingsSetInput } from '../../electron/main/ipc/schemas'
import { currentAiDraftComment } from '../renderer/utils/aiBookingDraft'

describe('optional AI booking comments', () => {
  it('defaults to on and accepts explicit settings', () => {
    expect(AiSettingsGetOutput.parse({ hasApiKey: false, model: 'test', textModel: 'test' }).bookingCommentsEnabled).toBe(true)
    expect(AiSettingsSetInput.parse({ bookingCommentsEnabled: true }).bookingCommentsEnabled).toBe(true)
    expect(aiBookingComment(undefined, 'KI-Text')).toBe('')
    expect(aiBookingComment(false, 'KI-Text')).toBe('')
    expect(aiBookingComment(true, '  Referenz 123  ')).toBe('Referenz 123')
    expect(aiBookingComment(true, null)).toBe('')
  })

  it('allows rules to guide opted-in comments but preserves the disabled setting as a hard boundary', () => {
    expect(aiBookingCommentInstruction(true)).toContain('aiRules')
    expect(aiBookingCommentInstruction(true)).toContain('ergänzen, einschränken oder ausschließen')
    expect(aiBookingCommentInstruction(false)).toContain('Vorrang vor Regeln')
  })

  it('filters plain missing optional assignment hints but keeps meaningful conflicts', () => {
    expect(filterOptionalAssignmentWarnings([
      'Kein Budget zugeordnet.', 'Es konnte kein Budget zugeordnet werden.', 'Keine Zweckbindung zugeordnet.',
      'Die Regel verlangt Budget Jugend, aber dieses Budget fehlt.', 'Budget reicht nicht aus.', 'Kategorie fehlt.'
    ])).toEqual(['Die Regel verlangt Budget Jugend, aber dieses Budget fehlt.', 'Budget reicht nicht aus.', 'Kategorie fehlt.'])
  })

  it('checks current settings before opening old drafts and defaults off on failure', async () => {
    const settings = jest.fn().mockResolvedValueOnce({ bookingCommentsEnabled: true }).mockResolvedValueOnce({ bookingCommentsEnabled: false }).mockRejectedValueOnce(new Error('offline'))
    ;(global as any).window = { api: { ai: { settings: { get: settings } } } }
    try {
      expect(await currentAiDraftComment('Referenz 123')).toBe('Referenz 123')
      expect(await currentAiDraftComment('Alter KI-Kommentar')).toBe('')
      expect(await currentAiDraftComment('Alter KI-Kommentar')).toBe('')
    } finally { delete (global as any).window }
  })
})
