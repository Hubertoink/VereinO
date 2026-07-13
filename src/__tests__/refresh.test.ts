import { addDataChangedListener, dispatchDataChanged, notifyDataChanged } from '../renderer/utils/refresh'

describe('notifyDataChanged', () => {
  it('uses the bridge when available', () => {
    const bridge = jest.fn()
    const fallback = jest.fn()

    const result = notifyDataChanged({ app: { notifyDataChanged: bridge } } as any, fallback)

    expect(result).toBe(true)
    expect(bridge).toHaveBeenCalledTimes(1)
    expect(fallback).not.toHaveBeenCalled()
  })

  it('falls back to the local event when no bridge exists', () => {
    const fallback = jest.fn()

    const result = notifyDataChanged(null, fallback)

    expect(result).toBe(true)
    expect(fallback).toHaveBeenCalledTimes(1)
  })

  it('passes targeted scopes through the bridge', () => {
    const bridge = jest.fn()

    notifyDataChanged({ app: { notifyDataChanged: bridge } }, undefined, ['members'])

    expect(bridge).toHaveBeenCalledWith(['members'])
  })

  it('notifies only matching scoped listeners and coalesces related scopes', async () => {
    const originalWindow = (globalThis as any).window
    const eventTarget = new EventTarget()
    Object.defineProperty(globalThis, 'window', { configurable: true, value: eventTarget })
    const vouchers = jest.fn()
    const members = jest.fn()
    const removeVouchers = addDataChangedListener(['vouchers', 'budgets'], vouchers)
    const removeMembers = addDataChangedListener(['members'], members)

    dispatchDataChanged(['vouchers', 'budgets'])
    await Promise.resolve()

    expect(vouchers).toHaveBeenCalledTimes(1)
    expect(members).not.toHaveBeenCalled()
    removeVouchers()
    removeMembers()
    Object.defineProperty(globalThis, 'window', { configurable: true, value: originalWindow })
  })
})
