import AiAssistantController from './AiAssistantController'
import type { Props } from './aiViewTypes'

/**
 * Einstiegspunkt der KI-Seite. Die Ablaufsteuerung lebt im Controller;
 * Darstellung und Fach-Workflows werden von dort schrittweise zusammengesetzt.
 */
export default function AIView(props: Props) {
  return <AiAssistantController {...props} />
}
