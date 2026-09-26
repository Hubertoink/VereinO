export interface ReportBucket { month: string; gross: number }
export interface ReportMonth { month: string; income: number; expense: number; net: number; cumulative: number }
export interface ReportContext { from?: string; to?: string; today?: string }
const round = (n: number) => (Math.round(n * 100) / 100) || 0
const validMonth = (s: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(s)

/** Monthly API expenses are signed. Preserve refunds/reversals instead of taking absolute values. */
export function buildReportMonths(income: ReportBucket[], expense: ReportBucket[], from?: string, to?: string): ReportMonth[] {
  const keys = [...income, ...expense].map(b => b.month).filter(validMonth).sort()
  const start = from?.slice(0, 7) || keys[0]
  const end = to?.slice(0, 7) || keys[keys.length - 1]
  if (!start || !end || !validMonth(start) || !validMonth(end) || start > end) return []
  const ins = new Map(income.map(b => [b.month, b.gross]))
  const outs = new Map(expense.map(b => [b.month, b.gross]))
  const rows: ReportMonth[] = []
  let cumulative = 0
  const index = (value: string) => Number(value.slice(0, 4)) * 12 + Number(value.slice(5, 7)) - 1
  for (let cursor = index(start); cursor <= index(end); cursor++) {
    const month = `${String(Math.floor(cursor / 12)).padStart(4, '0')}-${String(cursor % 12 + 1).padStart(2, '0')}`
    const incoming = round(ins.get(month) || 0), outgoing = round(-(outs.get(month) || 0))
    const net = round(incoming - outgoing)
    cumulative = round(cumulative + net)
    rows.push({ month, income: incoming, expense: outgoing, net, cumulative })
  }
  return rows
}

export const reportAnalyticsCss = `
.report-analytics { color:var(--text,#222); background:var(--surface,#fff); border:1px solid var(--border,#ddd); border-radius:16px; padding:20px; margin:16px 0; min-width:0; }
.report-analytics h2 { font-size:17px; margin:0 0 6px; }
.report-analytics p { color:var(--text-dim,#666); font-size:12px; margin:6px 0 16px; }
.report-analytics .ra-scroll { overflow-x:auto; }
.report-analytics table { width:100%; border-collapse:collapse; font-size:13px; }
.report-analytics th,.report-analytics td { padding:10px 12px; text-align:right; border-bottom:1px solid var(--border,#ddd); font-variant-numeric:tabular-nums; white-space:nowrap; }
.report-analytics th:first-child,.report-analytics td:first-child { text-align:left; }
.report-analytics th { color:var(--text-dim,#666); font-size:12px; font-weight:500; }
.report-analytics svg { width:100px; height:28px; vertical-align:middle; color:var(--accent,#ea451c); }
.report-analytics summary { cursor:pointer; padding:14px 0; font-weight:600; }
.report-analytics summary span { margin-left:12px; font-size:12px; font-weight:400; color:var(--text-dim,#666); }
.report-analytics details { border-top:1px solid var(--border,#ddd); margin-top:12px; }
.report-analytics .ra-total { font-weight:600; }
.report-analytics th { background:color-mix(in srgb, var(--surface,#fff) 94%, var(--text,#222)); }
.report-analytics .ra-highlights { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:16px; margin:20px 0; }
.report-analytics .ra-highlight { border:1px solid var(--border,#ddd); border-radius:12px; padding:18px; background:linear-gradient(130deg,color-mix(in srgb,var(--accent,#ea451c) 5%,var(--surface,#fff)),var(--surface,#fff)); }
.report-analytics .ra-highlight small { display:block; color:var(--text-dim,#666); font-size:12px; }
.report-analytics .ra-highlight strong { display:block; font-size:26px; font-weight:600; margin:10px 0; letter-spacing:-.04em; }
.report-analytics .ra-track { height:5px; border-radius:4px; background:var(--border,#ddd); margin-top:12px; overflow:hidden; }
.report-analytics .ra-track i { display:block; height:100%; border-radius:4px; background:var(--accent,#ea451c); }
.report-analytics .ra-badge { display:inline-block; border-radius:6px; padding:4px 7px; background:color-mix(in srgb,var(--accent,#ea451c) 9%,var(--surface,#fff)); font-size:11px; font-weight:500; }
.report-analytics .ra-year--focus { border:1px solid var(--border,#ddd); border-radius:10px; padding:0 12px 10px; }
.report-analytics .ra-year--focus > summary { display:flex; flex-wrap:wrap; align-items:center; gap:8px; }
.report-analytics .ra-year--focus > summary::before { content:'▸'; }
.report-analytics .ra-year--focus[open] > summary::before { content:'▾'; }
.report-analytics .ra-year--focus > summary span { margin-left:0; }
.report-analytics .ra-year--focus > summary .ra-badge { margin-left:auto; color:var(--text,#222); }
.report-analytics summary:focus-visible { outline:2px solid var(--accent,#ea451c); outline-offset:3px; border-radius:4px; }
.report-analytics .ra-archive { border:1px dashed var(--border,#ddd); border-radius:10px; padding:0 12px; }
.report-analytics .ra-archive > summary { color:var(--text-dim,#666); font-size:13px; }
.report-analytics .ra-current-column { background:color-mix(in srgb,var(--accent,#ea451c) 6%,var(--surface,#fff)); }
@media (max-width:600px) { .report-analytics { padding:14px; } .report-analytics .ra-highlights { grid-template-columns:1fr; } .report-analytics summary span { display:block; margin:6px 0 0; } }
@media print {
 .report-analytics { border:0; border-radius:0; padding:0; break-before:page; }
 .report-analytics table { font-size:10px; }
 .report-analytics th,.report-analytics td { padding:6px; }
 .report-analytics .ra-scroll { overflow:visible; }
 .report-analytics tr { break-inside:avoid; }
 .report-analytics thead { display:table-header-group; }
 .report-analytics details { break-inside:avoid; }
 .report-analytics .ra-highlights { break-inside:avoid; }
 .report-analytics .ra-highlight strong { font-size:20px; }
 .report-analytics summary { list-style:none; }
 .report-analytics * { print-color-adjust:exact; -webkit-print-color-adjust:exact; }
}`

const eur = (n: number) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n)
const monthLabel = (month: string) => new Intl.DateTimeFormat('de-DE', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}-01T00:00:00Z`))
function sparkline(values: number[]) {
  const min = Math.min(0, ...values), max = Math.max(0, ...values)
  const points = values.map((v, i) => `${values.length === 1 ? 50 : 2 + i / (values.length - 1) * 96},${26 - (v - min) / (max - min || 1) * 24}`).join(' ')
  return `<svg viewBox="0 0 100 28" role="img" aria-label="Monatsverlauf"><polyline points="${points}" fill="none" stroke="currentColor" stroke-width="1.5"/>${values.length === 1 ? `<circle cx="50" cy="${points.split(',')[1]}" r="2" fill="currentColor"/>` : ''}</svg>`
}

/** Compare full calendar months only; never compare a partial current month with a full one. */
export function reportComparison(rows: ReportMonth[], context: ReportContext = {}) {
  const today = context.today || new Date().toLocaleDateString('en-CA')
  const end = context.to && context.to < today ? context.to : today
  const complete = rows.filter(row => {
    const [year, month] = row.month.split('-').map(Number)
    const last = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10)
    return (!context.from || `${row.month}-01` >= context.from) && last <= end
  })
  return complete.length >= 2 ? { previous: complete[complete.length - 2], current: complete[complete.length - 1] } : null
}

/** HTML contains only fixed labels, validated month keys and formatted numbers. Shared by screen and PDF. */
export function renderReportAnalytics(rows: ReportMonth[], print = false, context: ReportContext = {}): string {
  if (!rows.length) return '<section class="report-analytics"><h2>Kennzahlen und Monatsentwicklung</h2><p>Keine Monatswerte im gewählten Zeitraum.</p></section>'
  const total = (key: 'income' | 'expense' | 'net') => round(rows.reduce((sum, row) => sum + row[key], 0))
  const years = [...new Set(rows.map(r => r.month.slice(0, 4)))]
  if (!print) years.reverse()
  const today = context.today || new Date().toLocaleDateString('en-CA')
  const currentYear = today.slice(0, 4)
  const focusYear = years.includes(currentYear) ? currentYear : years[0]
  const comparison = reportComparison(rows, context)
  const coverage = total('expense') > 0 && total('income') >= 0 ? total('income') / total('expense') * 100 : null
  const highestExpense = rows.reduce((best, row) => row.expense > best.expense ? row : best, rows[0])
  const peak = Math.max(1, ...rows.flatMap(r => [Math.abs(r.income), Math.abs(r.expense), Math.abs(r.net)]))
  const cell = (n: number, key: string) => `<td style="background:rgba(${key === 'expense' || n < 0 ? '234,69,28' : '49,156,107'},${n === 0 ? 0 : 0.04 + Math.abs(n) / peak * .16})">${eur(n)}</td>`
  const yearTable = (year: string) => {
    const months = rows.filter(r => r.month.startsWith(year))
    const focus = !print && year === focusYear
    return `<details class="ra-year${focus ? ' ra-year--focus' : ''}" ${print || focus ? 'open' : ''}><summary>${year}<span>${months.length} Monate · Saldo ${eur(months.reduce((sum, r) => sum + r.net, 0))}</span>${focus ? `<span class="ra-badge">${year === currentYear ? 'Aktuelles Jahr' : 'Letztes Jahr im Zeitraum'}</span>` : ''}</summary><div class="ra-scroll"><table aria-label="Monatsvergleich ${year}"><thead><tr><th>Monat</th><th>Einnahmen</th><th>Ausgaben</th><th>Saldo</th><th>Saldo kumuliert</th></tr></thead><tbody>${months.map(r => `<tr><td>${monthLabel(r.month)}</td>${cell(r.income, 'income')}${cell(r.expense, 'expense')}${cell(r.net, 'net')}<td>${eur(r.cumulative)}</td></tr>`).join('')}</tbody></table></div></details>`
  }
  const otherYears = years.filter(year => year !== focusYear)
  return `<section class="report-analytics" aria-label="Kennzahlen und Monatsentwicklung">
    <h2>Kennzahlen und Monatsentwicklung</h2><p>${monthLabel(rows[0].month)} – ${monthLabel(rows[rows.length - 1].month)} · Brutto · ${rows.length} Kalendermonate, einschließlich Monaten ohne Bewegung</p>
    <div class="ra-highlights">
      <div class="ra-highlight"><small>Durch Einnahmen gedeckte Ausgaben</small><strong>${coverage == null ? '—' : `${new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 }).format(coverage)} %`}</strong><small>${coverage == null ? 'Bei diesen Einnahmen und Ausgaben nicht berechenbar' : 'Einnahmen ÷ Ausgaben im gewählten Zeitraum'}</small>${coverage == null ? '' : `<div class="ra-track" aria-hidden="true"><i style="width:${Math.min(100, coverage)}%"></i></div>`}</div>
      <div class="ra-highlight"><small>Stärkster Ausgabenmonat</small><strong>${highestExpense.expense > 0 ? eur(highestExpense.expense) : '—'}</strong><small>${highestExpense.expense > 0 ? monthLabel(highestExpense.month) : 'Keine positiven Monatsausgaben im Zeitraum'}</small></div>
    </div>
    <details class="ra-totals" ${print ? 'open' : ''}><summary>Kennzahlen zum Gesamtzeitraum<span>Summen, Monatsdurchschnitt und Verlauf</span></summary>
    <div class="ra-scroll"><table aria-label="Report-Kennzahlen"><thead><tr><th>Kennzahl</th><th>Gesamt</th><th>Ø pro Monat</th><th>Monatsverlauf</th></tr></thead><tbody>
    ${(['income', 'expense', 'net'] as const).map((key, i) => `<tr><td>${['Einnahmen', 'Ausgaben', 'Saldo'][i]}</td><td class="ra-total">${eur(total(key))}</td><td>${eur(total(key) / rows.length)}</td><td>${sparkline(rows.map(r => r[key]))}</td></tr>`).join('')}
    </tbody></table></div>
    </details>
    <details class="ra-comparison" ${print ? 'open' : ''}><summary>Veränderung zum Vormonat<span>${comparison ? `${monthLabel(comparison.current.month)} gegenüber ${monthLabel(comparison.previous.month)}` : 'Zwei vollständige Monate erforderlich'}</span></summary>
    ${comparison ? `<p>Die letzten zwei vollständigen Kalendermonate im gewählten Zeitraum. Laufende und angeschnittene Monate bleiben außen vor.</p><div class="ra-scroll"><table aria-label="Vormonatsvergleich"><thead><tr><th>Kennzahl</th><th>${monthLabel(comparison.previous.month)}</th><th class="ra-current-column">${monthLabel(comparison.current.month)}</th><th>Veränderung</th></tr></thead><tbody>${(['income', 'expense', 'net'] as const).map((key, i) => {
      const previous = comparison.previous[key], current = comparison.current[key], difference = round(current - previous)
      const percentage = previous > 0 && current >= 0 ? ` · ${new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1, signDisplay: 'exceptZero' }).format(difference / previous * 100)} %` : ''
      return `<tr><td>${['Einnahmen', 'Ausgaben', 'Saldo'][i]}</td><td>${eur(previous)}</td><td class="ra-current-column ra-total">${eur(current)}</td><td><span class="ra-badge">${difference > 0 ? '+' : ''}${eur(difference)}${percentage}</span></td></tr>`
    }).join('')}</tbody></table></div>` : '<p>Für einen aussagekräftigen Vergleich werden zwei vollständige Monate innerhalb der Auswahl benötigt.</p>'}
    </details>
    <p>Monatsvergleich · Stärkere Farbe bedeutet einen höheren Betrag. Saldo kumuliert ab Beginn des Zeitraums, kein Kontostand.</p>
    ${print ? years.map(yearTable).join('') : `${yearTable(focusYear)}${otherYears.length ? `<details class="ra-archive"><summary>Weitere Jahre (${otherYears.length})<span>Archiv aufklappen</span></summary>${otherYears.map(yearTable).join('')}</details>` : ''}`}
  </section>`
}
