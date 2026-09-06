import React, { useCallback, useEffect, useRef, useState } from 'react'
import { IconPaperclip } from '@tabler/icons-react'
import { addDataChangedListener } from '../utils/refresh'
import AttachmentsModal from '../components/modals/AttachmentsModal'
import AppIcon from '../components/common/AppIcon'

type ReceiptTarget = { voucherId: number; voucherNo: string; date: string; description: string }

export default function ReceiptsView({ openVoucher, onVoucherOpened }: { openVoucher?: ReceiptTarget | null; onVoucherOpened?: () => void }) {
    const [rows, setRows] = useState<Array<{ id: number; voucherNo: string; date: string; description?: string | null; fileCount?: number }>>([])
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
            const res = await window.api.vouchers.list({ limit, offset: (page - 1) * limit, sort: 'DESC', hasFiles: true })
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
    }, [page])

    useEffect(() => {
        void load()
        const onChanged = () => { void load() }
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong>Belege</strong>
                <div className="helper">Buchungen mit angehängten Dateien</div>
            </div>
            {loading && <div>Lade …</div>}
            {error && <div role="alert">{error} <button className="btn" onClick={() => { void load() }}>Erneut versuchen</button></div>}
            {!loading && !error && rows.length > 0 && (
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
                                        title="Zur Buchung im Journal"
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
                    onChanged={() => { void load() }}
                />
            )}
        </div>
    )
}
