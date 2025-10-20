import { useEffect } from 'react'

export function useAutoBackupPrompt(setPrompt: (v: { intervalDays: number } | null) => void) {
  useEffect(() => {
    let disposed = false
    ;(async () => {
      try {
        const mode = String((await (window as any).api?.settings?.get?.({ key: 'backup.auto' }))?.value || 'PROMPT').toUpperCase()
        if (mode !== 'PROMPT') return
        const intervalDays = Number((await (window as any).api?.settings?.get?.({ key: 'backup.intervalDays' }))?.value || 7)
        const lastAuto = Number((await (window as any).api?.settings?.get?.({ key: 'backup.lastAuto' }))?.value || 0)
        const now = Date.now()
        const due = !lastAuto || (now - lastAuto) >= intervalDays * 24 * 60 * 60 * 1000
        if (due) { if (!disposed) setPrompt({ intervalDays }) }
      } catch {}
    })()
    return () => { disposed = true }
  }, [setPrompt])
}
