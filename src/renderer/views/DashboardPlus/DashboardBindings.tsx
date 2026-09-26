import EarmarkUsageCards from '../../components/tiles/EarmarkUsageCards'
import React, { useEffect, useState } from 'react'
import type { RendererApi } from '../../../types/api'
const money = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })
type Binding = Awaited<ReturnType<RendererApi['bindings']['list']>>['rows'][number]
type Usage = Awaited<ReturnType<RendererApi['bindings']['usage']>>
export default function DashboardBindings({ from, to, revision }: { from: string; to: string; revision: number }) {
  const [rows, setRows] = useState<Binding[] | null>(null)
  const [error, setError] = useState(false)
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    let alive = true
    setRows(null); setError(false)
    ;(async () => {
      const definitions = await window.api.bindings.list({ activeOnly: false })
      const relevant = definitions.rows.filter(binding => (!binding.startDate || binding.startDate <= to) && (!binding.endDate || binding.endDate >= from))
      if (alive) setRows(relevant)
    })().catch(() => { if (alive) setError(true) })
    return () => { alive = false }
  }, [from, to, revision, retry])
  if (error) return <p role="alert">Zweckbindungen konnten nicht geladen werden. <button className="btn" onClick={() => setRetry(value => value + 1)}>Erneut versuchen</button></p>
  if (!rows) return <p role="status">Zweckbindungen werden geladen …</p>
  return <EarmarkUsageCards bindings={rows} from={from} to={to} revision={revision} compact />
}
