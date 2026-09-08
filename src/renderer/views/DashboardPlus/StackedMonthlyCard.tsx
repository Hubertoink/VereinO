import React, { useEffect, useMemo, useState } from 'react'
import HoverTooltip from '../../components/common/HoverTooltip'
import { stackedMonths, type StackGroup, type StackVoucher } from './stackedMonthlyModel'
import { resolveTagDisplayColor } from '../../utils/tagColors'
const money = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })
const palette = ['var(--accent)', 'color-mix(in srgb, var(--accent) 55%, var(--success))', 'var(--success)', 'var(--warning)', 'color-mix(in srgb, var(--accent) 65%, var(--text))', 'color-mix(in srgb, var(--accent) 45%, var(--danger))', 'color-mix(in srgb, var(--warning) 60%, var(--text))', 'color-mix(in srgb, var(--accent) 50%, var(--surface))']
const monthName = (month: string) => new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric' }).format(new Date(`${month}-01T12:00:00`))
export default function StackedMonthlyCard({ from, to, months, general, revision }: { from: string; to: string; months: string[]; general: boolean; revision: number }) {
  const [kind, setKind] = useState<'IN' | 'OUT'>('IN')
  const [group, setGroup] = useState<StackGroup>('classification')
  const [rows, setRows] = useState<StackVoucher[]>([])
  const [tagColors, setTagColors] = useState<Record<string, string | null>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [retry, setRetry] = useState(0)
  const [tableYear, setTableYear] = useState('')
  const [view, setView] = useState<'chart' | 'table'>('chart')
  useEffect(() => {
    let alive = true
    setLoading(true); setError(false); setRows([])
    ;(async () => {
      const tags = await window.api.tags.list()
      const result: StackVoucher[] = []
      let offset = 0
      while (alive) {
        const batch = await window.api.vouchers.list({ from, to, limit: 100, offset, sort: 'ASC', sortBy: 'date' })
        if (!alive) return
        result.push(...batch.rows.filter(row => row.type === 'IN' || row.type === 'OUT'))
        offset += batch.rows.length
        if (!batch.rows.length || offset >= batch.total) break
      }
      if (alive) { setRows(result); setTagColors(Object.fromEntries(tags.rows.map(tag => [tag.name, resolveTagDisplayColor(tag.name, tags.rows)]))) }
    })().catch(() => { if (alive) setError(true) }).finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [from, to, revision, retry])
  const data = useMemo(() => stackedMonths(rows, months, kind, group, general, tagColors), [rows, months, kind, group, general, tagColors])
  const years = [...new Set(months.map(month => month.slice(0, 4)))].sort()
  const activeYear = years.includes(tableYear) ? tableYear : years[years.length - 1]
  const yearIndex = years.indexOf(activeYear)
  const tableMonths = data.months.filter(month => month.month.startsWith(activeYear))
  const colors = new Map(data.series.map((item, index) => [item.key, item.color || palette[index % palette.length]]))
  const maxPositive = Math.max(0, ...data.months.map(month => month.positive))
  const maxNegative = Math.max(0, ...data.months.map(month => -month.negative))
  const scale = maxPositive + maxNegative || 1
  const total = data.months.reduce((sum, month) => sum + month.total, 0)
  return <article className="dp-card dp-stacked" aria-label="Gestapelte Monatsentwicklung"><div className="dp-card-heading"><h2>{kind === 'IN' ? 'Einnahmen' : 'Ausgaben'} nach Monat</h2><div className="dp-segments dp-range" aria-label="Darstellung"><button aria-pressed={view === 'chart'} onClick={() => setView('chart')}>Diagramm</button><button aria-pressed={view === 'table'} onClick={() => setView('table')}>Tabelle</button></div></div>
    <div className="dp-stack-controls"><div role="group" aria-label="Einnahmen oder Ausgaben" className="dp-segments dp-range"><button aria-pressed={kind === 'IN'} onClick={() => setKind('IN')}>Einnahmen</button><button aria-pressed={kind === 'OUT'} onClick={() => setKind('OUT')}>Ausgaben</button></div><div role="group" aria-label="Gruppierung" className="dp-segments dp-range"><button aria-pressed={group === 'tags'} onClick={() => setGroup('tags')}>Tags</button><button aria-pressed={group === 'classification'} onClick={() => setGroup('classification')}>{general ? 'Kategorie' : 'Sphäre'}</button></div></div>
    {loading ? <p role="status">Monatswerte werden geladen …</p> : error ? <div role="alert">Monatswerte konnten nicht geladen werden. <button className="btn" onClick={() => setRetry(value => value + 1)}>Erneut versuchen</button></div> : <><strong className="dp-stack-total">{money.format(total)}</strong><p className="dp-card-note">{from} bis {to}{group === 'tags' ? ' · Beträge mit mehreren Tags werden gleichmäßig auf diese verteilt.' : ''}</p>
      <div className="dp-stack-legend">{data.series.map(item => <span key={item.key}><i style={{ background: colors.get(item.key) }} />{item.label}</span>)}</div>
      {!data.series.length ? <p>Keine {kind === 'IN' ? 'Einnahmen' : 'Ausgaben'} im Zeitraum.</p> : view === 'chart' ? <div className="dp-stack-scroll"><div className="dp-stack-chart" style={{ minWidth: Math.max(450, months.length * 55) }}><div className="dp-stack-axis" aria-hidden="true"><span>{money.format(maxPositive)}</span><span style={{ top: `${maxPositive / scale * 100}%` }}>0</span>{maxNegative > 0 && <span className="dp-stack-axis-bottom">{money.format(-maxNegative)}</span>}</div><div className="dp-stack-bars">{data.months.map(month => <HoverTooltip key={month.month} className="dp-tooltip dp-stack-tooltip" content={<><strong>{monthName(month.month)}{month.month === to.slice(0, 7) ? ' · bisher' : ''}</strong>{month.entries.filter(item => item.amount !== 0).map(item => <span key={item.key}><span><i style={{ background: colors.get(item.key) }} />{item.label}</span><b>{money.format(item.amount)}</b></span>)}<span>Gesamt <b>{money.format(month.total)}</b></span></>}>{({ ref, props }) => <button ref={ref} {...props} className={`dp-stack-month${month.month === to.slice(0, 7) ? ' is-current' : ''}`} aria-label={`${monthName(month.month)}: ${money.format(month.total)}`}><span className="dp-stack-track"><span className="dp-stack-positive" style={{ height: `${maxPositive / scale * 100}%` }}>{month.entries.filter(item => item.amount > 0).map(item => <i key={item.key} style={{ height: `${item.amount / (maxPositive || 1) * 100}%`, background: colors.get(item.key) }} />)}</span><span className="dp-stack-negative" style={{ height: `${maxNegative / scale * 100}%` }}>{month.entries.filter(item => item.amount < 0).map(item => <i key={item.key} style={{ height: `${-item.amount / (maxNegative || 1) * 100}%`, background: colors.get(item.key) }} />)}</span></span><span className="dp-stack-month-label">{new Intl.DateTimeFormat('de-DE', { month: 'short', year: months.length > 12 ? '2-digit' : undefined }).format(new Date(`${month.month}-01T12:00:00`))}{month.month === to.slice(0, 7) ? '*' : ''}</span></button>}</HoverTooltip>)}</div></div></div> : <><nav className="dp-year-navigation" aria-label="Tabellenjahr"><button className="btn ghost" aria-label="Vorheriges Jahr" disabled={yearIndex <= 0} onClick={() => setTableYear(years[yearIndex - 1])}>‹</button><strong aria-live="polite">{activeYear}</strong><button className="btn ghost" aria-label="Nächstes Jahr" disabled={yearIndex >= years.length - 1} onClick={() => setTableYear(years[yearIndex + 1])}>›</button><span>Bis zu zwölf Monate pro Jahr</span></nav><div className="dp-table-scroll"><table><thead><tr><th>Monat</th>{data.series.map(item => <th key={item.key}><span className="dp-table-series"><i style={{ background: colors.get(item.key) }} />{item.label}</span></th>)}<th>Gesamt</th></tr></thead><tbody>{tableMonths.map(month => <tr key={month.month}><th>{monthName(month.month)}</th>{month.entries.map(item => <td key={item.key} style={{ background: `color-mix(in srgb, ${colors.get(item.key)} 9%, transparent)`, borderBottomColor: `color-mix(in srgb, ${colors.get(item.key)} 30%, transparent)` }}>{money.format(item.amount)}</td>)}<td>{money.format(month.total)}</td></tr>)}</tbody></table></div></>}
      <p className="dp-card-note">* Laufender Monat bis {to}. Rückbuchungen werden unterhalb der Nulllinie dargestellt.</p>
    </>}
  </article>
}
