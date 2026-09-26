import React, { useEffect, useState } from 'react'
import { addDataChangedListener } from '../../utils/refresh'
import FinanceSparkline from './FinanceSparkline'
import { fillFinanceMonths, financeUsage, type FinanceMonth } from './financeModel'
import './financeOverview.css'

export type AssignmentDefinition = { id: number; name: string; caption?: string; plan: number; color?: string | null; startDate?: string | null; endDate?: string | null; archived?: boolean; locked?: boolean; category?: string | null; project?: string | null; description?: string | null }
type Usage = { plan?: number; inflow: number; spent: number; monthly?: FinanceMonth[]; outside: number }
type Props = { kind: 'budget' | 'earmark'; definitions: AssignmentDefinition[]; from?: string; to?: string; sphere?: 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'; compact?: boolean; sortable?: boolean; revision?: number; onArchive?: (id: number) => void; onEdit?: (id: number) => void; onBookings?: (id: number) => void }
const eur = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })
const monthLabel = (month: string) => new Date(`${month}-01T12:00:00`).toLocaleDateString('de-DE', { month: 'short', year: '2-digit' })
const dateLabel = (date?: string | null) => date ? date.split('-').reverse().join('.') : 'offen'

export default function AssignmentOverview({ kind, definitions, from, to, sphere, compact = true, sortable, revision, onEdit, onArchive, onBookings }: Props) {
  const [usage, setUsage] = useState<Record<number, Usage>>({})
  const [errors, setErrors] = useState<number[]>([])
  const [loading, setLoading] = useState(true)
  const [refresh, setRefresh] = useState(0)
  const [expanded, setExpanded] = useState<number | null>(null)
  const [sort, setSort] = useState<{ key: 'name' | 'caption' | 'plan' | 'net' | 'remaining'; direction: 'ASC' | 'DESC' }>({ key: kind === 'budget' ? 'caption' : 'name', direction: kind === 'budget' ? 'DESC' : 'ASC' })
  const ids = definitions.map(row => row.id).sort((a, b) => a - b).join(',')
  const sortHeader = (key: typeof sort.key, label: string) => <th scope="col" aria-sort={sort.key === key ? (sort.direction === 'ASC' ? 'ascending' : 'descending') : 'none'}><button className="finance-sort" type="button" onClick={() => setSort(current => ({ key, direction: current.key === key && current.direction === 'ASC' ? 'DESC' : 'ASC' }))}>{label}<span aria-hidden="true">{sort.key === key ? (sort.direction === 'ASC' ? '↑' : '↓') : '↕'}</span></button></th>
  const sortedDefinitions = sortable ? [...definitions].sort((a, b) => {
    const value = (def: AssignmentDefinition): string | number | null => {
      if (sort.key === 'name' || sort.key === 'caption') return def[sort.key] || ''
      const u = usage[def.id]
      const plan = u?.plan ?? def.plan
      if (sort.key === 'plan') return plan
      if (!u) return null
      const metric = financeUsage(plan, u.inflow, u.spent)
      return sort.key === 'net' ? metric.net : plan > 0 ? metric.remaining : null
    }
    const left = value(a), right = value(b)
    if (left === null || right === null) return left === right ? 0 : left === null ? 1 : -1
    const comparison = typeof left === 'number' && typeof right === 'number' ? left - right : String(left).localeCompare(String(right), 'de', { numeric: true, sensitivity: 'base' })
    return (sort.direction === 'ASC' ? comparison : -comparison) || a.name.localeCompare(b.name, 'de') || a.id - b.id
  }) : definitions
  useEffect(() => addDataChangedListener(['vouchers', 'budgets', 'earmarks', 'organizations'], () => setRefresh(n => n + 1)), [])
  useEffect(() => {
    let alive = true
    setLoading(true); setUsage({}); setErrors([])
    const load = async () => {
      const results: Record<number, Usage> = {}
      const failed: number[] = []
      const keys = ids ? ids.split(',').map(Number) : []
      for (let i = 0; i < keys.length; i += 8) {
        await Promise.all(keys.slice(i, i + 8).map(async id => {
          try {
            if (kind === 'budget') {
              const row = await window.api.budgets.usage({ budgetId: id, from, to })
              results[id] = { plan: row.planned, inflow: row.inflow, spent: row.spent, monthly: row.monthly, outside: row.countOutside || 0 }
            } else {
              const row = await window.api.bindings.usage({ earmarkId: id, from, to, sphere })
              results[id] = { plan: row.budget, inflow: row.allocated, spent: row.released, monthly: row.monthly, outside: row.outsideCount || 0 }
            }
          } catch { failed.push(id) }
        }))
        if (!alive) return
      }
      if (alive) { setUsage(results); setErrors(failed); setLoading(false) }
    }
    void load()
    return () => { alive = false }
  }, [ids, kind, from, to, sphere, revision, refresh])

  if (!definitions.length) return <p className="finance-muted">Keine {kind === 'budget' ? 'Budgets' : 'Zweckbindungen'} für diese Auswahl.</p>
  return <section className={`finance-overview${compact ? ' finance-overview--compact' : ''}`} aria-label={kind === 'budget' ? 'Budgetentwicklung' : 'Entwicklung der Zweckbindungen'} aria-busy={loading}>
    <div className="finance-overview-heading"><div><h2>Verbrauch und Entwicklung</h2><p>{from || to ? `${dateLabel(from)} – ${dateLabel(to)} · Rest zum Gesamtplan nach Bewegungen in diesem Zeitraum` : 'Alle Buchungen · Rest zum Plan nach Einnahmen und Ausgaben'}</p></div></div>
    <div className="finance-table-scroll" role="region" aria-label="Finanzübersicht" tabIndex={0}>
      <table className="finance-table"><thead><tr>{sortable ? <>{sortHeader('caption', kind === 'budget' ? 'Jahr' : 'Code')}{sortHeader('name', 'Name')}{sortHeader('plan', 'Plan')}{sortHeader('net', 'Nettoverbrauch')}{sortHeader('remaining', 'Rest zum Plan')}</> : <><th scope="col">{kind === 'budget' ? 'Budget' : 'Zweckbindung'}</th><th scope="col">Plan</th><th scope="col">Nettoverbrauch</th><th scope="col">Rest zum Plan</th></>}<th scope="col">Monatsverlauf</th><th scope="col"><span className="finance-muted">Details</span></th></tr></thead><tbody>
        {sortedDefinitions.map(def => {
          const u = usage[def.id]
          const plan = u?.plan ?? def.plan
          const metric = u ? financeUsage(plan, u.inflow, u.spent) : null
          const months = u ? fillFinanceMonths(u.monthly || [], from, to) : []
          const values = months.map(row => Math.round((row.spent - row.inflow) * 100) / 100)
          const open = expanded === def.id
          const detailId = `finance-${kind}-${def.id}`
          return <React.Fragment key={def.id}><tr className={open ? 'is-expanded' : undefined}>
            {sortable && <td className="finance-caption">{def.caption || '—'}</td>}
            <th scope="row"><div className="finance-name"><i style={{ background: def.color || 'var(--accent)' }} /><div><strong>{def.name}</strong><small>{[!sortable && def.caption, def.archived ? 'archiviert' : '', def.locked ? 'Zeitraum geschützt' : ''].filter(Boolean).join(' · ')}</small></div></div></th>
            <td data-label="Plan" className="finance-number">{plan > 0 ? eur.format(plan) : '—'}</td>
            <td data-label="Nettoverbrauch">{metric ? <><strong className="finance-number">{eur.format(metric.net)}</strong><div className={`finance-progress finance-tone-${metric.tone}`} role={metric.percent === null ? undefined : 'meter'} aria-label="Nettoverbrauch gegenüber Plan" aria-valuemin={0} aria-valuemax={100} aria-valuenow={metric.percent === null ? undefined : Math.min(100, Math.max(0, metric.percent))} aria-valuetext={metric.percent === null ? undefined : `${Math.round(metric.percent)} Prozent`}><i style={{ width: `${Math.min(100, Math.max(0, metric.percent || 0))}%` }} /></div><small className={`finance-status finance-tone-${metric.tone}`}>{metric.percent === null ? metric.status : `${Math.round(metric.percent)} % · ${metric.status}`}</small></> : <span className="finance-muted">{errors.includes(def.id) ? 'Nicht verfügbar' : 'Lädt …'}</span>}</td>
            <td data-label="Rest zum Plan" className={`finance-number ${metric && plan > 0 && metric.remaining < 0 ? 'finance-tone-danger' : ''}`}>{metric && plan > 0 ? eur.format(metric.remaining) : '—'}</td>
            <td data-label="Monatsverlauf">{u && <><FinanceSparkline values={values} label={`Monatlicher Nettoverbrauch: ${months.map((m, i) => `${monthLabel(m.month)} ${eur.format(values[i])}`).join('; ')}`} /><small className="finance-muted">{months.length ? `${monthLabel(months[0].month)} – ${monthLabel(months[months.length - 1].month)}` : 'Keine Buchungen'}</small></>}</td>
            <td><button className="btn ghost finance-expand" aria-expanded={open} aria-controls={detailId} aria-label={`${def.name}: Details ${open ? 'schließen' : 'anzeigen'}`} onClick={() => setExpanded(open ? null : def.id)}>{open ? '−' : '+'}</button></td>
          </tr>{open && <tr id={detailId} className="finance-detail"><td colSpan={sortable ? 7 : 6}>
            <div className="finance-detail-heading"><div><strong>{def.name}</strong><p>Laufzeit: {dateLabel(def.startDate)} – {dateLabel(def.endDate)}</p></div><div className="finance-actions">{onBookings && <button className="btn" onClick={() => onBookings(def.id)}>Buchungen ansehen</button>}{onEdit && <button className="btn" onClick={() => onEdit(def.id)}>Bearbeiten</button>}{onArchive && <button className="btn" onClick={() => onArchive(def.id)}>{def.archived ? 'Wiederherstellen' : 'Archivieren'}</button>}</div></div>
            {(def.category || def.project || def.description) && <p className="finance-muted">{[def.category && `Kategorie: ${def.category}`, def.project && `Projekt: ${def.project}`, def.description].filter(Boolean).join(' · ')}</p>}
            {u && <><dl className="finance-facts"><div><dt>Einnahmen / Zuflüsse</dt><dd>{eur.format(u.inflow)}</dd></div><div><dt>Ausgaben / Verwendung</dt><dd>{eur.format(u.spent)}</dd></div><div><dt>Nettoverbrauch</dt><dd>{eur.format(metric!.net)}</dd></div></dl><p className="finance-muted">Nettoverbrauch = Ausgaben minus Einnahmen. Die Kurve zeigt einzelne Monatswerte, keinen Kontostand. Steigende Werte werden neutral dargestellt.</p>{u.outside > 0 && <p className="finance-tone-warning">{u.outside} Buchung(en) außerhalb der hinterlegten Laufzeit (insgesamt).</p>}{months.length > 0 && <table className="finance-months"><caption>Monatswerte{months.length === 12 ? ' · letzte 12 Monate' : ''}{from || to ? ' innerhalb der Auswahl' : ''}</caption><thead><tr><th>Monat</th><th>Einnahmen</th><th>Ausgaben</th><th>Nettoverbrauch</th></tr></thead><tbody>{months.map((m, i) => <tr key={m.month}><th>{monthLabel(m.month)}</th><td>{eur.format(m.inflow)}</td><td>{eur.format(m.spent)}</td><td>{eur.format(values[i])}</td></tr>)}</tbody></table>}</>}
            {errors.includes(def.id) && <p role="alert">Auswertung konnte nicht geladen werden. <button className="btn" onClick={() => setRefresh(n => n + 1)}>Erneut versuchen</button></p>}
          </td></tr>}</React.Fragment>
        })}
      </tbody></table>
    </div>
    <p className="finance-footnote">Nettoverbrauch = Ausgaben − Einnahmen · Verlauf: bis zu 12 Monate{to ? `, letzter Monat bis ${dateLabel(to)}` : ''}.</p>
  </section>
}
