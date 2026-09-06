import { forwardRef } from 'react'
import type { TAiJobsListOutput } from '../../../../electron/main/ipc/schemas'
import { bookingProgress } from './aiBooking'
import { statusLabel, typeLabel } from './aiText'

type Job = TAiJobsListOutput['rows'][number]
type Tone = 'open' | 'done' | 'task'

type Props = {
  jobs: Job[]
  openBookingJobs: Job[]
  completedBookingJobs: Job[]
  selectedJobId?: number | null
  busy: boolean
  onClose: () => void
  onOpenJob: (id: number) => void
  onMarkDone: (job: Job) => void
  onDelete: (job: Job) => void
}

function formatUsage(usage: Job['usage']) {
  if (!usage) return ''
  const tokens = Number(usage.totalTokens || 0).toLocaleString('de-DE')
  const usd = new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 4
  })
  const cost = usage.estimatedCostUsd == null
    ? 'Kosten n/a'
    : usd.format(Number(usage.estimatedCostUsd || 0))
  return `${tokens} Tokens · ${cost}`
}

export const AiHistoryDrawer = forwardRef<HTMLElement, Props>(function AiHistoryDrawer({
  jobs,
  openBookingJobs,
  completedBookingJobs,
  selectedJobId,
  busy,
  onClose,
  onOpenJob,
  onMarkDone,
  onDelete
}, ref) {
  const renderJob = (job: Job, tone: Tone, metaItems?: Array<string | null | undefined>) => {
    const fallbackTitle = job.type === 'BOOKING_FROM_DOCUMENTS' ? `Buchungsvorschlag #${job.id}` : `KI-Aufgabe #${job.id}`
    const defaultMeta = [
      job.type === 'BOOKING_FROM_DOCUMENTS' ? bookingProgress(job) : typeLabel(job.type),
      statusLabel(job.status),
      job.createdAt?.slice(0, 10),
      formatUsage(job.usage)
    ]
    const canResolve = tone === 'open' && job.type === 'BOOKING_FROM_DOCUMENTS'
    return <article key={`${tone}-${job.id}`} className={`ai-history-item ai-history-item--${tone} ${selectedJobId === job.id ? 'active' : ''} ${canResolve ? 'ai-history-item--actionable' : ''}`}>
      <button className="ai-history-item-main" type="button" onClick={() => { onOpenJob(job.id); onClose() }}>
        <span className="ai-history-item-icon" aria-hidden="true" />
        <span className="ai-history-item-copy"><strong>{job.title || fallbackTitle}</strong><small>{(metaItems || defaultMeta).filter(Boolean).join(' · ')}</small></span>
      </button>
      {canResolve && <span className="ai-history-item-actions" aria-label="Buchungsreview Aktionen">
        <button type="button" className="ai-history-item-action ai-history-item-action--done" disabled={busy} onClick={(event) => { event.stopPropagation(); onMarkDone(job) }} aria-label="Buchungsreview als erledigt markieren" title="Als erledigt markieren">✓</button>
        <button type="button" className="ai-history-item-action ai-history-item-action--delete" disabled={busy} onClick={(event) => { event.stopPropagation(); onDelete(job) }} aria-label="Buchungsreview löschen" title="Löschen">×</button>
      </span>}
    </article>
  }

  return <section ref={ref} className="card ai-assistant-sidebar ai-history-drawer" role="dialog" aria-label="KI-Verlauf">
    <div className="ai-history-drawer-head">
      <div><strong>Verlauf</strong><span>Schneller zurück in Reviews, gebuchte Vorschläge und alte Agent-Läufe.</span></div>
      <button className="btn ghost ai-history-close" type="button" onClick={onClose} aria-label="Schließen">×</button>
    </div>
    <div className="ai-history-stats">
      <span><strong>{openBookingJobs.length}</strong> offen</span>
      <span><strong>{completedBookingJobs.length}</strong> gebucht</span>
      <span><strong>{jobs.length}</strong> Aufgaben</span>
    </div>
    <div className="ai-history-layout">
      <div className="ai-history-column ai-history-column--reviews">
        <div className="ai-history-group ai-history-group--open">
          <div className="ai-history-group-title"><strong>Offene Buchungsreviews</strong><span>{openBookingJobs.length}</span></div>
          <div className="ai-history-list">
            {openBookingJobs.map((job) => renderJob(job, 'open'))}
            {!openBookingJobs.length && <div className="ai-empty">Keine offenen Buchungsvorschläge.</div>}
          </div>
        </div>
        <div className="ai-history-group ai-history-group--done">
          <div className="ai-history-group-title"><strong>Gebuchte Vorschläge</strong><span>{completedBookingJobs.length}</span></div>
          <div className="ai-history-list ai-history-list--compact">
            {completedBookingJobs.slice(0, 10).map((job) => renderJob(job, 'done', [
              bookingProgress(job),
              statusLabel(job.status),
              job.createdAt?.slice(0, 10),
              job.voucherId ? `Buchung #${job.voucherId}` : null
            ]))}
            {!completedBookingJobs.length && <div className="ai-empty">Noch keine gebuchten Vorschläge.</div>}
          </div>
        </div>
      </div>
      <div className="ai-history-column">
        <div className="ai-history-group ai-history-group--all">
          <div className="ai-history-group-title"><strong>Alle KI-Aufgaben</strong><span>{jobs.length}</span></div>
          <div className="ai-history-list">
            {jobs.map((job) => renderJob(job, 'task'))}
            {!jobs.length && <div className="ai-empty">Noch keine gespeicherten KI-Aufgaben.</div>}
          </div>
        </div>
      </div>
    </div>
  </section>
})
