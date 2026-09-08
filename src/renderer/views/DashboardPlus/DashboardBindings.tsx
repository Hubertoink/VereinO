import React, { useEffect, useState } from 'react'
import type { RendererApi } from '../../../types/api'
const money = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })
type Binding = Awaited<ReturnType<RendererApi['bindings']['list']>>['rows'][number]
type Usage = Awaited<ReturnType<RendererApi['bindings']['usage']>>
export default function DashboardBindings({ from, to, revision }: { from: string; to: string; revision: number }) {
  const [rows, setRows] = useState<Array<{ binding: Binding; usage: Usage }> | null>(null)
  const [error, setError] = useState(false)
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    let alive = true
    setRows(null); setError(false)
    ;(async () => {
      const definitions = await window.api.bindings.list({ activeOnly: false })
      const relevant = definitions.rows.filter(binding => (!binding.startDate || binding.startDate <= to) && (!binding.endDate || binding.endDate >= from))
      const result: Array<{ binding: Binding; usage: Usage }> = []
      for (let index = 0; index < relevant.length; index += 8) {
        const batch = await Promise.all(relevant.slice(index, index + 8).map(async binding => ({ binding, usage: await window.api.bindings.usage({ earmarkId: binding.id, from, to }) })))
        if (!alive) return
        result.push(...batch)
      }
      if (alive) setRows(result)
    })().catch(() => { if (alive) setError(true) })
    return () => { alive = false }
  }, [from, to, revision, retry])
  if (error) return <p role="alert">Zweckbindungen konnten nicht geladen werden. <button className="btn" onClick={() => setRetry(value => value + 1)}>Erneut versuchen</button></p>
  if (!rows) return <p role="status">Zweckbindungen werden geladen …</p>
  return <><p className="dp-card-note">Einnahmen und Ausgaben im gewählten Zeitraum. Nettoverbrauch gegenüber dem hinterlegten Plan.</p><div className="dp-budget-tiles">{rows.length ? rows.map(({ binding, usage }) => {
    const spent = usage.released - usage.allocated
    const plan = usage.budget ?? binding.budget ?? 0
    return <div className="dp-budget-tile" key={binding.id}><div><strong>{binding.name}</strong><span>{binding.code}{!binding.isActive ? ' · inaktiv' : ''}</span></div><b>{money.format(spent)}</b><div className="dp-budget-track"><i style={{ width: `${plan > 0 ? Math.min(100, Math.max(0, spent / plan * 100)) : 0}%`, background: binding.color || 'var(--dp-accent)' }} /></div><p>{plan > 0 ? `von ${money.format(plan)} Plan · ${Math.round(spent / plan * 100)} %` : 'Kein Plan hinterlegt'}</p><p>Einnahmen {money.format(usage.allocated)}<br />Ausgaben {money.format(usage.released)}</p>{plan > 0 && spent > plan && <small className="dp-negative">Plan überschritten</small>}</div>
  }) : <p>Keine Zweckbindungen für diesen Zeitraum angelegt.</p>}</div></>
}
