import { CloudAdapter } from '../renderer/services/adapter/CloudAdapter'
import { LocalAdapter } from '../renderer/services/adapter/LocalAdapter'

describe('data adapters', () => {
    afterEach(() => {
        jest.restoreAllMocks()
    })

    it('maps local year and page filters to the IPC voucher query', async () => {
        const list = jest.fn().mockResolvedValue({ rows: [], total: 0 })
        Object.defineProperty(globalThis, 'window', {
            configurable: true,
            value: { api: { vouchers: { list } } }
        })

        const adapter = new LocalAdapter()
        await adapter.vouchers.list({ year: 2025, page: 3, limit: 25 })

        expect(list).toHaveBeenCalledWith({
            limit: 25,
            offset: 50,
            from: '2025-01-01',
            to: '2025-12-31'
        })
    })

    it('stores the cloud login token and sends it on authenticated requests', async () => {
        const storage = new Map<string, string>()
        Object.defineProperty(globalThis, 'localStorage', {
            configurable: true,
            value: {
                getItem: (key: string) => storage.get(key) ?? null,
                setItem: (key: string, value: string) => storage.set(key, value),
                removeItem: (key: string) => storage.delete(key)
            }
        })
        const fetchMock = jest.spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(new Response(JSON.stringify({
                token: 'test-token',
                user: {
                    id: 1,
                    email: 'test@example.org',
                    organizationId: 2,
                    organizationName: 'Testverein'
                }
            }), { status: 200 }))
            .mockResolvedValueOnce(new Response(JSON.stringify({ years: [2025] }), { status: 200 }))

        const adapter = new CloudAdapter('https://api.example.org/')
        const login = await adapter.login('test@example.org', 'secret1')
        await adapter.vouchers.list({})

        expect(login.token).toBe('test-token')
        expect(storage.get('cloud_token')).toBe('test-token')
        const request = fetchMock.mock.calls[1][1]
        expect(new Headers(request?.headers).get('Authorization')).toBe('Bearer test-token')
    })

    it('clears cloud authentication after an unauthorized response', async () => {
        const removeItem = jest.fn()
        Object.defineProperty(globalThis, 'localStorage', {
            configurable: true,
            value: {
                getItem: () => 'expired-token',
                setItem: jest.fn(),
                removeItem
            }
        })
        jest.spyOn(globalThis, 'fetch').mockResolvedValue(
            new Response(JSON.stringify({ error: 'Expired' }), { status: 401 })
        )

        const adapter = new CloudAdapter('https://api.example.org')

        await expect(adapter.vouchers.list({})).rejects.toThrow('Unauthorized')
        expect(removeItem).toHaveBeenCalledWith('cloud_token')
    })
})
