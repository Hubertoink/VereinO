import { getDb } from '../db/database'

export type PartyRole = 'SUPPLIER' | 'CUSTOMER' | 'BOTH' | 'OTHER'

export type PartyUpsertInput = {
  id?: number
  name: string
  legalName?: string | null
  role: PartyRole
  contactName?: string | null
  email?: string | null
  phone?: string | null
  street?: string | null
  postalCode?: string | null
  city?: string | null
  country?: string | null
  iban?: string | null
  bic?: string | null
  taxNumber?: string | null
  vatId?: string | null
  paymentTermDays?: number | null
  note?: string | null
  isActive?: boolean
}

const nullableText = (value: unknown) => {
  const text = String(value ?? '').trim()
  return text || null
}

const normalizeIban = (value: unknown) => {
  const iban = String(value ?? '').replace(/\s+/g, '').toUpperCase()
  return iban || null
}

const partySelect = `
  SELECT
    p.id,
    p.name,
    p.legal_name as legalName,
    p.role,
    p.contact_name as contactName,
    p.email,
    p.phone,
    p.street,
    p.postal_code as postalCode,
    p.city,
    p.country,
    p.iban,
    p.bic,
    p.tax_number as taxNumber,
    p.vat_id as vatId,
    p.payment_term_days as paymentTermDays,
    p.note,
    p.is_active as isActive,
    p.created_at as createdAt,
    p.updated_at as updatedAt,
    (SELECT COUNT(1) FROM vouchers v WHERE v.party_id = p.id) as voucherCount,
    (SELECT COUNT(1) FROM invoices i WHERE i.party_id = p.id) as invoiceCount,
    (SELECT COUNT(1) FROM submissions s WHERE s.party_id = p.id) as submissionCount,
    MAX(
      COALESCE((SELECT MAX(v.date) FROM vouchers v WHERE v.party_id = p.id), ''),
      COALESCE((SELECT MAX(i.date) FROM invoices i WHERE i.party_id = p.id), ''),
      COALESCE((SELECT MAX(s.date) FROM submissions s WHERE s.party_id = p.id), '')
    ) as lastUsedAt
  FROM parties p
`

export function listParties(input?: {
  q?: string
  activeOnly?: boolean
  role?: PartyRole
  limit?: number
}) {
  const d = getDb()
  const where: string[] = []
  const params: unknown[] = []
  if (input?.activeOnly) where.push('p.is_active = 1')
  if (input?.role) {
    where.push(input.role === 'SUPPLIER' || input.role === 'CUSTOMER' ? '(p.role = ? OR p.role = \'BOTH\')' : 'p.role = ?')
    params.push(input.role)
  }
  if (input?.q?.trim()) {
    const like = `%${input.q.trim()}%`
    where.push(`(
      p.name LIKE ? OR p.legal_name LIKE ? OR p.contact_name LIKE ? OR
      p.email LIKE ? OR p.city LIKE ? OR p.iban LIKE ? OR p.vat_id LIKE ?
    )`)
    params.push(like, like, like, like, like, like, like)
  }
  const limit = Math.min(500, Math.max(1, Number(input?.limit || 200)))
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
  return d.prepare(`
    ${partySelect}
    ${whereSql}
    ORDER BY p.is_active DESC, p.name COLLATE NOCASE ASC, p.id ASC
    LIMIT ?
  `).all(...params, limit)
}

export function getParty(id: number) {
  return getDb().prepare(`${partySelect} WHERE p.id = ?`).get(id)
}

export function upsertParty(input: PartyUpsertInput) {
  const d = getDb()
  const name = String(input.name || '').trim()
  if (!name) throw new Error('Der Name des Geschäftspartners ist erforderlich.')
  const paymentTermDays = input.paymentTermDays == null
    ? null
    : Math.max(0, Math.min(3650, Math.floor(Number(input.paymentTermDays))))
  const values = [
    name,
    nullableText(input.legalName),
    input.role,
    nullableText(input.contactName),
    nullableText(input.email),
    nullableText(input.phone),
    nullableText(input.street),
    nullableText(input.postalCode),
    nullableText(input.city),
    nullableText(input.country) || 'DE',
    normalizeIban(input.iban),
    nullableText(input.bic)?.toUpperCase() ?? null,
    nullableText(input.taxNumber),
    nullableText(input.vatId)?.toUpperCase() ?? null,
    paymentTermDays,
    nullableText(input.note),
    input.isActive === false ? 0 : 1
  ]

  if (input.id) {
    const result = d.prepare(`
      UPDATE parties SET
        name = ?, legal_name = ?, role = ?, contact_name = ?, email = ?, phone = ?,
        street = ?, postal_code = ?, city = ?, country = ?, iban = ?, bic = ?,
        tax_number = ?, vat_id = ?, payment_term_days = ?, note = ?, is_active = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(...values, input.id)
    if (!result.changes) throw new Error('Geschäftspartner wurde nicht gefunden.')
    return { id: input.id }
  }

  const result = d.prepare(`
    INSERT INTO parties(
      name, legal_name, role, contact_name, email, phone, street, postal_code, city,
      country, iban, bic, tax_number, vat_id, payment_term_days, note, is_active
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(...values)
  return { id: Number(result.lastInsertRowid) }
}

export function archiveParty(id: number, isActive: boolean) {
  const result = getDb().prepare(`
    UPDATE parties SET is_active = ?, updated_at = datetime('now') WHERE id = ?
  `).run(isActive ? 1 : 0, id)
  if (!result.changes) throw new Error('Geschäftspartner wurde nicht gefunden.')
  return { id, isActive: isActive ? 1 : 0 }
}
