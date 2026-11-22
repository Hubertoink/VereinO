import type Anthropic from '@anthropic-ai/sdk'
import type OpenAI from 'openai'
import type { AiProviderId } from '../../../shared/aiProviders'

export type AiInputPart =
  | { type: 'input_text'; text: string }
  | { type: 'input_image'; image_url: string; detail?: 'auto' | 'high' | 'low' }
  | { type: 'input_file'; file_data: string; filename: string }
export type AiMessage = { role: 'system' | 'user' | 'assistant'; content: string | AiInputPart[] }
export type AiToolResult = { type: 'function_call_output'; call_id: string; output: string }
export type AiRequest = {
  model: string
  input: string | AiMessage[]
  instructions?: string
  reasoning?: { effort: 'low' | 'medium' | 'high' }
  max_output_tokens?: number
  text?: { verbosity?: 'low' | 'medium' | 'high' | null; format?: OpenAI.Responses.ResponseTextConfig['format'] }
}
export type AiConversationRequest = Omit<AiRequest, 'input'> & {
  input: string | (AiMessage | AiToolResult)[]
  previous_response_id?: string
  tools?: { name: string; description?: string; parameters: Record<string, unknown> }[]
  tool_choice?: 'none' | 'auto'
}
type ResponseBody = { output_text: string; output_parsed?: unknown } | { output_text?: string; output_parsed: unknown }
export type AiResponse = ResponseBody & {
  id?: string
  output?: unknown[]
  usage?: OpenAI.Responses.ResponseUsage | OpenAI.CompletionUsage | Anthropic.Usage | null
}

const protocol = { anthropic: 'messages', mittwald: 'chat', openai: 'responses', minimax: 'responses' } as const satisfies Record<AiProviderId, string>

/** Both one-shot analysis and conversations use the same provider protocol, with independent history. */
export function selectAiProtocol<T>(provider: AiProviderId, operations: Record<typeof protocol[AiProviderId], () => T>): T {
  return operations[protocol[provider]]()
}
