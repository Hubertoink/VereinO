import type Database from 'better-sqlite3'
type DB = InstanceType<typeof Database>

export interface Submission {
  id: number
  externalId?: string | null
  date: string
  type: 'IN' | 'OUT'
  sphere?: 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB' | null
  paymentMethod?: 'BAR' | 'BANK' | null
  description?: string | null
  grossAmount: number
  categoryHint?: string | null
  counterparty?: string | null
  submittedBy: string
  submittedAt: string
  status: 'pending' | 'approved' | 'rejected'
  reviewedAt?: string | null
  reviewerNotes?: string | null
  voucherId?: number | null
}

export interface SubmissionAttachment {
  id: number
  submissionId: number
  filename: string
  mimeType?: string | null
  data: Buffer
  createdAt: string
}

export interface SubmissionWithAttachments extends Submission {
  attachments: Array<{ id: number; filename: string; mimeType?: string | null }>
}

export interface CreateSubmissionPayload {
  externalId?: string
  date: string
  type: 'IN' | 'OUT'
  sphere?: 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'
  paymentMethod?: 'BAR' | 'BANK'
  description?: string
  grossAmount: number
  categoryHint?: string
  counterparty?: string
  submittedBy: string
  attachments?: Array<{ filename: string; mimeType?: string; data: Buffer }>
}

export interface ImportSubmissionPayload {
  submissions: Array<{
    externalId?: string
    date: string
    type?: 'IN' | 'OUT'
    sphere?: 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'
    paymentMethod?: 'BAR' | 'BANK'
    description?: string
    grossAmount: number
    categoryHint?: string
    counterparty?: string
    submittedBy: string
    attachments?: Array<{ filename: string; mimeType?: string; data: string }>
  }>
}

export function createSubmissionsRepository(db: DB) {
  return {
    list(params?: { status?: 'pending' | 'approved' | 'rejected'; limit?: number; offset?: number }): { rows: SubmissionWithAttachments[]; total: number } {
      const status = params?.status
      const limit = params?.limit ?? 100
      const offset = params?.offset ?? 0
      
      let sql = `
        SELECT 
          s.id, s.external_id as externalId, s.date, s.type, 
          s.sphere, s.payment_method as paymentMethod,
          s.description,
          s.gross_amount as grossAmount, s.category_hint as categoryHint,
          s.counterparty, s.submitted_by as submittedBy, s.submitted_at as submittedAt,
          s.status, s.reviewed_at as reviewedAt, s.reviewer_notes as reviewerNotes,
          s.voucher_id as voucherId
        FROM submissions s
      `
      const conditions: string[] = []
      const values: (string | number)[] = []

      if (status) {
        conditions.push('s.status = ?')
        values.push(status)
      }

      if (conditions.length > 0) {
        sql += ' WHERE ' + conditions.join(' AND ')
      }

      sql += ' ORDER BY s.submitted_at DESC LIMIT ? OFFSET ?'
      values.push(limit, offset)

      const rows = db.prepare(sql).all(...values) as Submission[]

      let countSql = 'SELECT COUNT(*) as total FROM submissions s'
      if (conditions.length > 0) {
        countSql += ' WHERE ' + conditions.join(' AND ')
      }
      const countValues = status ? [status] : []
      const countRow = db.prepare(countSql).get(...countValues) as { total: number }

      const result: SubmissionWithAttachments[] = rows.map(row => {
        const attachments = db.prepare(`
          SELECT id, filename, mime_type as mimeType
          FROM submission_attachments
          WHERE submission_id = ?
        `).all(row.id) as Array<{ id: number; filename: string; mimeType?: string | null }>
        
        return { ...row, attachments }
      })

      return { rows: result, total: countRow.total }
    },

    get(id: number): SubmissionWithAttachments | null {
      const row = db.prepare(`
        SELECT 
          id, external_id as externalId, date, type, description,
          gross_amount as grossAmount, category_hint as categoryHint,
          sphere, payment_method as paymentMethod,
          counterparty, submitted_by as submittedBy, submitted_at as submittedAt,
          status, reviewed_at as reviewedAt, reviewer_notes as reviewerNotes,
          voucher_id as voucherId
        FROM submissions
        WHERE id = ?
      `).get(id) as Submission | undefined

      if (!row) return null

      const attachments = db.prepare(`
        SELECT id, filename, mime_type as mimeType
        FROM submission_attachments
        WHERE submission_id = ?
      `).all(id) as Array<{ id: number; filename: string; mimeType?: string | null }>

      return { ...row, attachments }
    },

    create(payload: CreateSubmissionPayload): { id: number } {
      const insertSubmission = db.prepare(`
        INSERT INTO submissions (external_id, date, type, sphere, payment_method, description, gross_amount, category_hint, counterparty, submitted_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)

      const insertAttachment = db.prepare(`
        INSERT INTO submission_attachments (submission_id, filename, mime_type, data)
        VALUES (?, ?, ?, ?)
      `)

      const result = db.transaction(() => {
        const res = insertSubmission.run(
          payload.externalId || null,
          payload.date,
          payload.type,
          payload.sphere || null,
          payload.paymentMethod || null,
          payload.description || null,
          payload.grossAmount,
          payload.categoryHint || null,
          payload.counterparty || null,
          payload.submittedBy
        )
        const submissionId = res.lastInsertRowid as number

        if (payload.attachments?.length) {
          for (const att of payload.attachments) {
            insertAttachment.run(submissionId, att.filename, att.mimeType || null, att.data)
          }
        }

        return { id: submissionId }
      })()

      return result
    },

    import(payload: ImportSubmissionPayload): { imported: number; ids: number[] } {
      const insertSubmission = db.prepare(`
        INSERT INTO submissions (external_id, date, type, sphere, payment_method, description, gross_amount, category_hint, counterparty, submitted_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)

      const insertAttachment = db.prepare(`
        INSERT INTO submission_attachments (submission_id, filename, mime_type, data)
        VALUES (?, ?, ?, ?)
      `)

      const ids: number[] = []

      const result = db.transaction(() => {
        for (const sub of payload.submissions) {
          const res = insertSubmission.run(
            sub.externalId || null,
            sub.date,
            sub.type || 'OUT',
            sub.sphere || null,
            sub.paymentMethod || null,
            sub.description || null,
            sub.grossAmount,
            sub.categoryHint || null,
            sub.counterparty || null,
            sub.submittedBy
          )
          const submissionId = res.lastInsertRowid as number
          ids.push(submissionId)

          if (sub.attachments?.length) {
            for (const att of sub.attachments) {
              const data = Buffer.from(att.data, 'base64')
              insertAttachment.run(submissionId, att.filename, att.mimeType || null, data)
            }
          }
        }

        return { imported: ids.length, ids }
      })()

      return result
    },

    approve(id: number, payload: { reviewerNotes?: string }): { ok: boolean } {
      const result = db.prepare(`
        UPDATE submissions
        SET status = 'approved', reviewed_at = datetime('now'), reviewer_notes = ?
        WHERE id = ? AND status = 'pending'
      `).run(payload.reviewerNotes || null, id)

      return { ok: result.changes > 0 }
    },

    reject(id: number, payload: { reviewerNotes?: string }): { ok: boolean } {
      const result = db.prepare(`
        UPDATE submissions
        SET status = 'rejected', reviewed_at = datetime('now'), reviewer_notes = ?
        WHERE id = ? AND status = 'pending'
      `).run(payload.reviewerNotes || null, id)

      return { ok: result.changes > 0 }
    },

    linkToVoucher(id: number, voucherId: number): { ok: boolean } {
      const result = db.prepare(`
        UPDATE submissions
        SET voucher_id = ?
        WHERE id = ?
      `).run(voucherId, id)

      return { ok: result.changes > 0 }
    },

    delete(id: number): { ok: boolean } {
      const result = db.prepare('DELETE FROM submissions WHERE id = ?').run(id)
      return { ok: result.changes > 0 }
    },

    getAttachment(attachmentId: number): SubmissionAttachment | null {
      const row = db.prepare(`
        SELECT id, submission_id as submissionId, filename, mime_type as mimeType, data, created_at as createdAt
        FROM submission_attachments
        WHERE id = ?
      `).get(attachmentId) as SubmissionAttachment | undefined

      return row || null
    },

    summary(): { pending: number; approved: number; rejected: number; total: number } {
      const row = db.prepare(`
        SELECT 
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
          SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved,
          SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected,
          COUNT(*) as total
        FROM submissions
      `).get() as { pending: number; approved: number; rejected: number; total: number }

      return row
    }
  }
}
