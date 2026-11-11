import { useState, useEffect, useRef } from 'react'
import { BackupInfo, AutoBackupMode } from '../types'
import { useBackupProgress } from '../../../hooks/useBackupProgress'
import type { BackupResult } from '../../../../../shared/backupProgress'

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
  const [listError, setListError] = useState('')
  const [listLoading, setListLoading] = useState(true)
  const listRequest = useRef(0)
  const progress = useBackupProgress()

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
    const request = ++listRequest.current
    setListLoading(true)
    try {
      const res = await window.api?.backup?.list?.()
      if (request !== listRequest.current) return
      if (res?.ok && res?.backups) {
        setBackups(res.backups)
        setListError('')
      } else {
        setListError(res?.error || 'Sicherungen konnten nicht geladen werden.')
      }
    } catch (error) {
      if (request !== listRequest.current) return
      console.error('Failed to refresh backups:', error)
      setListError(error instanceof Error ? error.message : String(error))
    } finally { if (request === listRequest.current) setListLoading(false) }
  }

  // Load backups on mount
  useEffect(() => {
    void refreshBackups()
    return () => { listRequest.current++ }
  }, [])

  // Create a new backup
  const makeBackup = async (type: 'manual' | 'auto' = 'manual'): Promise<{ ok: boolean; error?: string } & Partial<BackupResult>> => {
    setBusy(true)
    try {
      const res = await window.api?.backup?.make?.(type)
      if (res?.ok && res?.filePath) {
        void refreshBackups()
        return res
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
  const chooseBackupDir = async (): Promise<{ ok: boolean; dir?: string; moved?: number; error?: string; warning?: string }> => {
    setBusy(true)
    try {
      const res = await window.api?.backup?.setDir?.()
      if (res?.ok && res?.dir) {
        setBackupDir(String(res.dir))
        void refreshBackups()
        return res
      }
      return { ok: false, error: res?.error }
    } catch (error) {
      console.error('Failed to set backup dir:', error)
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    } finally { setBusy(false) }
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
    busy: busy || !!progress?.active,
    progress,
    listError,
    listLoading,

    // Actions
    refreshBackups,
    makeBackup,
    updateAutoMode,
    updateInterval,
    chooseBackupDir,
    openBackupFolder,
  }
}
