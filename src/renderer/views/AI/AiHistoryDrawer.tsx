import { forwardRef, useState } from 'react'
import FlyoutHeader from '../../components/FlyoutHeader'
import type { TAiJobsListOutput } from '../../../../electron/main/ipc/schemas'
import { bookingProgress } from './aiBooking'
import { statusLabel, typeLabel } from './aiText'

type Job = TAiJobsListOutput['rows'][number]
type Area = 'all' | 'open' | 'done'

const dayFormat = new Intl.DateTimeFormat('de-DE', { dateStyle: 'long', timeZone: 'UTC' })
const areas = {
  all: { label: 'Alle KI-Aufgaben', empty: 'Noch keine gespeicherten KI-Aufgaben.' },
  open: { label: 'Offene Buchungsreviews', empty: 'Keine offenen Buchungsvorschläge.' },
  done: { label: 'Gebuchte Vorschläge', empty: 'Noch keine gebuchten Vorschläge.' }
}

function groupByDay(jobs: Job[]) {
  const days = new Map<string, Job[]>()
  for (const job of jobs) {
    const day = job.createdAt?.slice(0, 10)
    const date = day && new Date(day)
    const label = date && Number.isFinite(date.getTime()) ? dayFormat.format(date) : 'Ohne Datum'
    const group = days.get(label)
    if (group) group.push(job)
    else days.set(label, [job])
  }
  return days
}

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
  const [area, setArea] = useState<Area>('all')
  const lists = { all: jobs, open: openBookingJobs, done: completedBookingJobs }

  function areaButton(key: Area) {
    return <button type="button" aria-pressed={area === key} onClick={() => setArea(key)}>
      <span>{areas[key].label}</span><span className="ai-history-count">{lists[key].length}</span>
    </button>
  }

  function renderJob(job: Job) {
    const fallbackTitle = job.type === 'BOOKING_FROM_DOCUMENTS' ? `Buchungsvorschlag #${job.id}` : `KI-Aufgabe #${job.id}`
    const meta = [
      job.type === 'BOOKING_FROM_DOCUMENTS' ? bookingProgress(job) : typeLabel(job.type),
      statusLabel(job.status),
      area === 'done' && job.voucherId ? `Buchung #${job.voucherId}` : null,
      formatUsage(job.usage)
    ].filter(Boolean).join(' · ')
    const canResolve = area === 'open' && job.type === 'BOOKING_FROM_DOCUMENTS'
    return <article key={job.id} className={`ai-history-item ${selectedJobId === job.id ? 'active' : ''}`}>
      <button className="ai-history-item-main" type="button" onClick={() => { onOpenJob(job.id); onClose() }}>
        <strong>{job.title || fallbackTitle}</strong><small>{meta}</small>
      </button>
      {canResolve && <span className="ai-history-item-actions">
        <button type="button" className="ai-history-item-action ai-history-item-action--done" disabled={busy} onClick={() => onMarkDone(job)} aria-label="Buchungsreview als erledigt markieren" title="Als erledigt markieren">✓</button>
        <button type="button" className="ai-history-item-action ai-history-item-action--delete" disabled={busy} onClick={() => onDelete(job)} aria-label="Buchungsreview löschen" title="Löschen">×</button>
      </span>}
    </article>
  }

  return <section ref={ref} className="card ai-flyout ai-assistant-sidebar ai-history-drawer" role="dialog" aria-label="KI-Verlauf">
    <FlyoutHeader title="KI-Verlauf" onClose={onClose} />
    <div className="ai-history-layout">
      <nav className="ai-history-nav" aria-label="Verlaufsbereiche">
        <div>
          <h3>Aufgaben</h3>
          {areaButton('all')}
        </div>
        <div>
          <h3>Buchungen</h3>
          {areaButton('open')}
          {areaButton('done')}
        </div>
      </nav>
      <section className="ai-history-content" aria-label={areas[area].label}>
        <h3>{areas[area].label}</h3>
        <div className="ai-history-list" key={area}>
          {Array.from(groupByDay(lists[area]), ([day, rows]) => (
            <section className="ai-history-day" key={day}>
              <h4>{day}</h4>
              <div className="ai-history-entries">{rows.map(renderJob)}</div>
            </section>
          ))}
          {!lists[area].length && <div className="ai-empty">{areas[area].empty}</div>}
        </div>
      </section>
    </div>
  </section>
})
