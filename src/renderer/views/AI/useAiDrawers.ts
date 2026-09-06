import { useEffect, useReducer, useRef } from 'react'
import { aiViewUiReducer, initialAiViewUiState } from './aiViewReducer'

export function useAiDrawers() {
  const historyButtonRef = useRef<HTMLButtonElement | null>(null)
  const agentContextButtonRef = useRef<HTMLButtonElement | null>(null)
  const settingsButtonRef = useRef<HTMLButtonElement | null>(null)
  const rulesButtonRef = useRef<HTMLButtonElement | null>(null)
  const historyDrawerRef = useRef<HTMLElement | null>(null)
  const agentContextDrawerRef = useRef<HTMLElement | null>(null)
  const settingsDrawerRef = useRef<HTMLElement | null>(null)
  const rulesDrawerRef = useRef<HTMLDivElement | null>(null)
  const [drawerState, dispatchDrawer] = useReducer(aiViewUiReducer, initialAiViewUiState)
  const showHistory = drawerState.history
  const showAgentContext = drawerState.agentContext
  const showSettings = drawerState.settings
  const showRules = drawerState.rules
  const setShowHistory = (open: boolean) =>
    dispatchDrawer(
      open ? { type: 'OPEN_ONLY', drawer: 'history' } : { type: 'CLOSE', drawer: 'history' }
    )
  const setShowAgentContext = (open: boolean) =>
    dispatchDrawer(
      open
        ? { type: 'OPEN_ONLY', drawer: 'agentContext' }
        : { type: 'CLOSE', drawer: 'agentContext' }
    )
  const setShowSettings = (open: boolean) =>
    dispatchDrawer(
      open ? { type: 'OPEN_ONLY', drawer: 'settings' } : { type: 'CLOSE', drawer: 'settings' }
    )
  const setShowRules = (open: boolean) =>
    dispatchDrawer(
      open ? { type: 'OPEN_ONLY', drawer: 'rules' } : { type: 'CLOSE', drawer: 'rules' }
    )
  useEffect(() => {
    if (!showHistory && !showAgentContext && !showSettings && !showRules) return
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null
      if (!target) return
      const inHistory =
        !!historyDrawerRef.current?.contains(target) || !!historyButtonRef.current?.contains(target)
      const inAgentContext =
        !!agentContextDrawerRef.current?.contains(target) ||
        !!agentContextButtonRef.current?.contains(target)
      const inSettings =
        !!settingsDrawerRef.current?.contains(target) ||
        !!settingsButtonRef.current?.contains(target)
      const inRules =
        !!rulesDrawerRef.current?.contains(target) || !!rulesButtonRef.current?.contains(target)
      if (showHistory && !inHistory) setShowHistory(false)
      if (showAgentContext && !inAgentContext) setShowAgentContext(false)
      if (showSettings && !inSettings) setShowSettings(false)
      if (showRules && !inRules) setShowRules(false)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowHistory(false)
        setShowAgentContext(false)
        setShowSettings(false)
        setShowRules(false)
      }
    }
    document.addEventListener('pointerdown', handlePointerDown, true)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [showAgentContext, showHistory, showRules, showSettings])

  return {
    historyButtonRef,
    agentContextButtonRef,
    settingsButtonRef,
    rulesButtonRef,
    historyDrawerRef,
    agentContextDrawerRef,
    settingsDrawerRef,
    rulesDrawerRef,
    showHistory,
    showAgentContext,
    showSettings,
    showRules,
    setShowHistory,
    setShowAgentContext,
    setShowSettings,
    setShowRules,
    dispatchDrawer
  }
}
