import { useContext } from 'react'
import { UIPreferencesContext } from './UIPreferencesContextCore'

export const useUIPreferences = () => {
  const ctx = useContext(UIPreferencesContext)
  if (!ctx) throw new Error('useUIPreferences must be used within UIPreferencesProvider')
  return ctx
}
