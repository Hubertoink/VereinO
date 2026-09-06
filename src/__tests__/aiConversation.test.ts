import { buildAiConversationPrompt } from '../renderer/views/AI/aiConversation'

describe('AI conversation context', () => {
  it('keeps a first prompt unchanged when no chat has started', () => {
    expect(buildAiConversationPrompt('Erstelle einen Bericht', [], false, {})).toBe(
      'Erstelle einen Bericht'
    )
  })

  it('includes only the eight most recent messages with UI context for a follow-up', () => {
    const messages = Array.from({ length: 10 }, (_, index) => ({
      id: `${index}`,
      role: index % 2 ? ('assistant' as const) : ('user' as const),
      body: `Nachricht ${index}`
    }))
    const prompt = buildAiConversationPrompt('Und was ist offen?', messages, true, {
      selectedJobId: 42
    })
    expect(prompt).toContain('Nachricht 2')
    expect(prompt).not.toContain('Nachricht 1')
    expect(prompt).toContain('"selectedJobId": 42')
    expect(prompt).toContain('Und was ist offen?')
  })
})
