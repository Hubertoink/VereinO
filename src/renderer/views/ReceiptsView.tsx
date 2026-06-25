import React, { useEffect, useState } from 'react'
import AttachmentsModal from '../components/modals/AttachmentsModal'

type ReceiptTarget = { voucherId: number; voucherNo: string; date: string; description: string }

export default function ReceiptsView({ openVoucher, onVoucherOpened }: { openVoucher?: ReceiptTarget | null; onVoucherOpened?: () => void }) {
    const [rows, setRows] = useState<Array<{ id: number; voucherNo: string; date: string; description?: string | null; fileCount?: number }>>([])
    const [page, setPage] = useState(1)
    const [limit, setLimit] = useState(20)
    const [total, setTotal] = useState(0)
    const [loading, setLoading] = useState(false)
    const [attachmentsModal, setAttachmentsModal] = useState<null | { voucherId: number; voucherNo: string; date: string; description: string }>(null)

    async function load() {
        setLoading(true)
        try {
            const res = await window.api?.vouchers.list?.({ limit, offset: (page - 1) * limit, sort: 'DESC' })
            if (res) {
                const withFiles = res.rows.filter(r => (r.fileCount || 0) > 0)
                setRows(withFiles.map(r => ({ id: r.id, voucherNo: r.voucherNo, date: r.date, description: r.description || '', fileCount: r.fileCount || 0 })))
                setTotal(res.total)
            }
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => { load() }, [page, limit])

    useEffect(() => {
        const onChanged = () => { void load() }
        window.addEventListener('data-changed', onChanged)
        return () => window.removeEventListener('data-changed', onChanged)
    }, [page, limit])

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
        <div className="card" style={{ padding: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong>Belege</strong>
                <div className="helper">Buchungen mit angehängten Dateien</div>
            </div>
            {loading && <div>Lade …</div>}
            {!loading && rows.length > 0 && (
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
                                        className="btn"
                                        onClick={() => setAttachmentsModal({ voucherId: r.id, voucherNo: r.voucherNo, date: r.date, description: r.description || '' })}
                                        title="Belege anzeigen"
                                    >🔎 {r.fileCount}</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
            {!loading && rows.length === 0 && (
                <div className="card" style={{ padding: 16, marginTop: 12 }}>
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
            {attachmentsModal && (
                <AttachmentsModal
                    voucher={attachmentsModal}
                    onClose={() => setAttachmentsModal(null)}
                />
            )}
        </div>
    )
}
