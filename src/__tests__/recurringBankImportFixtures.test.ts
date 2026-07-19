import fs from 'node:fs'
import path from 'node:path'
import { parseCamtStatement } from '../../electron/main/services/bankStatementParser'

describe('recurring booking CAMT fixtures', () => {
  it('parses the Bank fixture with the expected subscriptions', () => {
    const xml = fs.readFileSync(path.resolve('test-data/bankimport/dauerbuchungen-bank-camt053.xml'), 'utf8')
    const parsed = parseCamtStatement(xml)

    expect(parsed.accountIbans).toEqual(['DE02120300000000202608'])
    expect(parsed.rows).toHaveLength(3)
    expect(parsed.rows).toMatchObject([
      { bookingDate: '2026-07-20', direction: 'OUT', amount: 20, counterparty: 'Mannheimer Morgen', errors: [] },
      { bookingDate: '2026-07-20', direction: 'OUT', amount: 6, counterparty: 'Adobe Inc.', errors: [] },
      { bookingDate: '2026-07-20', direction: 'OUT', amount: 14, counterparty: 'Canva Pty Ltd.', errors: [] }
    ])
  })

  it('parses the Volksbank fixture with the expected subscriptions', () => {
    const xml = fs.readFileSync(path.resolve('test-data/bankimport/dauerbuchungen-volksbank-camt053.xml'), 'utf8')
    const parsed = parseCamtStatement(xml)

    expect(parsed.accountIbans).toEqual(['DE44500105175407324931'])
    expect(parsed.rows).toHaveLength(2)
    expect(parsed.rows).toMatchObject([
      { bookingDate: '2026-07-20', direction: 'OUT', amount: 10, counterparty: 'Adobe Inc.', errors: [] },
      { bookingDate: '2026-07-20', direction: 'OUT', amount: 25, counterparty: 'ALDI Services GmbH', errors: [] }
    ])
  })
})
