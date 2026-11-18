import React from 'react'
import HoverTooltip from '../common/HoverTooltip'
import type { accountPositionAt } from '../../utils/accountBalance'

const money = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })
type AccountLine = { accountId: number | null; key: string; bookingNet?: number; color?: string | null }

type Props = { layout: 'classic' | 'plus' } & (
    | { kind: 'period'; income: number; expense: number; accounts?: AccountLine[]; filtered?: boolean; pending?: boolean }
    | { kind: 'position'; label: string; date: string; position?: ReturnType<typeof accountPositionAt> }
)

export default function BookingBalanceStat(props: Props) {
    const isPeriod = props.kind === 'period'
    const label = isPeriod ? (props.filtered ? 'Buchungssaldo' : 'Saldo') : props.label
    const value = isPeriod ? (props.pending ? undefined : Math.round((props.income - props.expense) * 100) / 100) : props.position?.saldo
    const title = isPeriod ? 'Saldo im gewählten Zeitraum' : `${label} am ${props.date}`
    const amounts = isPeriod
        ? [['Einnahmen', props.income], ['Ausgaben', -props.expense]] as const
        : props.position ? [['Anfangsbestand bis zum Stichtag', props.position.opening], ['Kontobewegungen bis zum Stichtag', props.position.saldo - props.position.opening]] as const : []
    const accounts = isPeriod
        ? props.accounts?.flatMap(a => a.bookingNet == null ? [] : [{ id: a.accountId, name: a.key, value: a.bookingNet, color: a.color }])
        : props.position?.accounts?.map(a => ({ ...a, value: a.balance }))
    const content = value == null ? undefined : <div>
        <div className="tooltip-modal__title">{title}</div>
        <div className="tooltip-modal__list">
            {amounts.map(([name, amount]) => <div className="tooltip-modal__row" key={name}><span>{name}</span><span>{money.format(amount)}</span></div>)}
            <div className="tooltip-modal__row"><strong>{label}</strong><strong>{money.format(value)}</strong></div>
        </div>
        {!!accounts?.length && <section className="booking-balance-accounts" aria-label="Konten">
            <div className="tooltip-modal__title">Konten</div>
            {accounts.map(a => <div key={a.id ?? 'none'} className="tooltip-modal__row">
                <span className="tooltip-modal__key" style={{ '--tooltip-dot': a.color || 'var(--border)' } as React.CSSProperties}><span className="tooltip-modal__dot" />{a.name}</span>
                <span>{money.format(a.value)}</span>
            </div>)}
        </section>}
    </div>
    const negative = value != null && value < 0
    return <HoverTooltip className="tooltip-modal" content={content}>{({ ref, props: events }) =>
        props.layout === 'classic'
            ? <div ref={ref} {...events} tabIndex={0} className={`filter-totals-stat filter-totals-stat--${isPeriod ? 'diff' : 'balance'} ${negative ? 'negative' : 'positive'}`}>
                <div className="filter-totals-stat__content"><span className="filter-totals-stat__label">{label}</span><span className="filter-totals-stat__value">{value == null ? '—' : money.format(value)}</span></div>
            </div>
            : <div ref={ref} {...events} tabIndex={0}><span>{label}{props.kind === 'position' && ` · ${props.date}`}</span><strong className={negative ? 'bp-negative' : 'bp-positive'}>{value == null ? '—' : money.format(value)}</strong></div>
    }</HoverTooltip>
}
