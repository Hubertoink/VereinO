import { resolveOrganizationBookingView } from '../renderer/context/organizationBookingView'

function storage(legacy = 'plus') {
  const values = new Map<string, string>([['ui.bookingView', legacy]])
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) } }
}

describe('organization booking view', () => {
  it('migrates the global choice only to the first organization, including repeated initialization', () => {
    const preferences = storage()
    expect(resolveOrganizationBookingView('a', null, preferences)).toBe('plus')
    expect(resolveOrganizationBookingView('a', null, preferences)).toBe('plus')
    expect(resolveOrganizationBookingView('b', null, preferences)).toBe('classic')
  })
  it('restores distinct saved choices when switching back and forth', () => {
    const preferences = storage()
    expect(resolveOrganizationBookingView('a', 'classic', preferences)).toBe('classic')
    expect(resolveOrganizationBookingView('b', 'plus', preferences)).toBe('plus')
    expect(resolveOrganizationBookingView('a', 'classic', preferences)).toBe('classic')
  })
  it('defaults to classic if legacy storage is unavailable', () => {
    expect(resolveOrganizationBookingView('a', null, { getItem() { throw Error('unavailable') }, setItem() {} })).toBe('classic')
  })
})
