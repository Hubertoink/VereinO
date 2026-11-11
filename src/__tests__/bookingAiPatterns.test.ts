import {
  buildAISuggestions,
  deleteBookingAIPattern,
  initializeBookingAIPatterns,
  isBookingAIPatternsEnabled,
  listBookingAIPatternRows,
  readAISuggestionLearning,
  rememberBookingAIPattern,
  setBookingAIPatternEnabled,
  setBookingAIPatternsEnabled,
} from '../renderer/utils/bookingAiPatterns'

class MemoryStorage {
  private values = new Map<string, string>()

  getItem(key: string) {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string) {
    this.values.set(key, value)
  }

  removeItem(key: string) {
    this.values.delete(key)
  }
}

function suggestionInput(learning: Record<string, { accepted: number; tags?: string[] }>) {
  return {
    description: 'Snacks kaufen',
    grossAmount: 12,
    currentTags: [],
    currentType: 'OUT' as const,
    currentSphere: 'IDEELL' as const,
    currentBudgets: [],
    currentEarmarks: [],
    tagDefs: [],
    learning,
  }
}

let activeId: string | null
let onSwitched: () => void
let active: jest.Mock

beforeEach(async () => {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: new MemoryStorage() })
    activeId = 'org-a'
    active = jest.fn(async () => ({ organization: activeId ? { id: activeId } : null }))
    Object.defineProperty(globalThis, 'window', { configurable: true, value: {
      dispatchEvent: jest.fn(),
      api: { organizations: {
        active,
        onSwitched: (callback: () => void) => { onSwitched = callback; return () => {} },
      } },
    } })
    await initializeBookingAIPatterns()
})

describe('booking AI learning threshold', () => {

  it('does not use or list a learned pattern after one occurrence', () => {
    const learning = { 'text:snacks': { accepted: 1, tags: ['Snacks'] } }

    expect(buildAISuggestions(suggestionInput(learning))).toHaveLength(0)
    localStorage.setItem('booking.aiSuggestions.v1.org.org-a', JSON.stringify(learning))
    expect(listBookingAIPatternRows().some((row) => row.key === 'text:snacks')).toBe(false)
  })

  it('uses and lists a learned pattern from the second occurrence', () => {
    const learning = { 'text:snacks': { accepted: 2, tags: ['Snacks'] } }

    expect(buildAISuggestions(suggestionInput(learning)).some((suggestion) => suggestion.key === 'text:snacks')).toBe(true)
    localStorage.setItem('booking.aiSuggestions.v1.org.org-a', JSON.stringify(learning))
    expect(listBookingAIPatternRows().some((row) => row.key === 'text:snacks')).toBe(true)
  })

  it('counts saved bookings as occurrences', () => {
    rememberBookingAIPattern({ description: 'Snacks kaufen', grossAmount: 12, tags: ['Snacks'], type: 'OUT' })
    const first = readAISuggestionLearning()
    expect(first['text:snacks'].accepted).toBe(1)

    rememberBookingAIPattern({ description: 'Snacks kaufen', grossAmount: 12, tags: ['Snacks'], type: 'OUT' })
    const second = readAISuggestionLearning()
    expect(second['text:snacks'].accepted).toBe(2)
  })
})

describe('organization-specific booking AI patterns', () => {
  function learn(tags = ['Verein A']) {
    rememberBookingAIPattern({
      description: 'Snacks kaufen', grossAmount: 12, tags, type: 'OUT',
      paymentAccountId: 3, budgets: [{ budgetId: 1, amount: 12 }],
      earmarks: [{ earmarkId: 1, amount: 12 }],
    })
  }

  async function openOrganization(id: string | null) {
    onSwitched()
    activeId = id
    // Reinitialization represents the fresh renderer after the full reload.
    await initializeBookingAIPatterns()
  }

  it('separates learning and suggestions even with identical account and budget IDs', async () => {
    learn()
    learn()
    const a = readAISuggestionLearning()
    await openOrganization('org-b')
    expect(readAISuggestionLearning()).toEqual({})
    expect(listBookingAIPatternRows().filter(row => row.kind === 'learned')).toEqual([])
    expect(buildAISuggestions(suggestionInput(readAISuggestionLearning()))).toEqual([])
    learn(['Verein B'])
    expect(readAISuggestionLearning()['text:snacks'].accepted).toBe(1)
    learn(['Verein B'])
    expect(buildAISuggestions(suggestionInput(readAISuggestionLearning()))[0].tags).toEqual(['Verein B'])
    await openOrganization('org-a')
    expect(readAISuggestionLearning()).toEqual(a)
    expect(buildAISuggestions(suggestionInput(readAISuggestionLearning()))[0].tags).toEqual(['Verein A'])
  })

  it('keeps master switch, rule settings and usage counters separate', async () => {
    localStorage.setItem('booking.aiSuggestions.v1.org.org-a', JSON.stringify({ 'rule:spende': { accepted: 4 } }))
    setBookingAIPatternEnabled('rule:spende', false)
    setBookingAIPatternsEnabled(false)
    await openOrganization('org-b')
    expect(isBookingAIPatternsEnabled()).toBe(true)
    expect(listBookingAIPatternRows().find(row => row.key === 'rule:spende')).toMatchObject({ accepted: 0, enabled: true })
    await openOrganization('org-a')
    expect(isBookingAIPatternsEnabled()).toBe(false)
    expect(listBookingAIPatternRows().find(row => row.key === 'rule:spende')).toMatchObject({ accepted: 4, enabled: false })
  })

  it('only disables or deletes a learned pattern in its own organization', async () => {
    learn()
    learn()
    await openOrganization('org-b')
    learn(['Verein B'])
    learn(['Verein B'])
    setBookingAIPatternEnabled('text:snacks', false)
    expect(readAISuggestionLearning()['text:snacks'].disabled).toBe(true)
    deleteBookingAIPattern('text:snacks')
    expect(readAISuggestionLearning()['text:snacks']).toBeUndefined()
    await openOrganization('org-a')
    expect(readAISuggestionLearning()['text:snacks']).toMatchObject({ accepted: 2, tags: ['Verein A'] })
    expect(listBookingAIPatternRows().find(row => row.key === 'text:snacks')?.enabled).toBe(true)
  })

  it('preserves ambiguous legacy data without using or assigning it to any organization', async () => {
    const legacy = JSON.stringify({ 'text:snacks': { accepted: 7, paymentAccountId: 3 } })
    localStorage.setItem('booking.aiSuggestions.v1', legacy)
    localStorage.setItem('booking.aiSuggestions.enabled', 'false')
    for (const id of ['org-a', 'org-b', 'default']) {
      await openOrganization(id)
      expect(readAISuggestionLearning()).toEqual({})
      expect(isBookingAIPatternsEnabled()).toBe(true)
      learn()
      expect(readAISuggestionLearning()['text:snacks'].accepted).toBe(1)
    }
    expect(localStorage.getItem('booking.aiSuggestions.v1')).toBe(legacy)
    expect(localStorage.getItem('booking.aiSuggestions.enabled')).toBe('false')
  })

  it('blocks stale suggestions and writes immediately on a switch, before reload', async () => {
    learn()
    learn()
    const cached = readAISuggestionLearning()
    onSwitched()
    expect(readAISuggestionLearning()).toEqual({})
    expect(buildAISuggestions(suggestionInput(cached))).toEqual([])
    learn(['Stale draft'])
    setBookingAIPatternsEnabled(false)
    setBookingAIPatternEnabled('rule:spende', false)
    deleteBookingAIPattern('text:snacks')
    await initializeBookingAIPatterns()
    expect(isBookingAIPatternsEnabled()).toBe(true)
    expect(readAISuggestionLearning()).toEqual(cached)
  })

  it('does not use a default/global scope when the active organization cannot be loaded', async () => {
    active.mockRejectedValueOnce(new Error('IPC failed'))
    await initializeBookingAIPatterns()
    learn()
    setBookingAIPatternsEnabled(true)
    expect(isBookingAIPatternsEnabled()).toBe(false)
    expect(readAISuggestionLearning()).toEqual({})
    expect(localStorage.getItem('booking.aiSuggestions.v1.org.org-a')).toBeNull()
    await openOrganization(null)
    expect(isBookingAIPatternsEnabled()).toBe(false)
  })

  it('does not restore an outdated organization from a pending startup request', async () => {
    let resolve!: (value: { organization: { id: string } }) => void
    active.mockReturnValueOnce(new Promise(done => { resolve = done }))
    const pending = initializeBookingAIPatterns()
    expect(isBookingAIPatternsEnabled()).toBe(false)
    learn()
    onSwitched()
    resolve({ organization: { id: 'org-a' } })
    await pending
    expect(isBookingAIPatternsEnabled()).toBe(false)
    expect(readAISuggestionLearning()).toEqual({})
    expect(localStorage.getItem('booking.aiSuggestions.v1.org.org-a')).toBeNull()
  })
})
