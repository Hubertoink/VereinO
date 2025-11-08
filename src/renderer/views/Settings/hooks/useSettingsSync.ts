import { useState, useEffect } from 'react'

interface UseSettingsSyncOptions {
  /** Only use localStorage (skip server sync) */
  localOnly?: boolean
  /** Only use server settings (skip localStorage) */
  serverOnly?: boolean
}

/**
 * useSettingsSync - Synchronized Settings Management
 * 
 * Syncs settings between localStorage and server
 * Provides a simple hook interface for persistent settings
 * 
 * @param key - Settings key (e.g., 'ui.navLayout')
 * @param defaultValue - Fallback value
 * @param options - Sync behavior options
 */
export function useSettingsSync<T>(
  key: string,
  defaultValue: T,
  options: UseSettingsSyncOptions = {}
): [T, (newValue: T) => Promise<void>] {
  const [value, setValue] = useState<T>(defaultValue)
  const [loading, setLoading] = useState(true)

  // Load from localStorage and/or server on mount
  useEffect(() => {
    let cancelled = false

    async function loadValue() {
      try {
        let loadedValue: T = defaultValue

        // Load from localStorage first (faster)
        if (!options.serverOnly) {
          try {
            const localValue = localStorage.getItem(key)
            if (localValue !== null) {
              loadedValue = JSON.parse(localValue) as T
            }
          } catch {
            // Ignore localStorage errors
          }
        }

        // Load from server (overrides localStorage if present)
        if (!options.localOnly) {
          try {
            const res = await window.api?.settings?.get?.({ key })
            if (res?.value !== undefined && res?.value !== null) {
              loadedValue = res.value as T
            }
          } catch {
            // Ignore server errors
          }
        }

        if (!cancelled) {
          setValue(loadedValue)
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadValue()
    return () => { cancelled = true }
  }, [key, defaultValue, options.localOnly, options.serverOnly])

  // Update value (sync to localStorage and/or server)
  const updateValue = async (newValue: T) => {
    setValue(newValue)

    // Save to localStorage
    if (!options.serverOnly) {
      try {
        localStorage.setItem(key, JSON.stringify(newValue))
      } catch (error) {
        console.warn(`Failed to save to localStorage (${key}):`, error)
      }
    }

    // Save to server
    if (!options.localOnly) {
      try {
        await window.api?.settings?.set?.({ key, value: newValue })
      } catch (error) {
        console.warn(`Failed to save to server (${key}):`, error)
      }
    }
  }

  return [loading ? defaultValue : value, updateValue]
}
