import { useState, useEffect } from 'react'
import { LocationInfo } from '../types'
import type { PickResult } from '../../../storage'

/**
 * useStorageLocation - Manage Database Storage Location
 * 
 * Handles:
 * - Current location info (root, dbPath, filesDir)
 * - Folder selection & migration
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
  const pickFolder = async (): Promise<PickResult | null> => {
    setError('')
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
  const migrateTo = async (root: string, organizationId: string): Promise<{ ok: boolean }> => {
    setBusy(true)
    setError('')
    try {
      const storage = await import('../../../storage')
      const res = await storage.migrateTo(root, organizationId)
      if (res?.ok) {
        await refresh()
        return { ok: true }
      }
      setError('Migration fehlgeschlagen')
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
  }
}
