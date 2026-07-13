import { DATA_CHANGE_SCOPES, type DataChangeScope } from '../../../shared/dataChange'

export type RefreshBridge = {
  app?: {
    notifyDataChanged?: (scopes?: DataChangeScope[]) => void
  }
}

const eventNameForScope = (scope: DataChangeScope) => `data-changed:${scope}`

export function dispatchDataChanged(scopes?: DataChangeScope[]): boolean {
  try {
    const bridge = (window as typeof window & { api?: RefreshBridge }).api
    if (bridge?.app?.notifyDataChanged) {
      bridge.app.notifyDataChanged(scopes)
      return true
    }
    if (!scopes?.length) {
      window.dispatchEvent(new Event('data-changed'))
      return true
    }
    for (const scope of new Set(scopes)) window.dispatchEvent(new Event(eventNameForScope(scope)))
    return true
  } catch {
    return false
  }
}

export function addDataChangedListener(scopes: DataChangeScope[], listener: () => void): () => void {
  let queued = false
  let disposed = false
  const handleChange = () => {
    if (queued) return
    queued = true
    queueMicrotask(() => {
      queued = false
      if (!disposed) listener()
    })
  }

  window.addEventListener('data-changed', handleChange)
  for (const scope of scopes) window.addEventListener(eventNameForScope(scope), handleChange)
  return () => {
    disposed = true
    window.removeEventListener('data-changed', handleChange)
    for (const scope of scopes) window.removeEventListener(eventNameForScope(scope), handleChange)
  }
}

export function notifyDataChanged(bridge?: RefreshBridge | null, fallback?: () => void, scopes?: DataChangeScope[]): boolean {
  try {
    if (bridge?.app?.notifyDataChanged) {
      bridge.app.notifyDataChanged(scopes)
      return true
    }
  } catch {
    // ignore and fall back
  }

  try {
    if (typeof fallback === 'function') {
      fallback()
      return true
    }

    return dispatchDataChanged(scopes)
  } catch {
    return false
  }
}

export { DATA_CHANGE_SCOPES }
export type { DataChangeScope }
