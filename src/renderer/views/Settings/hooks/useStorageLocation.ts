import { useState, useEffect } from 'react'
import { LocationInfo } from '../types'

/**
 * useStorageLocation - Manage Database Storage Location
 * 
 * Handles:
 * - Current location info (root, dbPath, filesDir)
 * - Folder selection & migration
 * - Smart restore to default location
 */
export function useStorageLocation() {
  const [info, setInfo] = useState<LocationInfo | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>('')

  // Load current location
  const refresh = async () => {
    setError('')
    setBusy(true)
    try {
      const res = await window.api?.db?.location?.get?.()
      if (res) {
        setInfo(res)
      }
    } catch (err: any) {
      setError(err?.message || String(err))
    } finally {
      setBusy(false)
    }
  }

  // Load on mount
  useEffect(() => {
    refresh()
  }, [])

  // Pick a folder (returns selection info without changing location yet)
  const pickFolder = async (): Promise<{ root: string; dbPath: string; hasDb: boolean } | null> => {
    try {
      const storage = await import('../../../storage')
      return await storage.pickFolder()
    } catch (err: any) {
      const msg = err?.message || String(err)
      if (!/Abbruch/i.test(msg)) {
        setError(msg)
      }
      return null
    }
  }

  // Migrate database to a new folder
  const migrateTo = async (root: string): Promise<{ ok: boolean }> => {
    setBusy(true)
    setError('')
    try {
      const storage = await import('../../../storage')
      const res = await storage.migrateTo(root)
      if (res?.ok) {
        await refresh()
        return { ok: true }
      }
      return { ok: false }
    } catch (err: any) {
      const msg = err?.message || String(err)
      setError(msg)
      return { ok: false }
    } finally {
      setBusy(false)
    }
  }

  // Use an existing database in a folder (without migrating current DB)
  const useFolder = async (root: string): Promise<{ ok: boolean }> => {
    setBusy(true)
    setError('')
    try {
      const storage = await import('../../../storage')
      const res = await storage.useFolder(root)
      if (res?.ok) {
        await refresh()
        return { ok: true }
      }
      return { ok: false }
    } catch (err: any) {
      const msg = err?.message || String(err)
      setError(msg)
      return { ok: false }
    } finally {
      setBusy(false)
    }
  }

  // Reset to default location (smart restore)
  const resetToDefault = async (): Promise<{ ok: boolean }> => {
    setBusy(true)
    setError('')
    try {
      const res = await window.api?.db?.smartRestore?.apply?.({ action: 'useDefault' })
      if (res?.ok) {
        await refresh()
        return { ok: true }
      }
      return { ok: false }
    } catch (err: any) {
      const msg = err?.message || String(err)
      setError(msg)
      return { ok: false }
    } finally {
      setBusy(false)
    }
  }

  return {
    // State
    info,
    busy,
    error,

    // Actions
    refresh,
    pickFolder,
    migrateTo,
    useFolder,
    resetToDefault,
  }
}
