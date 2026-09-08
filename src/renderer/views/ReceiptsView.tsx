import React, { useCallback, useEffect, useRef, useState } from 'react'
import { IconPaperclip, IconCalendar, IconBuildingBank, IconLayoutGrid, IconList } from '@tabler/icons-react'
import { addDataChangedListener } from '../utils/refresh'
import AttachmentsModal from '../components/modals/AttachmentsModal'
import AppIcon from '../components/common/AppIcon'

import ReceiptThumbnail, { type ReceiptPreviewCache } from '../components/ReceiptThumbnail'
import type { RendererApi } from '../../types/api'

const eurFmt = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })
const dateFmt = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: 'short', year: 'numeric' })
const formatDate = (value: string) => dateFmt.format(new Date(`${value.slice(0, 10)}T12:00:00`))
const typeLabels = { IN: 'Einnahme', OUT: 'Ausgabe', TRANSFER: 'Umbuchung', INTERNAL: 'Intern' }
const sphereLabels = { IDEELL: 'Ideell', ZWECK: 'Zweckbetrieb', VERMOEGEN: 'Vermögensverwaltung', WGB: 'Wirt. Geschäftsbetrieb' }
type ReceiptRow = Awaited<ReturnType<RendererApi['vouchers']['list']>>['rows'][number]

type ReceiptTarget = { voucherId: number; voucherNo: string; date: string; description: string }

export default function ReceiptsView({ openVoucher, onVoucherOpened }: { openVoucher?: ReceiptTarget | null; onVoucherOpened?: () => void }) {
    const [rows, setRows] = useState<ReceiptRow[]>([])
    const [view, setView] = useState<'grid' | 'list'>('grid')
    const [sort, setSort] = useState<'ASC' | 'DESC'>('DESC')
    const previewCache = useRef<ReceiptPreviewCache>(new Map())
    const [previewRevision, setPreviewRevision] = useState(0)
    const [page, setPage] = useState(1)
    const limit = 20
    const [total, setTotal] = useState(0)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const requestId = useRef(0)
    const [attachmentsModal, setAttachmentsModal] = useState<null | { voucherId: number; voucherNo: string; date: string; description: string }>(null)

    const load = useCallback(async () => {
        const currentRequest = ++requestId.current
        setLoading(true)
        setError(null)
        try {
            const res = await window.api.vouchers.list({ limit, offset: (page - 1) * limit, sort, hasFiles: true })
            if (currentRequest !== requestId.current) return
            const lastPage = Math.max(1, Math.ceil(res.total / limit))
            if (page > lastPage) {
                setPage(lastPage)
                return
            }
            setRows(res.rows)
            setTotal(res.total)
        } catch {
            if (currentRequest === requestId.current) setError('Belege konnten nicht geladen werden. Bitte erneut versuchen.')
        } finally {
            if (currentRequest === requestId.current) setLoading(false)
        }
    }, [page, sort])

    useEffect(() => {
        void load()
        const onChanged = () => { previewCache.current.clear(); setPreviewRevision(value => value + 1); void load() }
        const unsubscribe = addDataChangedListener(['vouchers'], onChanged)
        return () => {
            unsubscribe()
            requestId.current++
        }
    }, [load])

    useEffect(() => {
        if (!openVoucher) return
        setAttachmentsModal(openVoucher)
        onVoucherOpened?.()
    }, [openVoucher, onVoucherOpened])

    // AttachmentsModal handles listing, preview and download

    function jumpToVoucher(row: { id: number; voucherNo: string; date: string }) {
        const ev = new CustomEvent('apply-voucher-jump', {
            detail: {
                voucherId: row.id,
                voucherNo: row.voucherNo,
                date: row.date,
            }
        })
        window.dispatchEvent(ev)
    }

    return (
        <div className="receipts-container" style={{ padding: 12 }}>
            <header className="receipts-header">
                <div><h1>Belege</h1><span className="helper">Buchungen mit Belegen ({total})</span></div>
                <div className="receipts-toolbar">
                    <select className="input" aria-label="Belege sortieren" value={sort} onChange={event => { setSort(event.target.value as 'ASC' | 'DESC'); setPage(1) }}><option value="DESC">Datum: neueste zuerst</option><option value="ASC">Datum: älteste zuerst</option></select>
                    <div className="receipts-view-switch" role="group" aria-label="Ansicht">
                        <button className={`btn ${view === 'grid' ? 'primary' : 'ghost'}`} aria-label="Kartenansicht" title="Kartenansicht" aria-pressed={view === 'grid'} onClick={() => setView('grid')}><IconLayoutGrid size={18} /></button>
                        <button className={`btn ${view === 'list' ? 'primary' : 'ghost'}`} aria-label="Tabellenansicht" title="Tabellenansicht" aria-pressed={view === 'list'} onClick={() => setView('list')}><IconList size={18} /></button>
                    </div>
                </div>
            </header>
            {loading && <div>Lade …</div>}
            {error && <div role="alert">{error} <button className="btn" onClick={() => { void load() }}>Erneut versuchen</button></div>}
            {!loading && !error && rows.length > 0 && view === 'list' && (
                <table cellPadding={6} style={{ marginTop: 8, width: '100%' }}>
                    <thead>
                        <tr>
                            <th align="left">Datum</th>
                            <th align="left">Nr.</th>
                            <th align="left">Beschreibung</th>
                            <th align="center">Belege</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map(r => (
                            <tr key={r.id}>
                                <td>{r.date}</td>
                                <td>
                                    <button
                                        type="button"
                                        className="btn ghost"
                                        onClick={() => jumpToVoucher(r)}
                                        title="Zur Buchung"
                                        style={{ padding: 0, border: 0, background: 'transparent', color: 'var(--primary)', fontWeight: 600 }}
                                    >
                                        {r.voucherNo}
                                    </button>
                                </td>
                                <td>{r.description}</td>
                                <td align="center">
                                    <button
                                        className="btn btn-with-icon"
                                        onClick={() => setAttachmentsModal({ voucherId: r.id, voucherNo: r.voucherNo, date: r.date, description: r.description || '' })}
                                        title="Belege anzeigen"
                                    ><AppIcon icon={IconPaperclip} size="inline" />{r.fileCount}</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
            {!loading && !error && rows.length > 0 && view === 'grid' && (
                <div className="receipts-grid">
                    {rows.map(row => {
                        const classification = row.primaryClassificationName || sphereLabels[row.sphere]
                        const payment = row.type === 'TRANSFER' ? `${row.transferFromAccountName || (row.transferFrom === 'BAR' ? 'Bar' : 'Bank')} → ${row.transferToAccountName || (row.transferTo === 'BAR' ? 'Bar' : 'Bank')}` : row.type === 'INTERNAL' ? 'Intern' : row.paymentAccountName || (row.paymentMethod === 'BAR' ? 'Bar' : row.paymentMethod === 'BANK' ? 'Bank' : '—')
                        return <article className="receipt-card" key={row.id}>
                            <button className="receipt-card__open" onClick={() => setAttachmentsModal({ voucherId: row.id, voucherNo: row.voucherNo, date: row.date, description: row.description || '' })} aria-label={`Belege anzeigen: ${row.description || row.voucherNo}`}>
                                <div className="receipt-card__badges"><span className={`badge ${row.type.toLowerCase()}`}>{typeLabels[row.type]}</span><span className="receipt-card__classification">{classification}</span></div>
                                <ReceiptThumbnail voucherId={row.id} cache={previewCache.current} revision={previewRevision} />
                                <h2>{row.description || 'Ohne Beschreibung'}</h2>
                                {row.counterparty && <div className="receipt-card__counterparty">{row.counterparty}</div>}
                                <div className="receipt-card__detail"><IconCalendar size={15} />{formatDate(row.date)}</div>
                                <strong className={`receipt-card__amount receipt-card__amount--${row.type.toLowerCase()}`}>{row.type === 'OUT' ? '−' : row.type === 'IN' ? '+' : ''}{eurFmt.format(Math.abs(row.grossAmount))}</strong>
                                <div className="receipt-card__detail"><IconBuildingBank size={15} />{payment}</div>
                                <span className="receipt-card__count"><IconPaperclip size={14} />{row.fileCount || 1} {(row.fileCount || 1) === 1 ? 'Beleg' : 'Belege'}</span>
                            </button>
                            <footer><button className="btn ghost" onClick={() => jumpToVoucher(row)} title="Zur Buchung">{row.voucherNo}<span aria-hidden="true">↗</span></button></footer>
                        </article>
                    })}
                </div>
            )}
            {!loading && !error && rows.length === 0 && (
                <div className="receipts-empty" style={{ padding: 16, marginTop: 12 }}>
                    <div style={{ display: 'grid', gap: 6 }}>
                        <div><strong>Keine Belege gefunden</strong></div>
                        <div className="helper">Es wurden noch keine Dateien an Buchungen angehängt. Du kannst in „Buchungen" Belege hinzufügen oder neue Buchungen anlegen.</div>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button className="btn" onClick={() => (window as any).scrollTo?.(0,0) || null}>Nach oben</button>
                            <button className="btn primary" onClick={() => (document.querySelector('.fab-buchung') as HTMLButtonElement | null)?.click?.()}>+ Buchung</button>
                        </div>
                    </div>
                </div>
            )}
            {!error && total > 0 && (
                <nav className="pagination-bar" aria-label="Belege-Seiten">
                    <span>{total} Buchungen mit Belegen · Seite {page} / {Math.max(1, Math.ceil(total / limit))}</span>
                    <div className="inline-flex items-center gap-8">
                        <button className="btn" disabled={loading || page === 1} onClick={() => setPage(p => p - 1)}>Zurück</button>
                        <button className="btn" disabled={loading || page * limit >= total} onClick={() => setPage(p => p + 1)}>Weiter</button>
                    </div>
                </nav>
            )}
            {attachmentsModal && (
                <AttachmentsModal
                    voucher={attachmentsModal}
                    onClose={() => setAttachmentsModal(null)}
                    onChanged={() => { previewCache.current.delete(attachmentsModal.voucherId); setPreviewRevision(value => value + 1); void load() }}
                />
            )}
        </div>
    )
}
