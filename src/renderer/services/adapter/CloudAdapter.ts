import type { z } from 'zod'
import {
  CLOUD_CAPABILITIES, CloudAuthResultSchema, CloudDeleteResultSchema,
  CloudMemberCreateInputSchema, CloudMemberListResultSchema, CloudMemberSchema, CloudMemberUpdateInputSchema,
  CloudUserSchema, CloudVoucherCreateInputSchema, CloudVoucherDetailSchema, CloudVoucherListResultSchema,
  CloudVoucherSchema, type CloudApi, type CloudAuthResult, type CloudUser
} from '../../../../shared/cloudApi'

export type { CloudAuthResult, CloudUser } from '../../../../shared/cloudApi'

function apiErrorMessage(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return 'Request failed'
  if ('message' in payload && typeof payload.message === 'string') return payload.message
  if ('error' in payload && typeof payload.error === 'string') return payload.error
  return 'Request failed'
}

/**
 * Client for existing cloud routes, separate from IDataAdapter.
 * Desktop integration requires an explicit ledger/model migration. These DTOs
 * preserve backend response shapes and do not pretend to be desktop vouchers.
 */
export class CloudAdapter implements CloudApi {
  readonly capabilities = CLOUD_CAPABILITIES
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

  private async request<Result>(endpoint: string, schema: z.ZodType<Result>, options: RequestInit = {}): Promise<Result> {
    const token = this.getToken()
    const headers = new Headers(options.headers)
    if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
    if (token) headers.set('Authorization', `Bearer ${token}`)
    const response = await fetch(`${this.apiUrl}${endpoint}`, { ...options, headers })
    if (!response.ok) {
      if (response.status === 401) this.clearAuth()
      const payload: unknown = await response.json().catch(() => null)
      throw new Error(response.status === 401 ? 'Unauthorized - please login again' : apiErrorMessage(payload))
    }
    const payload: unknown = await response.json()
    return schema.parse(payload)
  }

  async login(email: string, password: string): Promise<CloudAuthResult> {
    const result = await this.request('/api/auth/login', CloudAuthResultSchema, {
      method: 'POST', body: JSON.stringify({ email, password })
    })
    this.setToken(result.token)
    return result
  }

  async register(email: string, password: string, organizationName: string): Promise<CloudAuthResult> {
    const result = await this.request('/api/auth/register', CloudAuthResultSchema, {
      method: 'POST', body: JSON.stringify({ email, password, organizationName })
    })
    this.setToken(result.token)
    return result
  }

  me(): Promise<CloudUser> {
    return this.request('/api/auth/me', CloudUserSchema)
  }

  vouchers: CloudApi['vouchers'] = {
    list: (params = {}) => {
      const query = new URLSearchParams()
      if (params.year !== undefined) query.set('year', String(params.year))
      if (params.page !== undefined) query.set('page', String(params.page))
      if (params.limit !== undefined) query.set('limit', String(params.limit))
      return this.request(`/api/vouchers?${query}`, CloudVoucherListResultSchema)
    },
    get: ({ id }) => this.request(`/api/vouchers/${id}`, CloudVoucherDetailSchema),
    create: async params => this.request('/api/vouchers', CloudVoucherSchema, {
      method: 'POST', body: JSON.stringify(CloudVoucherCreateInputSchema.parse(params))
    }),
    delete: ({ id }) => this.request(`/api/vouchers/${id}`, CloudDeleteResultSchema, { method: 'DELETE' })
  }

  members: CloudApi['members'] = {
    list: (params = {}) => {
      const query = new URLSearchParams()
      if (params.search) query.set('search', params.search)
      if (params.active !== undefined) query.set('active', String(params.active))
      return this.request(`/api/members?${query}`, CloudMemberListResultSchema)
    },
    get: ({ id }) => this.request(`/api/members/${id}`, CloudMemberSchema),
    create: async params => this.request('/api/members', CloudMemberSchema, {
      method: 'POST', body: JSON.stringify(CloudMemberCreateInputSchema.parse(params))
    }),
    update: async ({ id, ...changes }) => this.request(`/api/members/${id}`, CloudMemberSchema, {
      method: 'PATCH', body: JSON.stringify(CloudMemberUpdateInputSchema.parse(changes))
    }),
    delete: ({ id }) => this.request(`/api/members/${id}`, CloudDeleteResultSchema, { method: 'DELETE' })
  }
}
