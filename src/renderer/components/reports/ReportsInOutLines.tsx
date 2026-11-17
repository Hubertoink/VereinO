import { useReportChartWidth } from './useReportChartWidth'
import { niceStep } from '../../../../shared/chartScale'
import { useMemo, useState } from 'react';
import type { ReportMonthlyModel } from './reportMonthlyData'

export default function ReportsInOutLines(props: { activateKey?: number; from?: string; to?: string; data: ReportMonthlyModel; loading: boolean }) {
  const { data, loading } = props
  const eurFmt = useMemo(() => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }), [])
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  const { containerRef, containerW } = useReportChartWidth(loading, props.activateKey)
  const { months, incomeByMonth, expenseByMonth, maxMagnitude: maxVal } = data
  const margin = { top: 22, right: 35, bottom: 48, left: 100 }
  const innerH = 188
  const height = innerH + margin.top + margin.bottom
  let baseStep = 54
  const minWidth = Math.max(340, months.length * baseStep + margin.left + margin.right)
  const width = Math.max(containerW || 0, minWidth)
  let step = baseStep
  if (containerW && months.length > 1) {
    const innerW = width - (margin.left + margin.right)
    step = innerW / (months.length - 1)
  }
  const xFor = (idx: number) => months.length === 1 ? (margin.left + width - margin.right) / 2 : margin.left + idx * step
  const yFor = (val: number) => margin.top + (innerH - Math.round((Math.abs(val) / maxVal) * innerH))
  const monthLabel = (m: string, withYear = false) => {
    const [y, mm] = m.split('-').map(Number)
    const d = new Date(Date.UTC(y, (mm - 1) as number, 1))
    const mon = d.toLocaleString('de-DE', { month: 'short' }).replace('.', '')
    return withYear ? `${mon} ${y}` : mon
  }
  const years = useMemo(() => Array.from(new Set(months.map(m => m.slice(0, 4)))), [months])
  const yearText = useMemo(() => {
    const fy = props.from?.slice(0, 4)
    const ty = props.to?.slice(0, 4)
    if (fy && ty && fy === ty) return fy
    if (years.length === 0) return ''
    return years.length === 1 ? years[0] : `${years[0]}–${years[years.length - 1]}`
  }, [props.from, props.to, years])
  const points = (values: ReadonlyMap<string, number>) => months.map((m, i) => `${xFor(i)},${yFor(values.get(m) || 0)}`).join(' ')
  
  // Y-Achse Ticks

  const yTicks = (() => {
    const step = niceStep(maxVal, 6)
    const arr: number[] = []
    for (let v = 0; v <= maxVal; v += step) arr.push(Math.round(v))
    return arr
  })()
  return (
    <div className="dp-card report-chart-card">
      <div className="dp-card-heading report-chart-header">
        <h2>Einnahmen & Ausgaben im Vergleich</h2>
        <div className="legend">
          <span className="legend-item"><span className="legend-swatch legend-swatch-in"></span>Einnahmen</span>
          <span className="legend-item"><span className="legend-swatch legend-swatch-out"></span>Ausgaben</span>
        </div>
      </div>
      {loading && <div>Lade …</div>}
      {!loading && (
        <div ref={containerRef} className="report-chart-scroll">
          {(() => {
            const idx = (typeof hoverIdx === 'number' ? hoverIdx : null)
            if (idx == null || !months[idx]) return null
            const m = months[idx]
            const inn = incomeByMonth.get(m) || 0
            const out = expenseByMonth.get(m) || 0
            const gx = xFor(idx)
            const tooltipX = (gx / width) * 100
            return (
              <div className="report-chart-tooltip" style={{ left: `clamp(0px, calc(${tooltipX}% - 120px), max(0px, 100% - 240px))` }}>
                <strong>{monthLabel(m, true)}</strong>
                <div><span>Einnahmen</span><b>{eurFmt.format(inn)}</b></div>
                <div><span>Ausgaben</span><b>{eurFmt.format(Math.abs(out))}</b></div>
              </div>
            )
          })()}
          <svg width={width} height={height} role="img" aria-label="IN vs OUT">
            {/* Y-Achse Grid + Labels */}
            {yTicks.map((v, i) => (
              <g key={i}>
                <line x1={margin.left} x2={width - margin.right} y1={yFor(v)} y2={yFor(v)} stroke="var(--border)" opacity={0.25} />
                <text x={margin.left - 6} y={yFor(v) + 4} fill="var(--text-dim)" fontSize={11} fontWeight={500} textAnchor="end">{eurFmt.format(v)}</text>
              </g>
            ))}
            <polyline fill="none" stroke="var(--dp-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" points={points(incomeByMonth)} />
            <polyline fill="none" stroke="var(--dp-amber)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="5 4" points={points(expenseByMonth)} />
            {months.map((m, i) => (
              <g key={m} style={{ cursor: 'pointer' }}>
                {(() => {
                  const left = (i === 0 ? margin.left : Math.round((xFor(i - 1) + xFor(i)) / 2))
                  const right = (i === months.length - 1 ? (width - margin.right) : Math.round((xFor(i) + xFor(i + 1)) / 2))
                  const hitX = Math.max(margin.left, left)
                  const hitW = Math.max(8, right - left)
                  return (
                    <rect x={hitX} y={margin.top} width={hitW} height={innerH} fill="transparent"
                      onMouseEnter={() => setHoverIdx(i)} onMouseLeave={() => setHoverIdx(null)} onClick={() => setHoverIdx(i)}
                      onDoubleClick={() => {
                        const [yy, mm] = m.split('-').map(Number)
                        const from = new Date(Date.UTC(yy, (mm - 1) as number, 1)).toISOString().slice(0, 10)
                        const to = new Date(Date.UTC(yy, (mm - 1) as number + 1, 0)).toISOString().slice(0, 10)
                        const ev = new CustomEvent('apply-budget-jump', { detail: { from, to } })
                        window.dispatchEvent(ev)
                      }} />
                  )
                })()}
                <circle cx={xFor(i)} cy={yFor(incomeByMonth.get(m) || 0)} r={3} fill="var(--dp-accent)">
                  <title>{`IN ${monthLabel(m, true)}: ${eurFmt.format(incomeByMonth.get(m) || 0)}`}</title>
                </circle>
                <circle cx={xFor(i)} cy={yFor(expenseByMonth.get(m) || 0)} r={3} fill="var(--dp-amber)">
                  <title>{`OUT ${monthLabel(m, true)}: ${eurFmt.format(expenseByMonth.get(m) || 0)}`}</title>
                </circle>
                <text x={xFor(i)} y={margin.top + innerH + 18} textAnchor="middle" fontSize="10">{monthLabel(m, years.length > 1)}</text>
              </g>
            ))}
            {yearText && (
              <text x={Math.round(width / 2)} y={margin.top + innerH + 34} textAnchor="middle" fontSize="11" fill="var(--text-dim)">{yearText}</text>
            )}
          </svg>
        </div>
      )}
    </div>
  )
}
