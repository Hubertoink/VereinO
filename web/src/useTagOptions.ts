import { useEffect, useState } from 'react'
import { api, ApiError } from './api'
import { addDataChangedListener } from '../../src/renderer/utils/refresh'
export function useTagOptions(onSessionExpired: () => void) {
  const [tags, setTags] = useState<Array<{ id: number; name: string; color?: string | null }>>([])
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    const load = () =>
      void api<{ rows: typeof tags }>('/tags')
        .then((result) => {
          if (active) {
            setTags(result.rows || [])
            setError('')
          }
        })
        .catch((cause) => {
          if (active) {
            if (cause instanceof ApiError && cause.status === 401) onSessionExpired()
            setError('Tags konnten nicht geladen werden.')
          }
        })
    load()
    const off = addDataChangedListener(['vouchers'], load)
    return () => {
      active = false
      off()
    }
  }, [onSessionExpired])
  return { tags, error }
}
