import { IconAlertTriangle, IconCheck, IconCircleOff, IconCopy, IconPencil, IconPinned, IconSparkles, IconX } from '@tabler/icons-react'
import type { AiImportRow } from '../../../../../../shared/aiImport'
import { originLabels, rowStateLabels, type RowState } from './model'

const stateIcons = { ok: IconCheck, warning: IconAlertTriangle, error: IconX, duplicate: IconCopy, ignored: IconCircleOff, excluded: IconCircleOff }

export function StatePill({ state }: { state: RowState }) {
  const Icon = stateIcons[state]
  return <span className={`ai-import-pill is-${state}`}><Icon size={13} stroke={2.2} aria-hidden="true" />{rowStateLabels[state]}</span>
}

const originIcons = { ai: IconSparkles, user: IconPencil, default: IconPinned }

/** Small marker for values that did not come from the file unchanged. */
export function OriginMark({ origin, reason }: { origin?: AiImportRow['origins'][string]; reason?: string }) {
  if (!origin || origin === 'source') return null
  const Icon = originIcons[origin]
  const label = reason ? `${originLabels[origin]}: ${reason}` : originLabels[origin]
  return <span className={`ai-import-origin is-${origin}`} role="img" aria-label={originLabels[origin]} title={label}><Icon size={12} stroke={2} aria-hidden="true" /></span>
}

export function TypeBadge({ type }: { type: unknown }) {
  const value = String(type ?? '').toUpperCase()
  if (!value) return <span className="ai-import-empty">—</span>
  const known = ['IN', 'OUT', 'TRANSFER'].includes(value)
  return <span className={known ? `badge voucher-type-badge voucher-type-badge--${value.toLowerCase()} ${value.toLowerCase()}` : 'badge'}>{value}</span>
}

export function ClassBadge({ value, sphere }: { value: unknown; sphere: boolean }) {
  const text = String(value ?? '').trim()
  if (!text) return <span className="ai-import-empty">—</span>
  return sphere ? <span className={`badge sphere-${text.toLowerCase()}`}>{text}</span> : <span className="ai-import-chip" title={text}>{text}</span>
}
