import { randomUUID } from 'node:crypto'
import { getDb } from '../db/database'
import { ensureAiTables } from '../db/migrations'

type DB = ReturnType<typeof getDb>

export type AiAgentSessionRow = {
  id: string
  title?: string | null
  summary?: string | null
  status: 'OPEN' | 'ARCHIVED'
  createdAt: string
  updatedAt: string
}

export type AiAgentEventRole = 'user' | 'assistant' | 'tool' | 'system'

export type AiAgentEventRow = {
  id: number
  sessionId: string
  role: AiAgentEventRole
  kind: string
  content?: string | null
  toolName?: string | null
  payload?: unknown
  createdAt: string
}

export type AiAgentEventInput = {
  role: AiAgentEventRole
  kind: string
  content?: string | null
  toolName?: string | null
  payload?: unknown
}

function db() {
  const d = getDb()
  ensureAiTables(d as any)
  return d
}

function parsePayload(value?: string | null) {
  if (!value) return null
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function mapSession(row: any): AiAgentSessionRow {
  return {
    id: row.id,
    title: row.title ?? null,
    summary: row.summary ?? null,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }
}

function mapEvent(row: any): AiAgentEventRow {
  return {
    id: Number(row.id),
    sessionId: row.sessionId,
    role: row.role,
    kind: row.kind,
    content: row.content ?? null,
    toolName: row.toolName ?? null,
    payload: parsePayload(row.payloadJson),
    createdAt: row.createdAt
  }
}

export function getOrCreateAiAgentSession(input: { sessionId?: string | null; title?: string | null }) {
  const d = db()
  const requestedId = input.sessionId?.trim()
  if (requestedId) {
    const row = d.prepare(`
      SELECT id, title, summary, status, created_at as createdAt, updated_at as updatedAt
      FROM ai_agent_sessions
      WHERE id = ?
    `).get(requestedId) as any
    if (row) return mapSession(row)
  }

  const id = requestedId || randomUUID()
  d.prepare(`
    INSERT INTO ai_agent_sessions(id, title, status)
    VALUES (?, ?, 'OPEN')
  `).run(id, input.title ?? null)
  return getAiAgentSession(id)
}

export function getAiAgentSession(sessionId: string) {
  const d = db()
  const row = d.prepare(`
    SELECT id, title, summary, status, created_at as createdAt, updated_at as updatedAt
    FROM ai_agent_sessions
    WHERE id = ?
  `).get(sessionId) as any
  if (!row) throw new Error('KI-Agentensitzung nicht gefunden.')
  return mapSession(row)
}

export function updateAiAgentSession(input: { sessionId: string; title?: string | null; summary?: string | null }) {
  const d = db()
  const fields = ['updated_at = datetime(\'now\')']
  const params: any[] = []
  if (input.title !== undefined) {
    fields.push('title = ?')
    params.push(input.title)
  }
  if (input.summary !== undefined) {
    fields.push('summary = ?')
    params.push(input.summary)
  }
  params.push(input.sessionId)
  d.prepare(`UPDATE ai_agent_sessions SET ${fields.join(', ')} WHERE id = ?`).run(...params)
  return getAiAgentSession(input.sessionId)
}

export function appendAiAgentEvent(sessionId: string, event: AiAgentEventInput) {
  const d = db()
  d.prepare(`
    INSERT INTO ai_agent_events(session_id, role, kind, content, tool_name, payload_json)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    sessionId,
    event.role,
    event.kind,
    event.content ?? null,
    event.toolName ?? null,
    event.payload === undefined ? null : JSON.stringify(event.payload)
  )
  d.prepare(`UPDATE ai_agent_sessions SET updated_at = datetime('now') WHERE id = ?`).run(sessionId)
}

export function listAiAgentEvents(sessionId: string, limit = 60) {
  const d = db()
  const cappedLimit = Math.max(1, Math.min(200, Number(limit || 60)))
  const rows = d.prepare(`
    SELECT id, session_id as sessionId, role, kind, content, tool_name as toolName, payload_json as payloadJson, created_at as createdAt
    FROM (
      SELECT *
      FROM ai_agent_events
      WHERE session_id = ?
      ORDER BY created_at DESC, id DESC
      LIMIT ?
    )
    ORDER BY created_at ASC, id ASC
  `).all(sessionId, cappedLimit) as any[]
  return rows.map(mapEvent)
}

export function listAiAgentSessions(limit = 50) {
  const d = db()
  const cappedLimit = Math.max(1, Math.min(200, Number(limit || 50)))
  const rows = d.prepare(`
    SELECT id, title, summary, status, created_at as createdAt, updated_at as updatedAt
    FROM ai_agent_sessions
    ORDER BY updated_at DESC
    LIMIT ?
  `).all(cappedLimit) as any[]
  return rows.map(mapSession)
}
