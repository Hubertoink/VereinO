import { expandVoucherTypeConstraint } from '../../electron/main/db/migrations'

describe('expandVoucherTypeConstraint', () => {
  it('updates the vouchers table SQL to support INTERNAL voucher types', () => {
    const sql = "CREATE TABLE vouchers (id INTEGER PRIMARY KEY, type TEXT CHECK(type IN ('IN','OUT','TRANSFER')) NOT NULL);"

    const nextSql = expandVoucherTypeConstraint(sql)

    expect(nextSql).toContain("'INTERNAL'")
    expect(nextSql).toContain("CHECK(type IN ('IN','OUT','TRANSFER','INTERNAL'))")
  })
})
