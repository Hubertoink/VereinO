import { getDb, withTransaction } from '../db/database'
import { ensureAiTables } from '../db/migrations'

export type AiJobType = 'BOOKING_FROM_DOCUMENTS' | 'MEMBER_TEXT' | 'REPORT_TEXT'
export type AiJobStatus = 'DRAFT' | 'QUEUED' | 'PROCESSING' | 'NEEDS_REVIEW' | 'APPROVED' | 'REJECTED' | 'FAILED'
export type AiResultKind = 'BOOKING_CANDIDATE' | 'TEXT_DRAFT'

export type AiJobFileInput = {
  fileName: string
  mimeType?: string | null
  dataBase64: string
}

export type AiJobRow = {
  id: number
  type: AiJobType
  status: AiJobStatus
  title?: string | null
  prompt?: string | null
  model?: string | null
  usage?: unknown
  error?: string | null
  voucherId?: number | null
  createdAt: string
  updatedAt: string
  processedAt?: string | null
  approvedAt?: string | null
  fileCount: number
  result?: unknown
  resultKind?: AiResultKind | null
}

export type AiJobFileRow = {
  id: number
  jobId: number
  fileName: string
  mimeType?: string | null
  size: number
  createdAt: string
  dataBase64?: string
}

export type AiJobDetail = AiJobRow & {
  files: AiJobFileRow[]
}

type DB = ReturnType<typeof getDb>

function db() {
  const d = getDb()
  ensureAiTables(d as any)
  return d
}

function parseResult(value?: string | null) {
  if (!value) return null
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function parseJson(value?: string | null) {
  if (!value) return null
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function mapJob(row: any): AiJobRow {
  return {
    id: Number(row.id),
    type: row.type,
    status: row.status,
    title: row.title,
    prompt: row.prompt,
    model: row.model,
    usage: parseJson(row.usageJson),
    error: row.error,
    voucherId: row.voucherId ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    processedAt: row.processedAt ?? null,
    approvedAt: row.approvedAt ?? null,
    fileCount: Number(row.fileCount || 0),
    result: parseResult(row.resultJson),
    resultKind: row.resultKind ?? null
  }
}

function mapFile(row: any, includeData: boolean): AiJobFileRow {
  const file: AiJobFileRow = {
    id: Number(row.id),
    jobId: Number(row.jobId),
    fileName: row.fileName,
    mimeType: row.mimeType ?? null,
    size: Number(row.size || 0),
    createdAt: row.createdAt
  }
  if (includeData) {
    const data = Buffer.isBuffer(row.data) ? row.data : Buffer.from(row.data || '')
    file.dataBase64 = data.toString('base64')
  }
  return file
}

function selectJobSql(where: string) {
  return `
    SELECT j.id, j.type, j.status, j.title, j.prompt, j.model, j.usage_json as usageJson, j.error,
           j.voucher_id as voucherId, j.created_at as createdAt, j.updated_at as updatedAt,
           j.processed_at as processedAt, j.approved_at as approvedAt,
           (SELECT COUNT(1) FROM ai_job_files f WHERE f.job_id = j.id) as fileCount,
           r.kind as resultKind, r.result_json as resultJson
    FROM ai_jobs j
    LEFT JOIN ai_job_results r ON r.id = (
      SELECT rr.id FROM ai_job_results rr WHERE rr.job_id = j.id ORDER BY rr.updated_at DESC, rr.id DESC LIMIT 1
    )
    ${where}
  `
}

export function createAiJob(input: {
  type: AiJobType
  title?: string | null
  prompt?: string | null
  model?: string | null
  files?: AiJobFileInput[]
}) {
  return withTransaction((tx: DB) => {
    ensureAiTables(tx as any)
    const info = tx.prepare(`
      INSERT INTO ai_jobs(type, status, title, prompt, model)
      VALUES (?, 'DRAFT', ?, ?, ?)
    `).run(input.type, input.title ?? null, input.prompt ?? null, input.model ?? null)
    const jobId = Number(info.lastInsertRowid)
    const insertFile = tx.prepare(`
      INSERT INTO ai_job_files(job_id, file_name, mime_type, size, data)
      VALUES (?, ?, ?, ?, ?)
    `)
    for (const file of input.files || []) {
      const data = Buffer.from(file.dataBase64, 'base64')
      insertFile.run(jobId, file.fileName, file.mimeType ?? null, data.length, data)
    }
    return getAiJob(jobId, tx)
  })
}

export function listAiJobs(filters?: { status?: AiJobStatus | 'ALL'; type?: AiJobType; limit?: number; offset?: number }) {
  const d = db()
  const where: string[] = []
  const params: any[] = []
  if (filters?.status && filters.status !== 'ALL') {
    where.push('j.status = ?')
    params.push(filters.status)
  }
  if (filters?.type) {
    where.push('j.type = ?')
    params.push(filters.type)
  }
  const limit = Math.max(1, Math.min(200, Number(filters?.limit || 100)))
  const offset = Math.max(0, Number(filters?.offset || 0))
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const rows = d.prepare(`${selectJobSql(whereSql)} ORDER BY j.created_at DESC, j.id DESC LIMIT ? OFFSET ?`).all(...params, limit, offset)
  const total = Number((d.prepare(`SELECT COUNT(1) as c FROM ai_jobs j ${whereSql}`).get(...params) as any)?.c || 0)
  return { rows: rows.map(mapJob), total }
}

export function getAiJob(id: number, tx?: DB): AiJobDetail {
  const d = tx || db()
  if (tx) ensureAiTables(tx as any)
  const row = d.prepare(selectJobSql('WHERE j.id = ?')).get(id) as any
  if (!row) throw new Error('KI-Aufgabe nicht gefunden')
  const files = d.prepare(`
    SELECT id, job_id as jobId, file_name as fileName, mime_type as mimeType, size, data, created_at as createdAt
    FROM ai_job_files
    WHERE job_id = ?
    ORDER BY id ASC
  `).all(id).map((file: any) => mapFile(file, true))
  return { ...mapJob(row), files }
}

export function setAiJobStatus(id: number, status: AiJobStatus, options?: { error?: string | null; model?: string | null; voucherId?: number | null; usage?: unknown }) {
  const d = db()
  const fields = ['status = ?', 'updated_at = datetime(\'now\')']
  const params: any[] = [status]
  if (status === 'PROCESSING') fields.push('processed_at = datetime(\'now\')')
  if (status === 'APPROVED') fields.push('approved_at = datetime(\'now\')')
  if (options?.error !== undefined) {
    fields.push('error = ?')
    params.push(options.error)
  } else if (status !== 'FAILED') {
    fields.push('error = NULL')
  }
  if (options?.model !== undefined) {
    fields.push('model = ?')
    params.push(options.model)
  }
  if (options?.usage !== undefined) {
    fields.push('usage_json = ?')
    params.push(options.usage == null ? null : JSON.stringify(options.usage))
  }
  if (options?.voucherId !== undefined) {
    fields.push('voucher_id = ?')
    params.push(options.voucherId)
  }
  params.push(id)
  d.prepare(`UPDATE ai_jobs SET ${fields.join(', ')} WHERE id = ?`).run(...params)
  return getAiJob(id)
}

export function saveAiJobResult(id: number, kind: AiResultKind, result: unknown) {
  const d = db()
  const existing = d.prepare('SELECT id FROM ai_job_results WHERE job_id = ? ORDER BY id DESC LIMIT 1').get(id) as any
  const json = JSON.stringify(result)
  if (existing?.id) {
    d.prepare('UPDATE ai_job_results SET kind = ?, result_json = ?, updated_at = datetime(\'now\') WHERE id = ?').run(kind, json, existing.id)
  } else {
    d.prepare('INSERT INTO ai_job_results(job_id, kind, result_json) VALUES (?, ?, ?)').run(id, kind, json)
  }
  return getAiJob(id)
}

export function updateAiJobCandidate(id: number, result: unknown) {
  return saveAiJobResult(id, 'BOOKING_CANDIDATE', result)
}

export function rejectAiJob(id: number, reason?: string | null) {
  return setAiJobStatus(id, 'REJECTED', { error: reason ?? null })
}

export function deleteAiJob(id: number) {
  const d = db()
  d.prepare('DELETE FROM ai_jobs WHERE id = ?').run(id)
  return { ok: true }
}
