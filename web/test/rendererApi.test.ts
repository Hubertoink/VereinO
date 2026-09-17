import test from 'node:test'
import assert from 'node:assert/strict'
import {
  toVoucherRow,
  listBookings,
  filteredBookings,
  summarizeBookings,
  createRendererReadApi
} from '../src/rendererApi'
import type { Entry } from '../src/api'

const entries: Entry[] = [
  {
    id: 1,
    version: 4,
    number: '2026-000001',
    date: '2026-06-04',
    type: 'IN',
    description: 'Mitgliedsbeitrag',
    grossAmountCents: 10001,
    sphere: 'IDEELL',
    paymentMethod: 'BANK',
    counterparty: 'Anna'
  },
  {
    id: 2,
    version: 1,
    number: '2026-000002',
    date: '2026-06-05',
    type: 'OUT',
    description: 'Trainingsmaterial',
    grossAmountCents: 2345,
    sphere: 'ZWECK',
    paymentMethod: 'CASH'
  },
  {
    id: 3,
    version: 2,
    number: '2026-000003',
    date: '2026-09-15',
    type: 'IN',
    description: 'Spende',
    grossAmountCents: 5000,
    sphere: 'IDEELL',
    paymentMethod: 'BANK'
  }
]
test('maps gross cents, cash method, references and exact edit version into original renderer rows', () => {
  const row = toVoucherRow(entries[1])
  assert.equal(row.grossAmount, 23.45)
  assert.equal(row.paymentMethod, 'BAR')
  assert.equal(row.paymentAccountName, 'Kasse')
  assert.equal(row.webEntry.version, 1)
  assert.equal(row.voucherNo, entries[1].number)
  assert.equal(row.fileCount, 0)
})
test('original journal filtering, sorting and pagination operate on server bookings', () => {
  assert.deepEqual(
    listBookings(entries, { limit: 1, offset: 1 }).rows.map((r) => r.id),
    [2]
  )
  assert.equal(listBookings(entries, { limit: 1, offset: 1 }).total, 3)
  assert.deepEqual(
    listBookings(entries, { sortBy: 'gross', sort: 'ASC' }).rows.map((r) => r.id),
    [2, 3, 1]
  )
  assert.deepEqual(
    filteredBookings(entries, { paymentAccountId: 2 }).map((r) => r.id),
    [2]
  )
  assert.deepEqual(
    filteredBookings(entries, { from: '2026-06-01', to: '2026-06-30', type: 'IN' }).map(
      (r) => r.id
    ),
    [1]
  )
  assert.deepEqual(
    filteredBookings(entries, { q: 'Juni 2026' }).map((r) => r.id),
    [1, 2]
  )
  assert.deepEqual(
    filteredBookings(entries, { q: '#2' }).map((r) => r.id),
    [2]
  )
  assert.deepEqual(
    filteredBookings(entries, { q: 'Anna' }).map((r) => r.id),
    [1]
  )
  assert.deepEqual(
    filteredBookings(entries, { voucherIds: [3] }).map((r) => r.id),
    [3]
  )
  assert.equal(filteredBookings(entries, { tag: 'nicht gespeichert' }).length, 0)
  assert.equal(entries[0].id, 1, 'sorting must not mutate the API result')
})
test('summaries use the same filters, whole cents and the desktop unsigned summary contract', () => {
  const result = summarizeBookings(entries, { from: '2026-06-01', to: '2026-06-30' })
  assert.equal(result.totals.gross, 123.46)
  assert.equal(result.byType.find((r) => r.key === 'IN')?.gross, 100.01)
  assert.equal(result.byType.find((r) => r.key === 'OUT')?.gross, 23.45)
  assert.equal(summarizeBookings(entries, { q: 'Anna' }).totals.gross, 100.01)
})
test('list and summary share pending reads; next refresh is fresh; bridge offers no dummy writes', async () => {
  const originalFetch = globalThis.fetch
  let calls = 0
  globalThis.fetch = async () => {
    calls++
    return new Response(JSON.stringify({ bookings: entries }), {
      headers: { 'Content-Type': 'application/json' }
    })
  }
  try {
    const { bridge } = createRendererReadApi(() => assert.fail('unexpected session expiry'))
    await Promise.all([bridge.vouchers.list(), bridge.reports.summary({})])
    assert.equal(calls, 1)
    await bridge.vouchers.list()
    assert.equal(calls, 2)
    assert.equal('create' in bridge.vouchers, false)
  } finally {
    globalThis.fetch = originalFetch
  }
})
test('expired sessions propagate instead of returning empty lists', async () => {
  const originalFetch = globalThis.fetch
  let expired = 0
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ error: 'Bitte anmelden.' }), { status: 401 })
  try {
    const adapter = createRendererReadApi(() => expired++)
    await assert.rejects(adapter.bridge.vouchers.list(), /Bitte anmelden/)
    assert.equal(expired, 1)
    adapter.dispose()
    await assert.rejects(adapter.bridge.vouchers.list())
    assert.equal(expired, 1, 'unmounted session must not log out a subsequent user')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('general categories survive mapping, search, filtering and summary aggregation', () => {
  const rows = entries.map((row, index) => ({ ...row,
    primaryClassificationValueId: index < 2 ? 17 : null,
    primaryClassificationName: index < 2 ? 'Haushalt' : null,
    primaryClassificationColor: index < 2 ? '#123456' : null
  }))
  assert.equal(toVoucherRow(rows[0]).primaryClassificationName, 'Haushalt')
  assert.deepEqual(filteredBookings(rows, { primaryClassificationValueId: 17 }).map(row => row.id), [1, 2])
  assert.deepEqual(filteredBookings(rows, { q: 'Haushalt Juni' }).map(row => row.id), [1, 2])
  const summary = summarizeBookings(rows, {}, 'GENERAL')
  assert.equal(summary.classificationProfile, 'GENERAL')
  assert.equal(summary.primaryClassificationLabel, 'Kategorie')
  assert.deepEqual(summary.byPrimaryClassification, [
    { key: 'Haushalt', color: '#123456', net: 123.46, gross: 123.46, vat: 0 },
    { key: 'Ohne Kategorie', color: null, net: 50, gross: 50, vat: 0 }
  ])
  assert.equal(summarizeBookings(rows).classificationProfile, 'NONPROFIT')
})

test('booking tags reach shared rows, filters and text search',()=>{
 const tagged={...entries[0],tags:['Sommerfest','Training']}
 assert.deepEqual(toVoucherRow(tagged).tags,['Sommerfest','Training'])
 assert.deepEqual(filteredBookings([tagged,entries[1]],{tag:'Training'}),[tagged])
 assert.deepEqual(filteredBookings([tagged,entries[1]],{q:'sommerfest'}),[tagged])
 assert.equal(filteredBookings([tagged],{tag:'Fremd'}).length,0)
})
