/** A saved booking stays successful even if notifying other windows fails. */
export function notifyBookingSaved(payload: Record<string, unknown>): void {
  void (async () => {
    try {
      await window.api?.quickAdd?.notifySaved?.(payload)
    } catch (error) {
      console.warn('Buchung gespeichert, aber andere Fenster konnten nicht benachrichtigt werden.', error)
    }
  })()
}
