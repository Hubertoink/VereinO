import DashboardBindings from './DashboardBindings'
import React, { useEffect, useState } from 'react'
import type { RendererApi } from '../../../types/api'
import HoverTooltip from '../../components/common/HoverTooltip'
const money = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })
const colors = ['var(--accent)', 'color-mix(in srgb, var(--accent) 55%, var(--success))', 'var(--success)', 'var(--warning)', 'color-mix(in srgb, var(--accent) 65%, var(--text))', 'color-mix(in srgb, var(--accent) 45%, var(--danger))']
const names: Record<string, string> = { IDEELL: 'Ideell', ZWECK: 'Zweckbetrieb', VERMOEGEN: 'Vermögen', WGB: 'Wirtschaftlich' }
type Budget = Awaited<ReturnType<RendererApi['budgets']['list']>>['rows'][number]
type Usage = Awaited<ReturnType<RendererApi['budgets']['usage']>>
type Summary = Awaited<ReturnType<RendererApi['reports']['summary']>>
export default function DashboardInsights({ from, to, revision, onBudgets, onBindings }: { from: string; to: string; revision: number; onBudgets: () => void; onBindings: () => void }) {
  const [data, setData] = useState<{ summary: Summary; budgets: Array<{ budget: Budget; usage: Usage }> } | null>(null)
  const [mode, setMode] = useState<'budgets' | 'bindings'>('budgets')
  const [error, setError] = useState(false)
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    let alive = true
    setData(null); setError(false)
    Promise.all([window.api.reports.summary({ from, to, type: 'OUT' }), window.api.budgets.list({ includeArchived: true })]).then(async ([summary, definitions]) => {
      const relevant = definitions.rows.filter(budget => (budget.startDate || `${budget.year}-01-01`) <= to && (budget.endDate || `${budget.year}-12-31`) >= from)
      const budgets: Array<{ budget: Budget; usage: Usage }> = []
      // Keep historical budget loading bounded rather than flooding IPC.
      for (let index = 0; index < relevant.length; index += 8) {
        const part = await Promise.all(relevant.slice(index, index + 8).map(async budget => ({ budget, usage: await window.api.budgets.usage({ budgetId: budget.id, from, to }) })))
        if (!alive) return
        budgets.push(...part)
      }
      if (alive) setData({ summary, budgets })
    }).catch(() => { if (alive) setError(true) })
    return () => { alive = false }
  }, [from, to, revision, retry])
  if (error) return <div className="dp-state" role="alert">Auswertungen konnten nicht geladen werden. <button className="btn" onClick={() => setRetry(value => value + 1)}>Erneut versuchen</button></div>
  if (!data) return <p role="status">Budgets und Verteilung werden geladen …</p>
  const general = data.summary.classificationProfile === 'GENERAL'
  const rows = (general ? data.summary.byPrimaryClassification : data.summary.bySphere).map((row, index) => ({ label: general ? row.key : names[row.key] || row.key, amount: row.gross, color: ('color' in row && row.color) || colors[index % colors.length] }))
  const positiveTotal = rows.reduce((sum, row) => sum + Math.max(0, row.amount), 0)
  return <section className="dp-insights" aria-label="Budgets und Verteilung">
    <article className="dp-card dp-distribution"><div className="dp-card-heading"><h2>Wohin das Geld fließt</h2><span>{general ? 'Kategorien' : 'Sphären'}</span></div><strong className="dp-open-value">{money.format(data.summary.totals.gross)}</strong><p className="dp-card-note">Ausgaben · {from} bis {to}</p>
      <div className="dp-distribution-bar">{rows.filter(row => row.amount > 0).map(row => <HoverTooltip key={row.label} className="dp-tooltip" content={<><strong>{row.label}</strong><span>{money.format(row.amount)} · {Math.round(row.amount / positiveTotal * 100)} %</span></>}>{({ ref, props }) => <span ref={ref} {...props} tabIndex={0} style={{ flex: row.amount, background: row.color }} />}</HoverTooltip>)}</div>
      <div className="dp-distribution-list">{rows.length ? rows.map(row => <div key={row.label}><span><i style={{ background: row.color }} />{row.label}</span><strong>{money.format(row.amount)}</strong><small>{row.amount > 0 && positiveTotal ? `${Math.round(row.amount / positiveTotal * 100)} %` : '—'}</small></div>) : <p>Keine Ausgaben im Zeitraum.</p>}</div>{rows.some(row => row.amount < 0) && <p className="dp-card-note">Negative Werte sind Rückbuchungen; die Anteilsleiste zeigt positive Ausgaben.</p>}
    </article>
    <article className="dp-card dp-budget-overview"><div className="dp-card-heading"><h2>Budgets und Zweckbindungen</h2><button onClick={mode === 'budgets' ? onBudgets : onBindings}>{mode === 'budgets' ? 'Alle Budgets' : 'Alle Zweckbindungen'} ↗</button></div><div className="dp-segments dp-range dp-assignment-switch" role="group" aria-label="Budgets oder Zweckbindungen"><button aria-pressed={mode === 'budgets'} onClick={() => setMode('budgets')}>Budgets</button><button aria-pressed={mode === 'bindings'} onClick={() => setMode('bindings')}>Zweckbindungen</button></div>{mode === 'bindings' ? <DashboardBindings from={from} to={to} revision={revision} /> : <><p className="dp-card-note">Ausgaben im gewählten Zeitraum gegenüber dem gesamten Budgetplan.</p><div className="dp-budget-tiles">{data.budgets.length ? data.budgets.map(({ budget, usage }, index) => <div className="dp-budget-tile" key={budget.id}><div><strong>{budget.name || `Budget ${budget.year}`}</strong><span>{budget.year}{budget.isArchived ? ' · archiviert' : ''}</span></div><b>{money.format(usage.spent)}</b><div className="dp-budget-track"><i style={{ width: `${budget.amountPlanned > 0 ? Math.min(100, Math.max(0, usage.spent / budget.amountPlanned * 100)) : 0}%`, background: budget.color || colors[index % colors.length] }} /></div><p>von {money.format(budget.amountPlanned)} Plan{budget.amountPlanned > 0 ? ` · ${Math.round(usage.spent / budget.amountPlanned * 100)} %` : ''}</p>{usage.spent > budget.amountPlanned && <small className="dp-negative">Plan überschritten</small>}</div>) : <p>Keine Budgets für diesen Zeitraum angelegt.</p>}</div></>}</article>
  </section>
}
