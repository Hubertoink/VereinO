import React from 'react'
import FinanceSparkline from './FinanceSparkline'
import type { MonthRow } from '../../views/DashboardPlus/dashboardPlusModel'

const eur = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })
export default function FinanceKpiTable({ months, today }: { months: MonthRow[]; today: string }) {
  // Only complete calendar months are compared; the unfinished month remains in the chart.
  const completed = months.filter(row => row.month < today.slice(0, 7))
  const current = completed[completed.length - 1]
  const previous = completed[completed.length - 2]
  const label = (month: string) => new Date(`${month}-01T12:00:00`).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })
  return <section className="finance-overview finance-kpi" aria-label="Finanzkennzahlen">
    <div className="finance-overview-heading"><h2>Kennzahlen im Verlauf</h2><p>{current ? `${label(current.month)} · letzter abgeschlossener Monat in der Auswahl${previous ? `, Vergleich mit ${label(previous.month)}` : ''}` : 'Noch kein abgeschlossener Monat in der Auswahl'}</p></div>
    <div className="finance-table-scroll"><table className="finance-table"><thead><tr><th>Kennzahl</th><th>Monatswert</th><th>Zum Vormonat</th><th>Verlauf</th></tr></thead><tbody>{(['income', 'expense', 'net'] as const).map(key => {
      const name = key === 'income' ? 'Einnahmen' : key === 'expense' ? 'Ausgaben' : 'Saldo'
      const change = current && previous ? Math.round((current[key] - previous[key]) * 100) / 100 : null
      const trend = completed.slice(-12)
      return <tr key={key}><th scope="row">{name}</th><td className="finance-number">{current ? eur.format(current[key]) : '—'}</td><td className="finance-number">{change === null ? 'Kein Vergleich' : `${change > 0 ? '+' : ''}${eur.format(change)}`}</td><td><FinanceSparkline values={trend.map(row => row[key])} label={`${name}: ${trend.map(row => `${label(row.month)} ${eur.format(row[key])}`).join('; ')}`} /></td></tr>
    })}</tbody></table></div><p className="finance-footnote">Abgeschlossene Monate · Veränderung in Euro · Verlauf der letzten bis zu 12 Monate der Auswahl.</p>
  </section>
}
