import { useEffect, useRef, useState } from 'react'
import type { AiAvatarFrame } from './AiAvatar'
import type { AiMessage } from './aiChat'

type Options = {
  messages: AiMessage[]
  busy: boolean
  chatStarted: boolean
  hasPendingReview: boolean
  hasPlannerQuestionOpen: boolean
  isComposingPrompt: boolean
}

export function useAiAvatar({
  messages,
  busy,
  chatStarted,
  hasPendingReview,
  hasPlannerQuestionOpen,
  isComposingPrompt
}: Options) {
  const [avatarFrame, setAvatarFrame] = useState<AiAvatarFrame>('default')
  const [assistantReactionUntil, setAssistantReactionUntil] = useState(0)
  const lastAssistantMessageIdRef = useRef<string | null>(null)
  const latestMessage = messages.at(-1) || null

  useEffect(() => {
    if (!latestMessage || latestMessage.role !== 'assistant') return
    if (lastAssistantMessageIdRef.current === latestMessage.id) return
    lastAssistantMessageIdRef.current = latestMessage.id
    setAssistantReactionUntil(Date.now() + 2200)
  }, [latestMessage])

  useEffect(() => {
    let blinkTimeoutId: number | null = null
    let reactionTimeoutId: number | null = null
    const isAssistantReacting = assistantReactionUntil > Date.now()

    if (busy) {
      setAvatarFrame('thinking')
      return () => {
        if (reactionTimeoutId != null) window.clearTimeout(reactionTimeoutId)
      }
    }

    if (isAssistantReacting) {
      setAvatarFrame('success')

      reactionTimeoutId = window.setTimeout(
        () => {
          setAssistantReactionUntil(0)
        },
        Math.max(0, assistantReactionUntil - Date.now())
      )

      return () => {
        if (reactionTimeoutId != null) window.clearTimeout(reactionTimeoutId)
      }
    }

    const restingFrame: AiAvatarFrame = isComposingPrompt
      ? 'thinking'
      : hasPlannerQuestionOpen || hasPendingReview
        ? 'smirk'
        : 'default'
    setAvatarFrame(restingFrame)

    const blinkIntervalId = window.setInterval(
      () => {
        setAvatarFrame('blink')
        blinkTimeoutId = window.setTimeout(() => {
          setAvatarFrame(restingFrame)
        }, 160)
      },
      hasPlannerQuestionOpen ? 3200 : chatStarted ? 4200 : 5200
    )

    return () => {
      window.clearInterval(blinkIntervalId)
      if (blinkTimeoutId != null) window.clearTimeout(blinkTimeoutId)
      if (reactionTimeoutId != null) window.clearTimeout(reactionTimeoutId)
    }
  }, [
    assistantReactionUntil,
    busy,
    chatStarted,
    hasPendingReview,
    hasPlannerQuestionOpen,
    isComposingPrompt
  ])

  return avatarFrame
}
