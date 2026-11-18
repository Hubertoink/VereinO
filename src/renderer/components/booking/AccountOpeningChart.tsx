import type { AccountOpening } from '../../../../shared/accountOpening'
import { sumOpeningCents } from '../../../../shared/accountOpening'

const money = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })
const dateFormat = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium' })
const formatDate = (day: string) => dateFormat.format(new Date(day + 'T12:00:00'))

function dateLines(entries: AccountOpening[]) {
    const dates = new Map<string, number>()
    for (const entry of entries) dates.set(entry.date, (dates.get(entry.date) ?? 0) + entry.amountCents)
    return [...dates].sort(([a], [b]) => a.localeCompare(b)).map(([day, cents]) =>
        `Anfangsbestand am ${formatDate(day)} · ${money.format(cents / 100)}`)
}

export function OpeningCaption({ entries }: { entries: AccountOpening[] }) {
    if (!entries.length) return null
    const sameDate = entries.every(entry => entry.date === entries[0].date)
    const label = entries.length === 1 ? 'Anfangsbestand' : 'Anfangsbestände'
    return <div className="account-opening-caption">
        <i aria-hidden="true" /><span>inkl. {label}{sameDate ? ` am ${formatDate(entries[0].date)}` : ` (${entries.length})`} · <b>{money.format(sumOpeningCents(entries) / 100)}</b></span>
    </div>
}

export function OpeningMarker({ entries, x, y }: { entries?: AccountOpening[]; x: number; y: number }) {
    if (!entries?.length) return null
    return <circle className="account-opening-marker" cx={x} cy={y} r={4.5} vectorEffect="non-scaling-stroke">
        <title>{dateLines(entries).join(' · ')}</title>
    </circle>
}

export function OpeningTooltipLines({ entries }: { entries?: AccountOpening[] }) {
    return entries?.length ? <div className="account-opening-details">{dateLines(entries).map(line => <div key={line}>{line}</div>)}</div> : null
}
