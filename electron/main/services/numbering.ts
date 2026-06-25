import type Database from 'better-sqlite3'
type DB = InstanceType<typeof Database>

export function nextVoucherSequence(db: DB, year: number, sphere: string, dateISO?: string): number {
    const sel = db.prepare(
        'SELECT last_seq_no as n FROM voucher_sequences WHERE year=? AND sphere=?'
    )
    const row = sel.get(year, sphere) as { n?: number } | undefined
    const sphereMax = db.prepare(
        'SELECT IFNULL(MAX(seq_no), 0) as n FROM vouchers WHERE year=? AND sphere=?'
    ).get(year, sphere) as { n?: number } | undefined
    const yearMax = db.prepare(
        'SELECT IFNULL(MAX(seq_no), 0) as n FROM vouchers WHERE year=?'
    ).get(year) as { n?: number } | undefined
    const dateMax = dateISO
        ? db.prepare('SELECT IFNULL(MAX(seq_no), 0) as n FROM vouchers WHERE year=? AND date=?').get(year, dateISO) as { n?: number } | undefined
        : undefined
    const next = Math.max(row?.n ?? 0, sphereMax?.n ?? 0, yearMax?.n ?? 0, dateMax?.n ?? 0) + 1
    const up = db.prepare(
        'INSERT INTO voucher_sequences(year, sphere, last_seq_no) VALUES(?,?,?) ON CONFLICT(year, sphere) DO UPDATE SET last_seq_no=excluded.last_seq_no'
    )
    up.run(year, sphere, next)
    return next
}

export function makeVoucherNo(year: number, dateISO: string, _sphere: string, seq: number) {
    // New format: YYYY-MM-DD_<SEQ> (padded). Example: 2025-09-24_00010
    const mm = (dateISO?.slice(5, 7) || '01')
    const dd = (dateISO?.slice(8, 10) || '01')
    return `${year}-${mm}-${dd}_${String(seq).padStart(5, '0')}`
}
