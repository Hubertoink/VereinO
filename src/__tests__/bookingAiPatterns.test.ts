import { buildAISuggestions, listBookingAIPatternRows, rememberBookingAIPattern } from '../renderer/utils/bookingAiPatterns'

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

describe('booking AI learning threshold', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: new MemoryStorage() })
  })

  it('does not use or list a learned pattern after one occurrence', () => {
    const learning = { 'text:snacks': { accepted: 1, tags: ['Snacks'] } }

    expect(buildAISuggestions(suggestionInput(learning))).toHaveLength(0)
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: { getItem: () => JSON.stringify(learning) },
    })
    expect(listBookingAIPatternRows().some((row) => row.key === 'text:snacks')).toBe(false)
  })

  it('uses and lists a learned pattern from the second occurrence', () => {
    const learning = { 'text:snacks': { accepted: 2, tags: ['Snacks'] } }

    expect(buildAISuggestions(suggestionInput(learning)).some((suggestion) => suggestion.key === 'text:snacks')).toBe(true)
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: { getItem: () => JSON.stringify(learning) },
    })
    expect(listBookingAIPatternRows().some((row) => row.key === 'text:snacks')).toBe(true)
  })

  it('counts saved bookings as occurrences', () => {
    rememberBookingAIPattern({ description: 'Snacks kaufen', grossAmount: 12, tags: ['Snacks'], type: 'OUT' })
    const first = JSON.parse(localStorage.getItem('booking.aiSuggestions.v1') || '{}')
    expect(first['text:snacks'].accepted).toBe(1)

    rememberBookingAIPattern({ description: 'Snacks kaufen', grossAmount: 12, tags: ['Snacks'], type: 'OUT' })
    const second = JSON.parse(localStorage.getItem('booking.aiSuggestions.v1') || '{}')
    expect(second['text:snacks'].accepted).toBe(2)
  })
})
