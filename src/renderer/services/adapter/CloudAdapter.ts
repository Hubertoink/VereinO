import type {
  AttachmentAddResult,
  EncodedAttachment,
  IDataAdapter
} from './IDataAdapter'

export type CloudUser = {
  id: number
  email: string
  organizationId: number
  organizationName: string
}

export type CloudAuthResult = {
  token: string
  user: CloudUser
}

function apiErrorMessage(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return 'Request failed'
  if ('message' in payload && typeof payload.message === 'string') return payload.message
  if ('error' in payload && typeof payload.error === 'string') return payload.error
  return 'Request failed'
}

function encodedAttachmentBlob(file: EncodedAttachment): Blob {
  const binary = atob(file.dataBase64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return new Blob([bytes], { type: file.mimeType || file.mime || 'application/octet-stream' })
}

/**
 * REST adapter for the cloud backend.
 *
 * JSON decoding is the explicit trust boundary. The backend still needs to
 * converge on the local voucher domain before all methods are feature-complete.
 */
export class CloudAdapter implements IDataAdapter {
  private readonly apiUrl: string
  private token: string | null = null

  constructor(apiUrl: string, token?: string) {
    this.apiUrl = apiUrl.replace(/\/$/, '')
    this.token = token || null
  }

  setToken(token: string): void {
    this.token = token
    localStorage.setItem('cloud_token', token)
  }

  getToken(): string | null {
    return this.token || localStorage.getItem('cloud_token')
  }

  clearAuth(): void {
    this.token = null
    localStorage.removeItem('cloud_token')
  }

  private async request<Result>(endpoint: string, options: RequestInit = {}): Promise<Result> {
    const token = this.getToken()
    const headers = new Headers(options.headers)
    if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
    if (token) headers.set('Authorization', `Bearer ${token}`)

    const response = await fetch(`${this.apiUrl}${endpoint}`, { ...options, headers })
    if (!response.ok) {
      if (response.status === 401) this.clearAuth()
      const payload: unknown = await response.json().catch(() => null)
      throw new Error(
        response.status === 401
          ? 'Unauthorized - please login again'
          : apiErrorMessage(payload)
      )
    }

    return await response.json() as Result
  }

  async login(email: string, password: string): Promise<CloudAuthResult> {
    const result = await this.request<CloudAuthResult>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    })
    this.setToken(result.token)
    return result
  }

  async register(
    email: string,
    password: string,
    organizationName: string
  ): Promise<CloudAuthResult> {
    const result = await this.request<CloudAuthResult>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, organizationName })
    })
    this.setToken(result.token)
    return result
  }

  vouchers: IDataAdapter['vouchers'] = {
    list: async (params) => {
      const query = new URLSearchParams()
      if (params.year) query.set('year', String(params.year))
      if (params.page) query.set('page', String(params.page))
      if (params.limit) query.set('limit', String(params.limit))
      return this.request(`/api/vouchers?${query}`)
    },
    recent: (params) => this.request(`/api/vouchers?limit=${params.limit}`),
    create: (params) => this.request('/api/vouchers', {
      method: 'POST',
      body: JSON.stringify(params)
    }),
    update: (params) => this.request(`/api/vouchers/${params.id}`, {
      method: 'PATCH',
      body: JSON.stringify(params)
    }),
    delete: (params) => this.request(`/api/vouchers/${params.id}`, {
      method: 'DELETE'
    }),
    reverse: (params) => this.request(`/api/vouchers/${params.originalId}/reverse`, {
      method: 'POST',
      body: JSON.stringify({ reason: params.reason })
    })
  }

  members: IDataAdapter['members'] = {
    list: async (params) => {
      const query = new URLSearchParams()
      if (params.search) query.set('search', params.search)
      if (params.active !== undefined) query.set('active', String(params.active))
      return this.request(`/api/members?${query}`)
    },
    get: (params) => this.request(`/api/members/${params.id}`),
    create: (params) => this.request('/api/members', {
      method: 'POST',
      body: JSON.stringify(params)
    }),
    update: (params) => this.request(`/api/members/${params.id}`, {
      method: 'PATCH',
      body: JSON.stringify(params)
    }),
    delete: (params) => this.request(`/api/members/${params.id}`, {
      method: 'DELETE'
    }),
    payments: {
      list: (params) => this.request(`/api/members/${params.memberId}/payments`),
      create: (params) => this.request(`/api/members/${params.memberId}/payments`, {
        method: 'POST',
        body: JSON.stringify(params)
      })
    }
  }

  attachments: IDataAdapter['attachments'] = {
    list: (params) => this.request(`/api/vouchers/${params.voucherId}/attachments`),
    add: async (params) => {
      const formData = new FormData()
      for (const file of params.files) {
        if (file instanceof File) {
          formData.append('files', file, file.name)
        } else {
          formData.append('files', encodedAttachmentBlob(file), file.name)
        }
      }

      const headers = new Headers()
      const token = this.getToken()
      if (token) headers.set('Authorization', `Bearer ${token}`)
      const response = await fetch(
        `${this.apiUrl}/api/vouchers/${params.voucherId}/attachments`,
        { method: 'POST', headers, body: formData }
      )
      if (!response.ok) throw new Error('Upload failed')
      return await response.json() as AttachmentAddResult
    },
    delete: (params) => this.request(`/api/attachments/${params.id}`, {
      method: 'DELETE'
    }),
    download: async (params) => {
      const headers = new Headers()
      const token = this.getToken()
      if (token) headers.set('Authorization', `Bearer ${token}`)
      const response = await fetch(`${this.apiUrl}/api/attachments/${params.id}/download`, { headers })
      if (!response.ok) throw new Error('Download failed')
      return response.blob()
    }
  }

  bindings: IDataAdapter['bindings'] = {
    list: async () => { throw new Error('Bindings not yet implemented in cloud mode') },
    create: async () => { throw new Error('Bindings not yet implemented in cloud mode') },
    update: async () => { throw new Error('Bindings not yet implemented in cloud mode') },
    delete: async () => { throw new Error('Bindings not yet implemented in cloud mode') }
  }

  budgets: IDataAdapter['budgets'] = {
    list: async () => { throw new Error('Budgets not yet implemented in cloud mode') },
    create: async () => { throw new Error('Budgets not yet implemented in cloud mode') },
    update: async () => { throw new Error('Budgets not yet implemented in cloud mode') },
    delete: async () => { throw new Error('Budgets not yet implemented in cloud mode') }
  }

  tags: IDataAdapter['tags'] = {
    list: async () => { throw new Error('Tags not yet implemented in cloud mode') },
    create: async () => { throw new Error('Tags not yet implemented in cloud mode') },
    update: async () => { throw new Error('Tags not yet implemented in cloud mode') },
    delete: async () => { throw new Error('Tags not yet implemented in cloud mode') }
  }

  settings: IDataAdapter['settings'] = {
    get: async () => { throw new Error('Settings not yet implemented in cloud mode') },
    set: async () => { throw new Error('Settings not yet implemented in cloud mode') },
    delete: async () => { throw new Error('Settings not yet implemented in cloud mode') }
  }

  reports: IDataAdapter['reports'] = {
    years: async () => { throw new Error('Reports not yet implemented in cloud mode') },
    summary: async () => { throw new Error('Reports not yet implemented in cloud mode') }
  }

  yearEnd: IDataAdapter['yearEnd'] = {
    status: async () => { throw new Error('Year end not yet implemented in cloud mode') },
    preview: async () => { throw new Error('Year end not yet implemented in cloud mode') },
    export: async () => { throw new Error('Year end not yet implemented in cloud mode') },
    close: async () => { throw new Error('Year end not yet implemented in cloud mode') },
    reopen: async () => { throw new Error('Year end not yet implemented in cloud mode') }
  }

  backup: IDataAdapter['backup'] = {
    create: async () => { throw new Error('Backup not available in cloud mode') },
    restore: async () => { throw new Error('Restore not available in cloud mode') },
    inspect: async () => { throw new Error('Inspect not available in cloud mode') },
    inspectCurrent: async () => { throw new Error('Inspect not available in cloud mode') }
  }

  db: IDataAdapter['db'] = {
    smartRestore: {
      preview: async () => { throw new Error('Smart restore not available in cloud mode') },
      apply: async () => { throw new Error('Smart restore not available in cloud mode') }
    }
  }
}
