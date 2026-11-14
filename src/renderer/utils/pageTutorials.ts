export type TutorialId = 'views' | 'columns' | 'plus' | 'workflow' | 'bank'
export type TutorialPage = 'Buchungen' | 'Bankimport'
export type TutorialProgress = {
  automatic: boolean
  seen: Partial<Record<TutorialId, boolean>>
  dismissed: Partial<Record<TutorialId, boolean>>
  later: Partial<Record<TutorialId, number>>
  bookingSaved?: boolean
  bankImported?: boolean
}

export const tutorialStorageKey = (orgId: string) => `vereinO.page-help.v1:${orgId}`
export function readTutorialProgress(orgId: string): TutorialProgress | null {
  try {
    const value = JSON.parse(localStorage.getItem(tutorialStorageKey(orgId)) || 'null')
    return value && typeof value.automatic === 'boolean'
      ? { ...value, seen: value.seen || {}, dismissed: value.dismissed || {}, later: value.later || {} }
      : null
  } catch { return null }
}
export function writeTutorialProgress(orgId: string, progress: TutorialProgress) {
  try { localStorage.setItem(tutorialStorageKey(orgId), JSON.stringify(progress)) } catch { /* Session still works without storage. */ }
}
export function nextTutorial(progress: TutorialProgress, page: TutorialPage, view: 'classic' | 'plus', now = Date.now()): TutorialId | undefined {
  if (!progress.automatic) return
  const candidates: TutorialId[] = page === 'Bankimport'
    ? progress.bankImported ? ['bank'] : []
    : [...(progress.bookingSaved ? ['workflow' as const] : []), 'views', view === 'classic' ? 'columns' : 'plus']
  return candidates.find(id => !progress.dismissed[id] && !progress.seen[id] && (progress.later[id] || 0) <= now)
}

/** Fired only after a successful operation, never for edits, failed saves or previews. */
export function signalTutorialEvent(event: 'booking-saved' | 'bank-imported') {
  window.dispatchEvent(new CustomEvent('vereinO:tutorial-event', { detail: event }))
}
