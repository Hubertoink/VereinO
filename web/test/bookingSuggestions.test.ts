import test from 'node:test'
import assert from 'node:assert/strict'
import { webBookingSuggestions } from '../src/bookingSuggestions'
import type { BookingAISuggestion } from '../../src/renderer/utils/bookingAiPatterns'
test('web suggestions exclude unavailable kinds and fields and stale assignment IDs', () => {
 const base = { key: 'example', title: 'Example', reason: 'Test' }
 const suggestions: BookingAISuggestion[] = [
  {...base, type: 'TRANSFER', transferFromAccountId: 1, transferToAccountId: 2},
  {...base, tags: ['Training']},
  {...base, sphere: 'WGB'},
  {...base, type: 'OUT', tags: ['Training'], sphere: 'IDEELL', paymentAccountId: 9, budgets: [{ id: 3, amount: 10, amountMode: 'FIXED' }, { id: 4, amount: 10, amountMode: 'FIXED' }]}
 ]
 const general = webBookingSuggestions(suggestions, true, true, [3], [])
 assert.equal(general.length, 2)
 assert.deepEqual(general[0].tags, ['Training'])
 assert.equal(general[1].type, 'OUT')
 assert.deepEqual(general[1].tags, ['Training'])
 assert.equal(general[1].sphere, undefined)
 assert.equal(general[1].paymentAccountId, undefined)
 assert.deepEqual(general[1].budgets?.map(item => item.id), [3])
 assert.deepEqual(webBookingSuggestions(suggestions, true, false, [3], [1])[0].budgets, [])
 assert.equal(webBookingSuggestions(suggestions, false, false, [], [])[1].sphere, 'WGB')
 assert.equal(suggestions[3].tags?.[0], 'Training', 'source suggestions are not mutated')
})
