type Props = { years: number[]; from: string; to: string; onChange: (range: { from: string; to: string }) => void }

export default function YearRangeSelect({ years, from, to, onChange }: Props) {
    const year = from.slice(0, 4)
    const selected = year && from === `${year}-01-01` && to === `${year}-12-31` ? year : ''
    return <label className="filter-dropdown__field filter-dropdown__field--mt">
        <span className="filter-dropdown__label">Schnellauswahl Jahr</span>
        <select className="input" value={selected} onChange={event => {
            const value = event.target.value
            onChange({ from: value ? `${value}-01-01` : '', to: value ? `${value}-12-31` : '' })
        }}>
            <option value="">—</option>
            {years.map(value => <option key={value} value={value}>{value}</option>)}
        </select>
    </label>
}
