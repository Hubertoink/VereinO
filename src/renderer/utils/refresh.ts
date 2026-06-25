export type RefreshBridge = {
  app?: {
    notifyDataChanged?: () => void
  }
}

export function notifyDataChanged(bridge?: RefreshBridge | null, fallback?: () => void): boolean {
  try {
    if (bridge?.app?.notifyDataChanged) {
      bridge.app.notifyDataChanged()
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

    window.dispatchEvent(new Event('data-changed'))
    return true
  } catch {
    return false
  }
}
