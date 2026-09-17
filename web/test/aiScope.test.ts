import test from 'node:test'
import assert from 'node:assert/strict'
import { setBookingAIPatternScope, rememberBookingAIPattern, readAISuggestionLearning, setBookingAIPatternsEnabled, isBookingAIPatternsEnabled } from '../../src/renderer/utils/bookingAiPatterns'

test('web learning and preferences stay isolated across users, organizations and desktop', () => {
  const data = new Map<string, string>()
  const previousStorage = globalThis.localStorage
  const previousWindow = globalThis.window
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value) } })
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { dispatchEvent: () => true } })
  try {
    setBookingAIPatternScope('web:1:1')
    rememberBookingAIPattern({ description: 'Trainingsmaterial kaufen', type: 'OUT', grossAmount: 20 })
    const learned = readAISuggestionLearning()
    assert(Object.keys(learned).length > 0)
    setBookingAIPatternsEnabled(false)
    for (const scope of ['web:1:2', 'web:2:1', '']) {
      setBookingAIPatternScope(scope)
      assert.deepEqual(readAISuggestionLearning(), {})
      assert.equal(isBookingAIPatternsEnabled(), true)
    }
    setBookingAIPatternScope('web:1:1')
    assert.deepEqual(readAISuggestionLearning(), learned)
    assert.equal(isBookingAIPatternsEnabled(), false)
  } finally {
    setBookingAIPatternScope('')
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: previousStorage })
    Object.defineProperty(globalThis, 'window', { configurable: true, value: previousWindow })
  }
})
