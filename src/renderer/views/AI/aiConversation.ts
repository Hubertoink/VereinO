import type { AiMessage } from './aiChat'

export function buildAiConversationPrompt(
  userPrompt: string,
  messages: AiMessage[],
  chatStarted: boolean,
  uiContext: Record<string, unknown>
) {
  if (!messages.length && !chatStarted) return userPrompt
  const history = messages
    .slice(-8)
    .map((message) => {
      const speaker = message.role === 'user' ? 'Nutzer' : 'VereinO KI'
      return `${speaker}${message.title ? ` (${message.title})` : ''}: ${message.body}`
    })
    .join('\n\n')
  return [
    'Dies ist eine Folgefrage in der VereinO-KI. Beziehe dich auf die bisherige Unterhaltung und bleibe im VereinO-Kontext.',
    '',
    'Bisherige Unterhaltung:',
    history || '-',
    '',
    'Aktueller VereinO-KI-Kontext aus der UI:',
    JSON.stringify(uiContext, null, 2),
    '',
    'Aktuelle Nutzernachricht:',
    userPrompt,
    '',
    'Antworte konkret auf die aktuelle Nutzernachricht und führe gewünschte VereinO-Schritte als Review-Vorschlag aus, wenn möglich.'
  ].join('\n')
}
