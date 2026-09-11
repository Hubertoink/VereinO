import PartyName from '../../components/common/PartyName'
import RecentBookingsDropdown from './RecentBookingsDropdown'
import DateFilterInput from '../../components/common/DateFilterInput'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { IconArrowDown, IconArrowUp, IconArrowsExchange, IconChevronLeft, IconChevronsLeft, IconCopy, IconWallet, IconTargetArrow, IconChevronRight, IconFilter, IconPaperclip, IconPencil, IconPlus, IconReceipt2, IconSearch, IconTrash, IconX } from '@tabler/icons-react'
import type { RendererApi } from '../../../types/api'
import AttachmentsModal from '../../components/modals/AttachmentsModal'
import VoucherInfoModal from '../../components/modals/VoucherInfoModal'
import InvoiceBatchControl from '../../components/InvoiceBatchControl'
import ReceiptThumbnail, { type ReceiptPreviewCache } from '../../components/ReceiptThumbnail'
import { addDataChangedListener, dispatchDataChanged } from '../../utils/refresh'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import { IconBank, IconCash, IconPayPal } from '../../utils/icons'
import { getContrastTextColor, resolveTagDisplayColor } from '../../utils/tagColors'
import { calendarDays, isoDate, kinds, monthRange, mutationBlock, paymentLabel, signedAmount, similarQuery, spheres, type BookingPlusRow } from './bookingPlusHelpers'
import './bookingsPlus.css'

type Props = {
    onResetFilters: () => void
    externalFilters?: Partial<Filter>
    jumpRevision?: number
    flashId?: number | null
    showBookingDraftTabs?: boolean
    bookingDraftTabs?: Array<{ id: string; label: string; title: string; type: 'IN' | 'OUT' | 'TRANSFER' | 'INTERNAL'; isActive: boolean; isDetached?: boolean }>
    onOpenBookingDraft?: (id: string) => void
    onCloseBookingDraft?: (id: string) => void
    fmtDate: (date: string) => string
    onNewBooking: () => void
    onNewInvoice: React.ComponentProps<typeof InvoiceBatchControl>['onNewInvoice']
    onReviewInvoice: (id: number) => void
    notify: (type: 'info' | 'success' | 'error', message: string) => void
    paymentAccounts: Array<{ id: number; name: string }>
    budgets: Array<{ id: number; label: string; color?: string | null }>
    earmarks: Array<{ id: number; code: string; name: string; color?: string | null }>
    tagDefs: Array<{ id: number; name: string; color?: string | null }>
    allowVoucherDeletion: boolean
    closedUntil?: string | null
    generalProfile: boolean
}
type Filter = { q: string; from: string; to: string; type: string; sphere: string; classification: string; account: string; budget: string; earmark: string; tag: string }
const emptyFilters: Filter = { q: '', from: '', to: '', type: '', sphere: '', classification: '', account: '', budget: '', earmark: '', tag: '' }
const money = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })
const signedMoney = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', signDisplay: 'exceptZero' })
const prettyDate = (date: string) => new Date(`${date.slice(0, 10)}T12:00:00`).toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' })
const limit = 20

export default function BookingsPlusView({ onResetFilters, externalFilters, jumpRevision, flashId, showBookingDraftTabs, bookingDraftTabs = [], onOpenBookingDraft, onCloseBookingDraft, fmtDate, onNewBooking, onNewInvoice, onReviewInvoice, notify, paymentAccounts, budgets, earmarks, tagDefs, allowVoucherDeletion, closedUntil, generalProfile }: Props) {
    const [filters, setFilters] = useState<Filter>(() => ({ ...emptyFilters, ...externalFilters }))
    const q = useDebouncedValue(filters.q.trim(), 250)
    const batchNotify = useCallback((type: 'info' | 'success' | 'error' | 'warn', message: string) => notify(type === 'warn' ? 'info' : type, message), [notify])
    const [classifications, setClassifications] = useState<Array<{ id: number; name: string }>>([])
    useEffect(() => {
        let alive = true
        if (generalProfile) void window.api.classifications.primary.list().then(result => { if (alive) setClassifications(result.values) }).catch(() => { if (alive) notify('error', 'Kategorien konnten nicht geladen werden.') })
        return () => { alive = false }
    }, [generalProfile, notify])
    const [month, setMonth] = useState(() => isoDate(new Date()).slice(0, 7))
    const [receiptDays, setReceiptDays] = useState<Set<string>>(new Set())
    const [calendarState, setCalendarState] = useState<'loading' | 'ready' | 'error'>('loading')
    const [moreFiltersOpen, setMoreFiltersOpen] = useState(false)
    const [allTagsOpen, setAllTagsOpen] = useState(false)
    const [page, setPage] = useState(1)
    const [sortBy, setSortBy] = useState<'date' | 'description' | 'payment' | 'gross'>('date')
    const [sort, setSort] = useState<'DESC' | 'ASC'>('DESC')
    const [rows, setRows] = useState<BookingPlusRow[]>([])
    const [total, setTotal] = useState(0)
    const [summary, setSummary] = useState<Awaited<ReturnType<RendererApi['reports']['summary']>> | null>(null)
    const [selected, setSelected] = useState<BookingPlusRow | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [revision, setRevision] = useState(0)
    const [detailOpen, setDetailOpen] = useState(false)
    const [filtersOpen, setFiltersOpen] = useState(false)
    const [metaEditing, setMetaEditing] = useState(false)
    const metaEditingRef = useRef(false)
    metaEditingRef.current = metaEditing
    const [infoOpen, setInfoOpen] = useState(false)
    const [attachments, setAttachments] = useState<BookingPlusRow | null>(null)
    const [confirm, setConfirm] = useState<BookingPlusRow | null>(null)
    const [busy, setBusy] = useState(false)
    useEffect(() => {
        if (!confirm || busy) return
        const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); setConfirm(null) } }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [confirm, busy])
    const [similarTo, setSimilarTo] = useState<BookingPlusRow | null>(null)
    const [similarRows, setSimilarRows] = useState<BookingPlusRow[]>([])
    const [similarLoading, setSimilarLoading] = useState(false)
    const [similarError, setSimilarError] = useState('')
    const cache = useRef<ReceiptPreviewCache>(new Map())
    const lastRowButton = useRef<HTMLButtonElement | null>(null)
    const inspector = useRef<HTMLElement | null>(null)
    const [narrow, setNarrow] = useState(() => window.matchMedia('(max-width: 1250px)').matches)
    useEffect(() => {
        const media = window.matchMedia('(max-width: 1250px)')
        const changed = () => { setNarrow(media.matches); setDetailOpen(false) }
        media.addEventListener('change', changed)
        return () => media.removeEventListener('change', changed)
    }, [])
    useEffect(() => {
        if (!externalFilters) return
        setFilters({ ...emptyFilters, ...externalFilters }); setPage(1)
        setSelected(null); setMetaEditing(false); setSimilarTo(null)
    }, [externalFilters, jumpRevision])
    useEffect(() => {
        if (!flashId) return
        const target = rows.find(row => row.id === flashId)
        if (target) { setSelected(target); setDetailOpen(true) }
    }, [flashId, rows])
    const update = (key: keyof Filter, value: string) => { setFilters(current => ({ ...current, [key]: value })); setPage(1) }
    const refresh = useCallback(() => { cache.current.clear(); setRevision(value => value + 1) }, [])
    useEffect(() => addDataChangedListener(['vouchers'], refresh), [refresh])
    useEffect(() => window.api.organizations.onSwitched(() => {
        setFilters(emptyFilters); setPage(1); setRows([]); setSummary(null); setTotal(0); setSelected(null); setDetailOpen(false)
        setInfoOpen(false); setMetaEditing(false); setAttachments(null); setConfirm(null); setSimilarTo(null); refresh()
    }), [refresh])
    useEffect(() => {
        let alive = true
        setReceiptDays(new Set()); setCalendarState('loading')
        void (async () => {
            const days = new Set<string>()
            let offset = 0
            while (alive) {
                const result = await window.api.vouchers.list({ ...monthRange(month), limit: 100, offset, sort: 'ASC' })
                if (!alive) return
                result.rows.forEach(row => days.add(row.date.slice(0, 10)))
                offset += result.rows.length
                if (!result.rows.length || offset >= result.total) break
            }
            if (alive) { setReceiptDays(days); setCalendarState('ready') }
        })().catch(() => { if (alive) setCalendarState('error') })
        return () => { alive = false }
    }, [month, revision])
    const visibleMonthRange = monthRange(month)
    const monthSelected = filters.from === visibleMonthRange.from && filters.to === visibleMonthRange.to
    const allDates = !filters.from && !filters.to
    const clearDates = () => { setFilters(current => ({ ...current, from: '', to: '' })); setPage(1) }
    const selectMonth = () => { if (monthSelected) clearDates(); else { setFilters(current => ({ ...current, ...visibleMonthRange })); setPage(1) } }
    const payload = useMemo(() => ({
        q: q || undefined, from: filters.from || undefined, to: filters.to || undefined,
        type: (filters.type || undefined) as BookingPlusRow['type'] | undefined,
        sphere: !generalProfile ? (filters.sphere || undefined) as BookingPlusRow['sphere'] | undefined : undefined,
        primaryClassificationValueId: generalProfile && filters.classification ? Number(filters.classification) : undefined,
        paymentAccountId: filters.account ? Number(filters.account) : undefined,
        budgetId: filters.budget ? Number(filters.budget) : undefined,
        earmarkId: filters.earmark ? Number(filters.earmark) : undefined,
        tag: filters.tag || undefined
    }), [q, filters.from, filters.to, filters.type, filters.sphere, filters.account, filters.budget, filters.earmark, filters.tag, filters.classification, generalProfile])
    const invalidRange = !!(filters.from && filters.to && filters.from > filters.to)
    useEffect(() => {
        let alive = true
        if (invalidRange) { setLoading(false); return }
        setLoading(true); setError('')
        void Promise.all([
            window.api.vouchers.list({ ...payload, limit, offset: (page - 1) * limit, sort, sortBy }),
            window.api.reports.summary(payload)
        ]).then(([result, totals]) => {
            if (!alive) return
            const last = Math.max(1, Math.ceil(result.total / limit))
            if (page > last) { setPage(last); return }
            setRows(result.rows); setTotal(result.total); setSummary(totals)
            setSelected(current => metaEditingRef.current && current ? current : result.rows.find(row => row.id === current?.id) || result.rows[0] || null)
        }).catch((cause: unknown) => { if (alive) { console.error('Buchungen Plus: Laden fehlgeschlagen', cause); setError(String(cause).includes('sortBy') ? 'Die laufende App unterstützt diese Sortierung noch nicht. Bitte VereinO vollständig neu starten.' : 'Buchungen konnten nicht geladen werden. Bitte erneut versuchen.') } }).finally(() => { if (alive) setLoading(false) })
        return () => { alive = false }
    }, [payload, page, sort, sortBy, revision, invalidRange])
    useEffect(() => {
        if (!similarTo) return
        let alive = true
        setSimilarLoading(true); setSimilarError(''); setSimilarRows([])
        void window.api.vouchers.list({ q: similarQuery(similarTo), type: similarTo.type, limit: 12, sort: 'DESC' }).then(result => {
            if (alive) setSimilarRows(result.rows.filter(row => row.id !== similarTo.id).slice(0, 5))
        }).catch(() => { if (alive) setSimilarError('Ähnliche Buchungen konnten nicht geladen werden.') }).finally(() => { if (alive) setSimilarLoading(false) })
        return () => { alive = false }
    }, [similarTo, revision])
    const closeDetails = useCallback(() => { setDetailOpen(false); setMetaEditing(false); lastRowButton.current?.focus() }, [])
    useEffect(() => {
        if (!narrow || !detailOpen || attachments || infoOpen || confirm) return
        inspector.current?.focus()
        const handle = (event: KeyboardEvent) => {
            if (event.key === 'Escape') { event.preventDefault(); closeDetails() }
            if (event.key === 'Tab') {
                const buttons = inspector.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input, select, textarea')
                if (!buttons?.length) return
                const first = buttons[0], last = buttons[buttons.length - 1]
                if (event.shiftKey && (document.activeElement === first || document.activeElement === inspector.current)) { event.preventDefault(); last.focus() }
                else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
            }
        }
        window.addEventListener('keydown', handle)
        return () => window.removeEventListener('keydown', handle)
    }, [narrow, detailOpen, attachments, infoOpen, confirm, closeDetails])
    const selectRow = (row: BookingPlusRow, button?: HTMLButtonElement, openInfo = false) => { if (metaEditing) { notify('info', 'Bitte die Bearbeitung zuerst speichern oder abbrechen.'); return }; setSelected(row); setDetailOpen(true); if (openInfo) setInfoOpen(true); setSimilarTo(null); if (button) lastRowButton.current = button }
    const changeMonth = (offset: number) => {
        const date = new Date(`${month}-01T12:00:00`); date.setMonth(date.getMonth() + offset)
        setMonth(isoDate(date).slice(0, 7))
    }
    const edit = async () => {
        if (!selected || busy) return
        if (!allowVoucherDeletion) {
            if (!selected.originalId && !selected.reversedById) setMetaEditing(true)
            return
        }
        const reason = mutationBlock(selected, closedUntil)
        if (reason) { notify('info', reason); return }
        setBusy(true)
        try {
            const result = await window.api.quickAdd.openDetached({ mode: 'edit', draftId: `edit-${selected.id}`, voucherId: selected.id, qa: selected, files: [] })
            if (!result.ok) throw new Error(result.error || 'Bearbeitungsfenster konnte nicht geöffnet werden.')
        } catch (error) { notify('error', error instanceof Error ? error.message : String(error)) } finally { setBusy(false) }
    }
    const saveMeta: NonNullable<React.ComponentProps<typeof VoucherInfoModal>['onSaveMeta']> = async payload => {
        if (!selected || selected.originalId || selected.reversedById) throw new Error('Diese Buchung kann nicht geändert werden.')
        const id = selected.id
        await window.api.vouchers.updateMeta({ id, ...payload })
        const result = await window.api.vouchers.list({ limit: 1, voucherIds: [id] })
        if (result.rows[0]) setSelected(result.rows[0])
        setMetaEditing(false)
        refresh(); dispatchDataChanged(['vouchers'])
    }
    const remove = async () => {
        if (!confirm || busy) return
        setBusy(true)
        try {
            if (allowVoucherDeletion) await window.api.vouchers.delete({ id: confirm.id })
            else await window.api.vouchers.reverse({ originalId: confirm.id, reason: 'Storno über Buchungen Plus' })
            setConfirm(null); setSimilarTo(null); refresh(); dispatchDataChanged(['vouchers']); notify('success', allowVoucherDeletion ? 'Buchung gelöscht' : 'Buchung storniert')
        } catch (error) { notify('error', error instanceof Error ? error.message : String(error)) } finally { setBusy(false) }
    }
    const income = summary?.byType.find(item => item.key === 'IN')?.gross || 0
    const expense = Math.abs(summary?.byType.find(item => item.key === 'OUT')?.gross || 0)
    const hasActiveFilters = Object.values(filters).some(value => value.trim())
    const classificationLabel = (row: BookingPlusRow) => generalProfile ? row.primaryClassificationName || '—' : spheres[row.sphere]
    const paymentBadge = (row: BookingPlusRow) => {
        const badge = (label: string, kind: BookingPlusRow['paymentAccountKind'], method: BookingPlusRow['paymentMethod'], color?: string | null) => <span className="bp-payment-badge" style={{ borderColor: color || undefined }}><span className="bp-payment-icon">{kind === 'PAYPAL' ? <IconPayPal size={14} color={color || undefined} /> : kind === 'CASH' || method === 'BAR' ? <IconCash size={14} color={color || undefined} /> : <IconBank size={14} color={color || undefined} />}</span><span>{label}</span></span>
        if (row.type === 'INTERNAL') return <span className="bp-payment-badge"><IconArrowsExchange size={14} />Intern</span>
        if (row.type === 'TRANSFER') return <span className="bp-payment-transfer">{badge(row.transferFromAccountName || (row.transferFrom === 'BAR' ? 'Bar' : 'Bank'), row.transferFromAccountKind, row.transferFrom, row.transferFromAccountColor)}<span aria-label="nach">→</span>{badge(row.transferToAccountName || (row.transferTo === 'BAR' ? 'Bar' : 'Bank'), row.transferToAccountKind, row.transferTo, row.transferToAccountColor)}</span>
        return badge(paymentLabel(row), row.paymentAccountKind, row.paymentMethod, row.paymentAccountColor)
    }
    const sortColumn = (key: typeof sortBy, label: string) => <button type="button" className={sortBy === key ? 'is-active' : ''} aria-label={`Nach ${label} sortieren${sortBy === key ? (sort === 'ASC' ? ', aufsteigend' : ', absteigend') : ''}`} onClick={() => { setSort(sortBy === key ? (sort === 'ASC' ? 'DESC' : 'ASC') : key === 'date' || key === 'gross' ? 'DESC' : 'ASC'); setSortBy(key); setPage(1) }}>{label}{sortBy === key && (sort === 'ASC' ? <IconArrowUp size={13} /> : <IconArrowDown size={13} />)}</button>
    const editBlocked = selected ? (allowVoucherDeletion ? mutationBlock(selected, closedUntil) : selected.originalId || selected.reversedById ? 'Diese Buchung ist Teil einer Storno-Kette.' : '') : ''
    const blocked = selected ? mutationBlock(selected, closedUntil) : ''
    const tags = (names: string[]) => names.map(name => {
        const color = resolveTagDisplayColor(name, tagDefs)
        return <span key={name} className="bp-tag" style={color ? { background: color, color: getContrastTextColor(color) } : undefined}>{name}</span>
    })
    const selectFilter = (key: keyof Filter, label: string, options: Array<{ value: string; label: string }>) => <label className="bp-field">{label}<select className="input" value={filters[key]} onChange={event => update(key, event.target.value)}><option value="">Alle</option>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
    const chipFilter = (key: keyof Filter, label: string, options: Array<{ value: string; label: string; color?: string | null }>) => <fieldset className="bp-chip-filter"><legend>{label}</legend><div className="bp-filter-chips"><button type="button" className={`bp-filter-chip${!filters[key] ? ' is-active' : ''}`} aria-pressed={!filters[key]} onClick={() => update(key, '')}>Alle</button>{options.map(option => <button type="button" key={option.value} className={`bp-filter-chip${filters[key] === option.value ? ' is-active' : ''}`} aria-pressed={filters[key] === option.value} style={option.color ? { '--bp-chip-color': option.color, ...(filters[key] === option.value ? { background: option.color, color: getContrastTextColor(option.color) } : {}) } as React.CSSProperties : undefined} onClick={() => update(key, filters[key] === option.value ? '' : option.value)}>{option.label}</button>)}</div></fieldset>
    const assignmentBadges = (row: BookingPlusRow) => {
        const assignedBudgets = row.budgets?.length ? row.budgets : row.budgetId ? [{ budgetId: row.budgetId, label: row.budgetLabel, color: row.budgetColor, amount: row.budgetAmount }] : []
        const assignedEarmarks = row.earmarksAssigned?.length ? row.earmarksAssigned : row.earmarkId ? [{ earmarkId: row.earmarkId, code: row.earmarkCode, amount: row.earmarkAmount }] : []
        if (!assignedBudgets.length && !assignedEarmarks.length) return null
        return <span className="bp-row-assignments">{assignedBudgets.map(item => {
            const definition = budgets.find(budget => budget.id === item.budgetId)
            const label = item.label || definition?.label || `#${item.budgetId}`
            const color = item.color || definition?.color
            return <span key={`budget-${item.budgetId}`} className="bp-assignment-badge" style={color ? { background: color, color: getContrastTextColor(color) } : undefined} title={`Budget: ${label}${item.amount != null ? ` · ${money.format(item.amount)}` : ''}`}><IconWallet size={13} /><span>{label}</span></span>
        })}{assignedEarmarks.map(item => {
            const definition = earmarks.find(earmark => earmark.id === item.earmarkId)
            const label = item.code || definition?.code || `#${item.earmarkId}`
            const color = ('color' in item ? item.color : null) || definition?.color
            return <span key={`earmark-${item.earmarkId}`} className="bp-assignment-badge" style={color ? { background: color, color: getContrastTextColor(color) } : undefined} title={`Zweckbindung: ${label}${definition?.name ? ` · ${definition.name}` : ''}${item.amount != null ? ` · ${money.format(item.amount)}` : ''}`}><IconTargetArrow size={13} /><span>{label}</span></span>
        })}</span>
    }
    return <div className="bookings-plus">
        <aside className={`bp-sidebar${filtersOpen ? ' bp-sidebar--open' : ''}`} aria-label="Kalender und Buchungsfilter">
            <button className="btn bp-filter-toggle" onClick={() => setFiltersOpen(value => !value)} aria-expanded={filtersOpen} aria-controls="bp-filters"><IconFilter size={18} />Kalender & Filter</button>
            <div id="bp-filters" className="bp-filter-content">
                <section className="bp-panel bp-calendar" aria-label="Kalender">
                    <div className="bp-calendar-heading"><button className="btn ghost" aria-label="Vorheriger Monat" onClick={() => changeMonth(-1)}><IconChevronLeft size={16} /></button><button className={`bp-month-select${monthSelected ? ' is-active' : ''}`} aria-pressed={monthSelected} title="Monat filtern / Monatsfilter aufheben" onClick={selectMonth}>{new Date(`${month}-01T12:00:00`).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })}</button><button className="btn ghost" aria-label="Nächster Monat" onClick={() => changeMonth(1)}><IconChevronRight size={16} /></button></div>
                    <div className="bp-days">{['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map(day => <span className="bp-weekday" key={day}>{day}</span>)}{calendarDays(month).map((day, index) => day ? <button key={day} className={`${filters.from === day && filters.to === day ? 'is-selected' : ''} ${day === isoDate(new Date()) ? 'is-today' : ''}`} aria-label={`${prettyDate(day)}${receiptDays.has(day) ? ' · Buchungen vorhanden' : ''}`} title={receiptDays.has(day) ? 'An diesem Tag gibt es Buchungen' : undefined} aria-pressed={filters.from === day && filters.to === day} onClick={() => { if (filters.from === day && filters.to === day) clearDates(); else { setFilters(current => ({ ...current, from: day, to: day })); setPage(1) } }}>{Number(day.slice(-2))}{receiptDays.has(day) && <span className="bp-receipt-dot" aria-hidden="true" />}</button> : <span key={`empty-${index}`} />)}</div>
                    <button className={`btn ghost bp-all-dates${allDates ? ' is-active' : ''}`} aria-pressed={allDates} onClick={clearDates}>Gesamter Verlauf</button>
                    <div className="bp-calendar-legend">{calendarState === 'loading' ? 'Buchungstage werden geladen …' : calendarState === 'error' ? <button className="btn ghost" onClick={refresh}>Buchungstage erneut laden</button> : <><span className="bp-receipt-dot" />Tag mit Buchungen · unabhängig von Filtern</>}</div>
                </section>
                <section className="bp-panel bp-filters"><div className="bp-section-heading"><h2>Filter</h2>{hasActiveFilters && <button type="button" className="bp-reset-badge" onClick={() => { setFilters(emptyFilters); setPage(1); setSimilarTo(null); onResetFilters() }}>Zurücksetzen</button>}</div>
                    {chipFilter('type', 'Art', Object.entries(kinds).map(([value, label]) => ({ value, label, color: value === 'IN' ? '#237d49' : value === 'OUT' ? '#ad414b' : undefined })))}
                    {generalProfile ? chipFilter('classification', 'Kategorie', classifications.map(item => ({ value: String(item.id), label: item.name }))) : chipFilter('sphere', 'Sphäre', Object.entries(spheres).map(([value, label]) => ({ value, label, color: ({ IDEELL: '#7751b8', ZWECK: '#087e8b', VERMOEGEN: '#a86612', WGB: '#a53970' })[value] })))}
                    {selectFilter('account', 'Zahlweg / Konto', paymentAccounts.map(item => ({ value: String(item.id), label: item.name })))}
                    {tagDefs.length > 0 && <div>{chipFilter('tag', 'Tags', tagDefs.filter((tag, index) => allTagsOpen || index < 6 || tag.name === filters.tag).map(item => ({ value: item.name, label: item.name, color: resolveTagDisplayColor(item.name, tagDefs) })))}{tagDefs.length > 6 && <button className="btn ghost bp-more-tags" onClick={() => setAllTagsOpen(value => !value)} aria-expanded={allTagsOpen}>{allTagsOpen ? 'Weniger Tags' : `Alle ${tagDefs.length} Tags`}</button>}</div>}
                    <details className="bp-more-filters" open={moreFiltersOpen} onToggle={event => setMoreFiltersOpen(event.currentTarget.open)}><summary>Weitere Filter{(filters.from || filters.to || filters.budget || filters.earmark) && <span className="bp-active-filter-count">{[filters.from || filters.to, filters.budget, filters.earmark].filter(Boolean).length} aktiv</span>}</summary>
                        <div className="bp-date-range"><label className="bp-field">Von<DateFilterInput label="Von" value={filters.from} onChange={value => update('from', value)} /></label><label className="bp-field">Bis<DateFilterInput label="Bis" value={filters.to} onChange={value => update('to', value)} /></label></div>
                        {selectFilter('budget', 'Budget', budgets.map(item => ({ value: String(item.id), label: item.label })))}
                        {selectFilter('earmark', 'Zweckbindung', earmarks.map(item => ({ value: String(item.id), label: `${item.code} · ${item.name}` })))}
                    </details>
                </section>
            </div>
        </aside>
        <section className="bp-workspace">
            <header className="bp-heading"><div><h1>Buchungen Plus</h1></div><label className="bp-search bp-header-search"><IconSearch size={18} /><input type="search" className="input" value={filters.q} onChange={event => update('q', event.target.value)} placeholder="Suche: #ID, Text, Datum …" title="Suche wie im Journal: #ID, Beschreibung, Partner oder Datum, z. B. Juni 2026" aria-label="Buchungen suchen" />{filters.q && <button type="button" className="btn ghost" aria-label="Suche leeren" onClick={() => update('q', '')}><IconX size={16} /></button>}</label><div className="bp-totals" aria-busy={loading} aria-label="Summen aller gefilterten Buchungen"><RecentBookingsDropdown kind="IN" amount={!summary || error || invalidRange ? '—' : money.format(income)} payload={payload} revision={revision} invalidRange={invalidRange} fmtDate={fmtDate} onOpenVoucher={row => selectRow(row)} /><RecentBookingsDropdown kind="OUT" amount={!summary || error || invalidRange ? '—' : money.format(expense)} payload={payload} revision={revision} invalidRange={invalidRange} fmtDate={fmtDate} onOpenVoucher={row => selectRow(row)} /><div><span>Saldo</span><strong className={income - expense < 0 ? 'bp-negative' : 'bp-positive'}>{!summary || error || invalidRange ? '—' : money.format(income - expense)}</strong></div></div></header>
            <div className="bp-invoice-tools"><button className="btn primary bp-new" onClick={onNewBooking}><IconPlus size={19} />Neue Buchung</button><InvoiceBatchControl variant="inline" onNewInvoice={onNewInvoice} onReview={onReviewInvoice} notify={batchNotify} paymentAccounts={paymentAccounts} /></div>
            {showBookingDraftTabs && bookingDraftTabs.length > 0 && <div className="booking-draft-tabs bp-draft-tabs" aria-label="Offene Buchungstabs">{bookingDraftTabs.map(draft => <div key={draft.id} className={`booking-draft-tab booking-draft-tab--type-${draft.type.toLowerCase()}${draft.isActive ? ' booking-draft-tab--active' : ''}${draft.isDetached ? ' booking-draft-tab--detached' : ''}`}><button type="button" className="booking-draft-tab__open" title={draft.title} onClick={() => onOpenBookingDraft?.(draft.id)}><span className="booking-draft-tab__label">{draft.label}</span>{draft.isDetached && <span className="booking-draft-tab__badge">abgedockt</span>}</button><button type="button" className="booking-draft-tab__close" aria-label={`${draft.label} schließen`} onClick={() => onCloseBookingDraft?.(draft.id)}><IconX size={14} /></button></div>)}</div>}
            <div className="bp-main-columns">
                <section className="bp-panel bp-list" aria-label="Buchungsliste" aria-busy={loading}>
                    {similarTo && <section className="bp-similar"><div className="bp-section-heading"><h3>Ähnliche Buchungen</h3><button className="btn ghost" aria-label="Ähnliche Buchungen schließen" onClick={() => setSimilarTo(null)}><IconX size={16} /></button></div><p className="bp-dim">Bis zu 5 Treffer · gleiche Art · Suche nach „{similarQuery(similarTo)}“ · alle Zeiträume</p>{similarLoading ? <p role="status">Suche läuft …</p> : similarError ? <p role="alert">{similarError}</p> : !similarRows.length ? <p>Keine ähnlichen Buchungen gefunden.</p> : similarRows.map(row => <button className="btn" key={row.id} onClick={() => selectRow(row)}><span>{row.description || row.voucherNo}<small>{prettyDate(row.date)}</small></span><strong>{signedMoney.format(signedAmount(row))}</strong></button>)}</section>}
                    <div className="bp-list-toolbar"><strong>{total} Buchungen</strong>{loading && <span className="bp-load-status" role="status">Wird aktualisiert …</span>}</div>
                    <div className="bp-column-labels">{sortColumn('date', 'Datum')}{sortColumn('description', 'Buchung')}{sortColumn('payment', 'Zahlweg')}{sortColumn('gross', 'Betrag')}</div>
                    <div className="bp-results">{invalidRange ? <p role="alert" className="bp-empty">„Von“ darf nicht nach „Bis“ liegen.</p> : error ? <div role="alert" className="bp-empty">{error}<button className="btn" onClick={refresh}>Erneut versuchen</button></div> : loading && !summary ? <p className="bp-empty" role="status">Buchungen werden geladen …</p> : rows.length === 0 ? <div className="bp-empty"><IconReceipt2 size={36} /><h2>Keine Buchungen gefunden</h2><p>Wähle einen anderen Zeitraum oder setze die Filter zurück.</p></div> : <div className="bp-rows">{rows.map(row => <button key={row.id} type="button" className={`bp-row${selected?.id === row.id ? ' is-selected' : ''}`} aria-pressed={selected?.id === row.id} disabled={loading} onClick={event => selectRow(row, event.currentTarget)} onDoubleClick={event => selectRow(row, event.currentTarget, true)} title="Doppelklick für vollständige Buchungsdetails">
                        <time className="bp-date" dateTime={row.date}><strong>{Number(row.date.slice(8, 10))}</strong><span>{new Date(`${row.date}T12:00:00`).toLocaleDateString('de-DE', { month: 'short' })}</span><small>{row.date.slice(0, 4)}</small></time>
                        <span className="bp-row-main"><span className={`bp-kind-icon bp-kind-icon--${row.type.toLowerCase()}`}>{row.type === 'IN' ? <IconArrowDown size={21} /> : row.type === 'OUT' ? <IconArrowUp size={21} /> : <IconArrowsExchange size={21} />}</span><span className="bp-row-text"><strong>{row.description || 'Ohne Beschreibung'}</strong><small>{row.counterparty || row.voucherNo}</small><span className="bp-row-tags"><span className="bp-tag">{classificationLabel(row)}</span>{row.originalId || row.reversedById ? <span className="bp-tag">{row.originalId ? 'Storno' : 'Storniert'}</span> : null}{tags((row.tags || []).slice(0, 2))}{(row.tags?.length || 0) > 2 && <span className="bp-tag">+{row.tags!.length - 2}</span>}</span>{assignmentBadges(row)}</span></span>
                        <span className="bp-row-payment">{paymentBadge(row)}{(row.fileCount || 0) > 0 && <small><IconPaperclip size={13} />{row.fileCount}</small>}</span><strong className={`bp-row-amount ${signedAmount(row) < 0 ? 'bp-negative' : row.type === 'IN' ? 'bp-positive' : ''}`}>{signedMoney.format(signedAmount(row))}<IconChevronRight size={14} /></strong>
                    </button>)}</div>}
                    </div>
                    <nav className="bp-pagination" aria-label="Buchungsseiten"><span>Seite {page} / {Math.max(1, Math.ceil(total / limit))} · {total} Einträge</span><div><button className="btn" disabled={loading || page === 1} onClick={() => setPage(1)} aria-label="Erste Seite" title="Zur ersten Seite"><IconChevronsLeft size={17} /></button><button className="btn" disabled={loading || page === 1} onClick={() => setPage(value => value - 1)} aria-label="Vorherige Seite"><IconChevronLeft size={17} /></button><button className="btn" disabled={loading || page * limit >= total} onClick={() => setPage(value => value + 1)} aria-label="Nächste Seite"><IconChevronRight size={17} /></button></div></nav>
                </section>
                {narrow && detailOpen && <div className="bp-detail-backdrop" onClick={closeDetails} />}
                <aside ref={inspector} tabIndex={-1} className={`bp-panel bp-inspector${detailOpen ? ' bp-inspector--open' : ''}${metaEditing ? ' bp-inspector--editing' : ''}`} role={narrow && detailOpen ? 'dialog' : undefined} aria-modal={narrow && detailOpen ? true : undefined} aria-label="Ausgewählte Buchung">
                    <div className="bp-section-heading"><strong>Buchungsdetails</strong><button className="btn ghost bp-detail-close" aria-label="Details schließen" onClick={closeDetails}><IconX size={19} /></button></div>
                    {selected && <div className="bp-voucher-number"><div><span>Belegnummer</span><strong>{selected.voucherNo}</strong></div><button type="button" className="btn ghost" aria-label="Belegnummer kopieren" title="Belegnummer kopieren" onClick={() => { navigator.clipboard.writeText(selected.voucherNo).then(() => notify('success', 'Belegnummer kopiert')).catch(() => notify('error', 'Kopieren fehlgeschlagen')) }}><IconCopy size={18} /></button></div>}
                    {selected && metaEditing ? <VoucherInfoModal key={selected.id} embedded initialEditing voucher={selected} onClose={() => setMetaEditing(false)} suspended={!!attachments} eurFmt={money} fmtDate={fmtDate} notify={notify} budgets={budgets} earmarks={earmarks} tagDefs={tagDefs} allowVoucherDeletion={allowVoucherDeletion} onSaveMeta={saveMeta} onOpenAttachments={() => setAttachments(selected)} /> : selected ? <>
                        <div className="bp-inspector-scroll">
                            {(selected.fileCount || 0) > 0 && <button className="bp-preview-button" onClick={() => setAttachments(selected)} aria-label="Belege anzeigen"><ReceiptThumbnail key={selected.id} voucherId={selected.id} cache={cache.current} revision={revision} /></button>}
                            <h2>{selected.description || 'Ohne Beschreibung'}</h2>{selected.counterparty && <p className="bp-dim"><PartyName name={selected.counterparty} /></p>}<strong className={`bp-detail-amount ${signedAmount(selected) < 0 ? 'bp-negative' : selected.type === 'IN' ? 'bp-positive' : ''}`}>{signedMoney.format(signedAmount(selected))}</strong>
                            <dl className="bp-detail-facts"><div><dt>Datum</dt><dd>{prettyDate(selected.date)}</dd></div><div><dt>Zahlweg</dt><dd>{paymentBadge(selected)}</dd></div><div><dt>{generalProfile ? 'Kategorie' : 'Sphäre'}</dt><dd>{classificationLabel(selected)}</dd></div><div><dt>Art</dt><dd><span className={`bp-type-badge bp-kind-icon--${selected.type.toLowerCase()}`}>{selected.type === 'IN' ? <IconArrowDown size={15} /> : selected.type === 'OUT' ? <IconArrowUp size={15} /> : <IconArrowsExchange size={15} />}{kinds[selected.type]}</span></dd></div></dl>
                            <h3>Tags</h3><div className="bp-row-tags">{selected.tags?.length ? tags(selected.tags) : <span className="bp-dim">Keine Tags</span>}</div>
                            <h3>Zuordnungen</h3><div className="bp-assignment"><span>Budget</span><strong>{selected.budgets?.map(item => item.label || `#${item.budgetId}`).join(', ') || selected.budgetLabel || '—'}</strong><span>Zweckbindung</span><strong>{selected.earmarksAssigned?.map(item => item.code || item.name).join(', ') || selected.earmarkCode || '—'}</strong></div>
                            <h3>Beleg / Notiz</h3><div className="bp-note">{selected.note || 'Keine Notiz hinterlegt.'}</div><button className="btn bp-attachment" onClick={() => setAttachments(selected)}><IconPaperclip size={16} />{selected.fileCount ? `${selected.fileCount} Beleg${selected.fileCount === 1 ? '' : 'e'} anzeigen / ergänzen` : 'Beleg hinzufügen'}</button>
                            {blocked && <p className="bp-dim">{blocked}</p>}

                        </div>
                        <footer className="bp-detail-actions"><div><button className="btn bp-edit-booking" disabled={!!editBlocked || busy} onClick={() => { void edit() }}><IconPencil size={16} />Bearbeiten</button><button className="btn" onClick={() => setInfoOpen(true)} title="Vollständige Buchungsinfo" aria-label="Vollständige Buchungsinfo"><IconReceipt2 size={18} /></button><button className="btn danger" disabled={!!blocked || busy} onClick={() => setConfirm(selected)} title={allowVoucherDeletion ? 'Löschen' : 'Stornieren'} aria-label={allowVoucherDeletion ? 'Löschen' : 'Stornieren'}><IconTrash size={17} /></button></div><button className="btn ghost" disabled={!similarQuery(selected)} onClick={() => { setSimilarTo(current => current?.id === selected.id ? null : selected); if (narrow) closeDetails() }} aria-expanded={!!similarTo}><IconSearch size={16} />Ähnliche Buchungen</button></footer>
                    </> : <p className="bp-empty">Wähle eine Buchung aus der Liste.</p>}
                </aside>
            </div>
        </section>
        {infoOpen && selected && <VoucherInfoModal voucher={selected} onClose={() => setInfoOpen(false)} suspended={!!attachments} eurFmt={money} fmtDate={fmtDate} notify={notify} budgets={budgets} earmarks={earmarks} tagDefs={tagDefs} allowVoucherDeletion={allowVoucherDeletion} onSaveMeta={saveMeta} onReverse={!blocked ? () => setConfirm(selected) : undefined} onOpenAttachments={() => setAttachments(selected)} />}
        {attachments && <AttachmentsModal voucher={{ voucherId: attachments.id, voucherNo: attachments.voucherNo, date: attachments.date, description: attachments.description || '' }} onClose={() => { setAttachments(null); refresh() }} onChanged={refresh} />}
        {confirm && <div className="modal-overlay bp-confirm" role="dialog" aria-modal="true" aria-labelledby="bp-confirm-title"><div className="modal"><h2 id="bp-confirm-title">Buchung {allowVoucherDeletion ? 'löschen' : 'stornieren'}?</h2><p>{confirm.voucherNo} · {confirm.description}</p><p>{allowVoucherDeletion ? 'Die Buchung wird endgültig gelöscht.' : 'Die Originalbuchung bleibt erhalten. Es wird eine Gegenbuchung erstellt.'}</p><div className="bp-confirm-actions"><button className="btn" autoFocus disabled={busy} onClick={() => setConfirm(null)}>Abbrechen</button><button className="btn danger" disabled={busy} onClick={() => { void remove() }}>{busy ? 'Wird gespeichert …' : allowVoucherDeletion ? 'Löschen' : 'Stornieren'}</button></div></div></div>}
    </div>
}
