import { notifyDataChanged } from '../renderer/utils/refresh'

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
})
