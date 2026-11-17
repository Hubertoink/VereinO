import { CloudAdapter } from '../renderer/services/adapter/CloudAdapter'
import { LocalAdapter } from '../renderer/services/adapter/LocalAdapter'

const user = { id: 1, email: 'test@example.org', organizationId: 2, organizationName: 'Testverein' }
const timestamps = { created_at: '2026-11-01T10:00:00.000Z', updated_at: '2026-11-01T10:00:00.000Z' }
const voucherFields = {
  id: 3, voucher_number: 27, voucher_date: '2026-11-01T00:00:00.000Z', voucher_type: 'RECEIPT',
  description: 'Material', ...timestamps
}
const voucher = { ...voucherFields, organization_id: 2 }
const voucherList = { vouchers: [{ ...voucherFields, file_count: '2' }], total: 1, page: 1, limit: 50 }
const member = {
  id: 4, organization_id: 2, member_number: 'M-4', first_name: 'Erika', last_name: 'Mustermann',
  email: 'erika@example.org', phone: null, street: null, zip: null, city: null,
  join_date: '2026-01-01T00:00:00.000Z', exit_date: null, is_active: true, ...timestamps
}
const jsonResponse = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status })

describe('data adapters', () => {
  let storage: Map<string, string>

  beforeEach(() => {
    storage = new Map()
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key)
      }
    })
  })

  afterEach(() => jest.restoreAllMocks())

  it('maps local year and page filters to the IPC voucher query', async () => {
    const list = jest.fn().mockResolvedValue({ rows: [], total: 0 })
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { api: { vouchers: { list } } } })
    await new LocalAdapter().vouchers.list({ year: 2025, page: 3, limit: 25 })
    expect(list).toHaveBeenCalledWith({ limit: 25, offset: 50, from: '2025-01-01', to: '2025-12-31' })
  })

  it('stores the cloud login token and sends it on authenticated requests', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ token: 'test-token', user }))
      .mockResolvedValueOnce(jsonResponse(voucherList))
    const adapter = new CloudAdapter('https://api.example.org/')
    expect(await adapter.login('test@example.org', 'secret1')).toEqual({ token: 'test-token', user })
    expect(await adapter.vouchers.list()).toEqual(voucherList)
    expect(storage.get('cloud_token')).toBe('test-token')
    expect(new Headers(fetchMock.mock.calls[1][1]?.headers).get('Authorization')).toBe('Bearer test-token')
  })

  it('registers and reads the current cloud user through the supported auth routes', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ token: 'new-token', user }, 201))
      .mockResolvedValueOnce(jsonResponse(user))
    const adapter = new CloudAdapter('https://api.example.org')
    await adapter.register('test@example.org', 'secret1', 'Testverein')
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.example.org/api/auth/register')
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      email: 'test@example.org', password: 'secret1', organizationName: 'Testverein'
    })
    expect(await adapter.me()).toEqual(user)
    expect(fetchMock.mock.calls[1][0]).toBe('https://api.example.org/api/auth/me')
  })

  it('clears both stored and constructor authentication after an unauthorized response', async () => {
    storage.set('cloud_token', 'stored-token')
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ error: 'Expired' }, 401))
    const adapter = new CloudAdapter('https://api.example.org', 'constructor-token')
    await expect(adapter.vouchers.list()).rejects.toThrow('Unauthorized')
    expect(storage.has('cloud_token')).toBe(false)
    expect(adapter.getToken()).toBeNull()
  })

  it('preserves the cloud list envelope, snake-case fields and PostgreSQL count strings', async () => {
    const response = { ...voucherList, page: 3, limit: 25 }
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(response))
    const result = await new CloudAdapter('https://api.example.org').vouchers.list({ year: 2026, page: 3, limit: 25 })
    expect(result).toEqual(response)
    expect(result).not.toHaveProperty('rows')
    expect(result.vouchers[0]).not.toHaveProperty('grossAmount')
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.example.org/api/vouchers?year=2026&page=3&limit=25')
  })

  it('reads voucher details without converting the account ledger to a desktop voucher', async () => {
    const detail = {
      ...voucher,
      bookings: [{ id: 10, voucher_id: 3, account_id: 5, debit: '12.50', credit: null,
        text: 'Material', tax_code: null, ...timestamps }],
      attachments: [{ id: 11, filename: 'beleg.pdf', mime_type: 'application/pdf', size: 123,
        created_at: timestamps.created_at }]
    }
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(detail))
    expect(await new CloudAdapter('https://api.example.org').vouchers.get({ id: 3 })).toEqual(detail)
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.example.org/api/vouchers/3')
  })

  it('creates and deletes vouchers using only the actual cloud request contract', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse(voucher, 201))
      .mockResolvedValueOnce(jsonResponse({ success: true }))
    const adapter = new CloudAdapter('https://api.example.org')
    const input = { voucherDate: '2026-11-01', voucherType: 'RECEIPT' as const,
      description: 'Material', bookings: [{ accountId: 5, debit: 12.5 }] }
    expect(await adapter.vouchers.create(input)).toEqual(voucher)
    expect(fetchMock.mock.calls[0][1]?.method).toBe('POST')
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual(input)
    expect(await adapter.vouchers.delete({ id: 3 })).toEqual({ success: true })
    expect(fetchMock.mock.calls[1][0]).toBe('https://api.example.org/api/vouchers/3')
    expect(fetchMock.mock.calls[1][1]?.method).toBe('DELETE')
  })

  it('rejects desktop voucher payloads before sending a request', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch')
    const adapter = new CloudAdapter('https://api.example.org')
    // @ts-expect-error A desktop voucher is not a cloud ledger request.
    await expect(adapter.vouchers.create({ date: '2026-11-01', type: 'IN', grossAmount: 12.5 })).rejects.toThrow()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('uses member envelopes and distinct create/update DTOs without renaming responses', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ members: [member] }))
      .mockResolvedValueOnce(jsonResponse(member))
      .mockResolvedValueOnce(jsonResponse(member, 201))
      .mockResolvedValueOnce(jsonResponse({ ...member, first_name: 'Eva' }))
      .mockResolvedValueOnce(jsonResponse({ success: true }))
    const adapter = new CloudAdapter('https://api.example.org')
    expect(await adapter.members.list({ search: 'Erika', active: false })).toEqual({ members: [member] })
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.example.org/api/members?search=Erika&active=false')
    expect(await adapter.members.get({ id: 4 })).toEqual(member)
    expect(await adapter.members.create({ firstName: 'Erika', lastName: 'Mustermann' })).toEqual(member)
    expect(JSON.parse(String(fetchMock.mock.calls[2][1]?.body))).toEqual({
      firstName: 'Erika', lastName: 'Mustermann', isActive: true
    })
    expect(await adapter.members.update({ id: 4, firstName: 'Eva' })).toEqual({ ...member, first_name: 'Eva' })
    expect(fetchMock.mock.calls[3][1]?.method).toBe('PATCH')
    expect(JSON.parse(String(fetchMock.mock.calls[3][1]?.body))).toEqual({ firstName: 'Eva' })
    expect(await adapter.members.delete({ id: 4 })).toEqual({ success: true })
  })

  it.each([
    { rows: [], total: 0 },
    { ...voucherList, vouchers: [{ ...voucherFields, file_count: 'invalid' }] },
    { ...voucherList, total: '1' }
  ])('rejects an incompatible successful voucher response: %j', async response => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(response))
    await expect(new CloudAdapter('https://api.example.org').vouchers.list()).rejects.toThrow()
  })

  it('does not store a token from an invalid auth response', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ token: 'bad-token', user: { id: 1 } }))
    await expect(new CloudAdapter('https://api.example.org').login('test@example.org', 'secret1')).rejects.toThrow()
    expect(storage.has('cloud_token')).toBe(false)
  })

  it('does not advertise or expose nonexistent routes', () => {
    const adapter = new CloudAdapter('https://api.example.org')
    expect(adapter.capabilities).toEqual({
      auth: ['login', 'register', 'me'], vouchers: ['list', 'get', 'create', 'delete'],
      members: ['list', 'get', 'create', 'update', 'delete']
    })
    // @ts-expect-error The backend has no voucher PATCH route.
    expect(adapter.vouchers.update).toBeUndefined()
    // @ts-expect-error The backend has no voucher reverse route.
    expect(adapter.vouchers.reverse).toBeUndefined()
    // @ts-expect-error The backend has no member payment routes.
    expect(adapter.members.payments).toBeUndefined()
    for (const name of ['attachments', 'bindings', 'budgets', 'tags', 'settings', 'reports', 'yearEnd', 'backup']) {
      expect(adapter).not.toHaveProperty(name)
    }
  })
})
