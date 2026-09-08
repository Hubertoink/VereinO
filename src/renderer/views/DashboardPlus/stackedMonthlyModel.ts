import type { RendererApi } from '../../../types/api'
export type StackVoucher = Awaited<ReturnType<RendererApi['vouchers']['list']>>['rows'][number]
export type StackGroup = 'tags' | 'classification'
export type StackSeries = { key: string; label: string; color?: string | null }
const spheres: Record<string, string> = { IDEELL: 'Ideell', ZWECK: 'Zweckbetrieb', VERMOEGEN: 'Vermögen', WGB: 'Wirtschaftlich' }

export function stackedMonths(rows: StackVoucher[], keys: string[], kind: 'IN' | 'OUT', group: StackGroup, general: boolean, tagColors: Record<string, string | null | undefined> = {}) {
  const series = new Map<string, StackSeries>()
  const monthly = new Map(keys.map(month => [month, new Map<string, number>()]))
  for (const row of rows) {
    if (row.type !== kind) continue
    const values = monthly.get(row.date.slice(0, 7))
    if (!values) continue
    let groups: StackSeries[]
    if (group === 'tags') {
      const tags = [...new Set(row.tags || [])].sort((a, b) => a.localeCompare(b, 'de'))
      groups = tags.length ? tags.map(label => ({ key: `tag:${label}`, label, color: tagColors[label] })) : [{ key: 'untagged', label: 'Ohne Tag' }]
    } else groups = general ? [{ key: `category:${row.primaryClassificationValueId || 0}`, label: row.primaryClassificationName || 'Ohne Kategorie', color: row.primaryClassificationColor }] : [{ key: row.sphere, label: spheres[row.sphere] || row.sphere }]
    const cents = Math.round(row.grossAmount * 100)
    const share = Math.trunc(cents / groups.length)
    const remainder = cents - share * groups.length
    groups.forEach((item, index) => {
      series.set(item.key, item)
      const amount = share + (index < Math.abs(remainder) ? Math.sign(remainder) : 0)
      values.set(item.key, (values.get(item.key) || 0) + amount)
    })
  }
  const ordered = [...series.values()].sort((a, b) => a.label.localeCompare(b.label, 'de'))
  const months = keys.map(month => {
    const entries = ordered.map(item => ({ ...item, amount: (monthly.get(month)?.get(item.key) || 0) / 100 }))
    return { month, entries, total: Math.round(entries.reduce((sum, item) => sum + item.amount, 0) * 100) / 100, positive: entries.reduce((sum, item) => sum + Math.max(0, item.amount), 0), negative: entries.reduce((sum, item) => sum + Math.min(0, item.amount), 0) }
  })
  return { series: ordered, months }
}
