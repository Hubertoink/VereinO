import React from 'react'
import './financeOverview.css'

export default function FinanceSparkline({ values, label }: { values: number[]; label: string }) {
  if (!values.length) return <span className="finance-muted">Keine Monatswerte</span>
  const min = Math.min(...values)
  const max = Math.max(...values)
  const points = values.map((value, i) => ({ x: values.length === 1 ? 60 : 4 + i * 112 / (values.length - 1), y: max === min ? 20 : 35 - (value - min) / (max - min) * 30 }))
  return <svg className="finance-sparkline" viewBox="0 0 120 40" role="img" aria-label={label}>
    <title>{label}</title>
    <path d="M4 37H116" stroke="currentColor" opacity=".15" />
    <polyline points={points.map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r="3" fill="currentColor" />
  </svg>
}
