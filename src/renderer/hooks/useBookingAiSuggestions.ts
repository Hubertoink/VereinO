import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { QA } from './useQuickAdd'
import {
  AI_PATTERNS_CHANGED_EVENT,
  buildAISuggestions,
  readAISuggestionLearning,
  type BookingAIAccount
} from '../utils/bookingAiPatterns'

type Options = {
  draft: QA
  grossAmount: number
  tagDefs: Parameters<typeof buildAISuggestions>[0]['tagDefs']
  paymentAccounts: BookingAIAccount[]
}

// Shared suggestion lifecycle for the compact and full booking editors. Applying
// suggestions and remembering a saved booking remain with each editor.
export function useBookingAiSuggestions({ draft, grossAmount, tagDefs, paymentAccounts }: Options) {
  const aiAssistRef = useRef<HTMLDivElement | null>(null)
  const [aiMenuOpen, setAiMenuOpen] = useState(false)
  const [learningVersion, setLearningVersion] = useState(0)
  const refreshLearning = useCallback(() => setLearningVersion(value => value + 1), [])
  const learning = useMemo(() => readAISuggestionLearning(), [learningVersion])
  const {
    description, type, sphere, tags, budgets, earmarksAssigned,
    paymentAccountId, transferFromAccountId, transferToAccountId
  } = draft
  const aiSuggestions = useMemo(() => buildAISuggestions({
    description: description || '',
    grossAmount,
    currentTags: tags || [],
    currentType: type,
    currentSphere: sphere,
    currentBudgets: (budgets || []).map(item => ({ id: item.budgetId, amount: item.amount })),
    currentEarmarks: (earmarksAssigned || []).map(item => ({ id: item.earmarkId, amount: item.amount })),
    currentPaymentAccountId: paymentAccountId || null,
    currentTransferFromAccountId: transferFromAccountId || null,
    currentTransferToAccountId: transferToAccountId || null,
    tagDefs,
    paymentAccounts,
    learning
  }), [description, grossAmount, tags, type, sphere, budgets, earmarksAssigned,
    paymentAccountId, transferFromAccountId, transferToAccountId, tagDefs, paymentAccounts, learning])

  useEffect(() => {
    window.addEventListener(AI_PATTERNS_CHANGED_EVENT, refreshLearning)
    window.addEventListener('storage', refreshLearning)
    return () => {
      window.removeEventListener(AI_PATTERNS_CHANGED_EVENT, refreshLearning)
      window.removeEventListener('storage', refreshLearning)
    }
  }, [refreshLearning])

  useEffect(() => {
    if (!aiSuggestions.length) setAiMenuOpen(false)
  }, [aiSuggestions.length])

  useEffect(() => {
    if (!aiMenuOpen) return
    const closeOnOutside = (event: PointerEvent) => {
      const target = event.target as Node | null
      if (target && aiAssistRef.current?.contains(target)) return
      setAiMenuOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutside)
    return () => document.removeEventListener('pointerdown', closeOnOutside)
  }, [aiMenuOpen])

  return { aiAssistRef, aiMenuOpen, setAiMenuOpen, aiSuggestions, refreshLearning }
}
