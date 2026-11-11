import { useEffect, useState } from 'react'
import type { BackupProgress } from '../../../shared/backupProgress'

export function useBackupProgress() {
  const [progress, setProgress] = useState<BackupProgress | null>(null)
  useEffect(() => {
    let active = true
    let receivedEvent = false
    const unsubscribe = window.api?.backup?.onProgress?.(next => {
      receivedEvent = true
      if (active) setProgress(next)
    })
    void window.api?.backup?.getProgress?.().then(next => {
      if (active && !receivedEvent) setProgress(next)
    }).catch(() => undefined)
    return () => { active = false; unsubscribe?.() }
  }, [])
  return progress
}
