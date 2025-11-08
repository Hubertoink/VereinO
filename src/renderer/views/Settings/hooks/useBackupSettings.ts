import { useState, useEffect } from 'react'
import { BackupInfo, AutoBackupMode } from '../types'

/**
 * useBackupSettings - Manage Backup Configuration & Operations
 * 
 * Handles:
 * - Auto-backup mode & interval settings
 * - Backup list loading & refresh
 * - Backup creation
 * - Backup directory management
 */
export function useBackupSettings() {
  const [autoMode, setAutoMode] = useState<AutoBackupMode>('PROMPT')
  const [intervalDays, setIntervalDays] = useState<number>(7)
  const [lastAuto, setLastAuto] = useState<number | null>(null)
  const [backups, setBackups] = useState<BackupInfo[]>([])
  const [backupDir, setBackupDir] = useState<string>('')
  const [busy, setBusy] = useState(false)

  // Load initial settings
  useEffect(() => {
    let cancelled = false
    
    async function loadSettings() {
      try {
        const [modeRes, intervalRes, lastAutoRes, dirRes] = await Promise.all([
          window.api?.settings?.get?.({ key: 'backup.auto' }),
          window.api?.settings?.get?.({ key: 'backup.intervalDays' }),
          window.api?.settings?.get?.({ key: 'backup.lastAuto' }),
          window.api?.backup?.getDir?.()
        ])

        if (!cancelled) {
          if (modeRes?.value) {
            setAutoMode(String(modeRes.value).toUpperCase() as AutoBackupMode)
          }
          if (intervalRes?.value) {
            setIntervalDays(Number(intervalRes.value) || 7)
          }
          if (lastAutoRes?.value) {
            setLastAuto(Number(lastAutoRes.value) || null)
          }
          if (dirRes?.ok && dirRes?.dir) {
            setBackupDir(String(dirRes.dir))
          }
        }
      } catch (error) {
        console.error('Failed to load backup settings:', error)
      }
    }

    loadSettings()
    return () => { cancelled = true }
  }, [])

  // Refresh backup list
  const refreshBackups = async () => {
    try {
      const res = await window.api?.backup?.list?.()
      if (res?.ok && res?.backups) {
        setBackups(res.backups)
      }
    } catch (error) {
      console.error('Failed to refresh backups:', error)
    }
  }

  // Load backups on mount
  useEffect(() => {
    refreshBackups()
  }, [])

  // Create a new backup
  const makeBackup = async (type: 'manual' | 'auto' = 'manual'): Promise<{ ok: boolean; filePath?: string; error?: string }> => {
    setBusy(true)
    try {
      const res = await window.api?.backup?.make?.(type)
      if (res?.ok && res?.filePath) {
        await refreshBackups()
        return { ok: true, filePath: res.filePath }
      }
      return { ok: false, error: res?.error || 'Backup failed' }
    } catch (error: any) {
      return { ok: false, error: error?.message || String(error) }
    } finally {
      setBusy(false)
    }
  }

  // Update auto mode
  const updateAutoMode = async (mode: AutoBackupMode) => {
    setAutoMode(mode)
    await window.api?.settings?.set?.({ key: 'backup.auto', value: mode })
  }

  // Update interval
  const updateInterval = async (days: number) => {
    const validDays = Math.max(1, days)
    setIntervalDays(validDays)
    await window.api?.settings?.set?.({ key: 'backup.intervalDays', value: validDays })
  }

  // Set backup directory
  const chooseBackupDir = async (): Promise<{ ok: boolean; dir?: string; moved?: number }> => {
    try {
      const res = await window.api?.backup?.setDir?.()
      if (res?.ok && res?.dir) {
        setBackupDir(String(res.dir))
        await refreshBackups()
        return { ok: true, dir: String(res.dir), moved: (res as any)?.moved ?? 0 }
      }
      return { ok: false }
    } catch (error) {
      console.error('Failed to set backup dir:', error)
      return { ok: false }
    }
  }

  // Open backup folder in file explorer
  const openBackupFolder = async () => {
    try {
      await window.api?.backup?.openFolder?.()
    } catch (error) {
      console.error('Failed to open backup folder:', error)
    }
  }

  return {
    // State
    autoMode,
    intervalDays,
    lastAuto,
    backups,
    backupDir,
    busy,

    // Actions
    refreshBackups,
    makeBackup,
    updateAutoMode,
    updateInterval,
    chooseBackupDir,
    openBackupFolder,
  }
}
