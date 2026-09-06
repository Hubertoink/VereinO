import { useCallback, useEffect, useRef, useState } from 'react'
import type { AiMessage } from './aiChat'

const AI_MESSAGE_STREAM_TICK_MS = 18
const AI_MESSAGE_STREAM_TARGET_TICKS = 180

export function useAiMessages(initialMessages: AiMessage[] = []) {
  const [messages, setMessages] = useState<AiMessage[]>(initialMessages)
  const streamingMessageTimersRef = useRef<Record<string, number>>({})

  useEffect(
    () => () => {
      Object.values(streamingMessageTimersRef.current).forEach((timer) =>
        window.clearTimeout(timer)
      )
      streamingMessageTimersRef.current = {}
    },
    []
  )

  const streamAssistantMessage = useCallback((id: string, fullBody: string, initialLength = 0) => {
    if (streamingMessageTimersRef.current[id]) return
    const charsPerTick = Math.max(1, Math.ceil(fullBody.length / AI_MESSAGE_STREAM_TARGET_TICKS))
    let streamedLength = Math.min(fullBody.length, initialLength)
    const step = () => {
      streamedLength = Math.min(fullBody.length, streamedLength + charsPerTick)
      setMessages((current) =>
        current.map((item) =>
          item.id === id
            ? {
                ...item,
                displayBody: fullBody.slice(0, streamedLength),
                isStreaming: streamedLength < fullBody.length
              }
            : item
        )
      )

      if (streamedLength < fullBody.length) {
        const timer = window.setTimeout(step, AI_MESSAGE_STREAM_TICK_MS)
        streamingMessageTimersRef.current[id] = timer
      } else {
        delete streamingMessageTimersRef.current[id]
      }
    }

    const timer = window.setTimeout(step, AI_MESSAGE_STREAM_TICK_MS)
    streamingMessageTimersRef.current[id] = timer
  }, [])

  useEffect(() => {
    messages.forEach((message) => {
      if (message.role !== 'assistant' || !message.isStreaming || !message.body) return
      streamAssistantMessage(message.id, message.body, message.displayBody?.length || 0)
    })
  }, [messages, streamAssistantMessage])

  const pushMessage = (message: Omit<AiMessage, 'id' | 'displayBody' | 'isStreaming'>) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    const hasAssistantBody = message.role === 'assistant' && Boolean(message.body)
    setMessages((current) => [
      ...current,
      {
        ...message,
        id,
        displayBody: hasAssistantBody ? '' : message.body,
        isStreaming: hasAssistantBody
      }
    ])

    if (!hasAssistantBody) return

    streamAssistantMessage(id, message.body)
  }

  return { messages, setMessages, pushMessage }
}
