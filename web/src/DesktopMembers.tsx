import { useMemo } from 'react'
import MembersView, { type MembersViewProps } from '../../src/renderer/views/Mitglieder/MembersView'
import { api, ApiError, type User } from './api'

export function createMembersApi(onSessionExpired: () => void): NonNullable<MembersViewProps['membersApi']> {
  const request = async (path: string, method = 'GET', data?: unknown) => {
    try { return await api(path, method, data) }
    catch (error) {
      if (error instanceof ApiError && error.status === 401) onSessionExpired()
      throw error
    }
  }
  return {
    list: async (input = {}) => {
      const query = new URLSearchParams()
      for (const [key, value] of Object.entries(input)) if (value !== undefined && value !== null) query.set(key, String(value))
      return request(`/members?${query}`)
    },
    create: input => request('/members', 'POST', input),
    update: ({id, ...data}) => request(`/members/${id}`, 'PATCH', data),
    delete: ({id, version}) => request(`/members/${id}`, 'DELETE', {version})
  }
}
export default function DesktopMembers({ user, onSessionExpired }: { user: User; onSessionExpired: () => void }) {
  const membersApi = useMemo(() => createMembersApi(onSessionExpired), [onSessionExpired])
  if (user.role === 'USER') return null
  return <MembersView membersApi={membersApi} canWrite={user.role === 'ADMIN'} desktopActions={false} contributionHistory={false} />
}
