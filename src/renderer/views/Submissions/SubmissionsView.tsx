import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { ICONS } from '../../utils/icons'

// Unicode icons for buttons (keine ICONS.upload/refresh/trash im bestehenden ICONS-Set)
const ICON_IMPORT = '📥'
const ICON_REFRESH = '🔄'
const ICON_DELETE = ICONS.DELETE

// Type matching the backend schema
interface Submission {
    id: number
    external_id?: string | null
    date: string
    type: 'IN' | 'OUT'
    description?: string | null
    gross_amount: number
    category_hint?: string | null
    counterparty?: string | null
    submitted_by: string
    submitted_at: string
    status: 'pending' | 'approved' | 'rejected'
    reviewed_at?: string | null
    reviewer_notes?: string | null
    voucher_id?: number | null
    attachments?: Array<{
        id: number
        name: string
        mime_type: string
        size: number
    }>
}

interface SubmissionsViewProps {
    notify: (type: 'info' | 'success' | 'error', text: string, duration?: number) => void
    bumpDataVersion: () => void
    eurFmt: Intl.NumberFormat
    fmtDate: (d: string) => string
}

// Review modal for kassier to approve/reject
function ReviewModal({
    submission,
    onClose,
    onApprove,
    onReject
}: {
    submission: Submission
    onClose: () => void
    onApprove: (notes: string) => void
    onReject: (notes: string) => void
}) {
    const [notes, setNotes] = useState('')
    const [loading, setLoading] = useState(false)

    const handleApprove = async () => {
        setLoading(true)
        await onApprove(notes)
        setLoading(false)
    }

    const handleReject = async () => {
        setLoading(true)
        await onReject(notes)
        setLoading(false)
    }

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal" style={{ maxWidth: 600 }} onClick={(e) => e.stopPropagation()}>
                <header className="flex justify-between items-center mb-16">
                    <h2 style={{ margin: 0 }}>Einreichung prüfen</h2>
                    <button className="btn danger" onClick={onClose} aria-label="Schließen">×</button>
                </header>

                <div className="card mb-16" style={{ padding: 16 }}>
                    <div className="grid gap-8" style={{ gridTemplateColumns: '1fr 1fr' }}>
                        <div>
                            <label className="helper">Datum</label>
                            <div>{submission.date}</div>
                        </div>
                        <div>
                            <label className="helper">Typ</label>
                            <div>{submission.type === 'IN' ? 'Einnahme' : 'Ausgabe'}</div>
                        </div>
                        <div style={{ gridColumn: 'span 2' }}>
                            <label className="helper">Beschreibung</label>
                            <div>{submission.description || '–'}</div>
                        </div>
                        <div>
                            <label className="helper">Bruttobetrag</label>
                            <div style={{ fontWeight: 600, color: submission.type === 'IN' ? 'var(--success)' : 'var(--danger)' }}>
                                {submission.type === 'OUT' && '-'}€ {(submission.gross_amount / 100).toFixed(2)}
                            </div>
                        </div>
                        <div>
                            <label className="helper">Gegenpartei</label>
                            <div>{submission.counterparty || '–'}</div>
                        </div>
                        <div>
                            <label className="helper">Kategorie-Hinweis</label>
                            <div>{submission.category_hint || '–'}</div>
                        </div>
                        <div>
                            <label className="helper">Eingereicht von</label>
                            <div>{submission.submitted_by}</div>
                        </div>
                    </div>

                    {submission.attachments && submission.attachments.length > 0 && (
                        <div className="mt-16">
                            <label className="helper">Anhänge</label>
                            <div className="flex gap-8 flex-wrap">
                                {submission.attachments.map((att) => (
                                    <span key={att.id} className="chip">
                                        📎 {att.name}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <div className="field">
                    <label>Notizen (optional)</label>
                    <textarea
                        className="input"
                        rows={3}
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Anmerkungen zur Entscheidung..."
                    />
                </div>

                <div className="flex justify-between mt-16">
                    <button className="btn danger" onClick={handleReject} disabled={loading}>
                        {ICONS.CROSS} Ablehnen
                    </button>
                    <div className="flex gap-8">
                        <button className="btn" onClick={onClose}>Abbrechen</button>
                        <button className="btn primary" onClick={handleApprove} disabled={loading}>
                            {ICONS.CHECK} Genehmigen & Buchung erstellen
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}

// Status badge component
function StatusBadge({ status }: { status: 'pending' | 'approved' | 'rejected' }) {
    const config = {
        pending: { label: 'Ausstehend', className: 'badge badge-warning' },
        approved: { label: 'Genehmigt', className: 'badge badge-success' },
        rejected: { label: 'Abgelehnt', className: 'badge badge-danger' }
    }
    const { label, className } = config[status]
    return <span className={className}>{label}</span>
}

export default function SubmissionsView({ notify, bumpDataVersion, eurFmt, fmtDate }: SubmissionsViewProps) {
    const [submissions, setSubmissions] = useState<Submission[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [filterStatus, setFilterStatus] = useState<'ALL' | 'pending' | 'approved' | 'rejected'>('ALL')
    const [reviewSubmission, setReviewSubmission] = useState<Submission | null>(null)

    // Load submissions
    const loadSubmissions = useCallback(async () => {
        setLoading(true)
        setError('')
        try {
            const filter = filterStatus === 'ALL' ? {} : { status: filterStatus }
            const res = await (window as any).api?.submissions?.list?.(filter)
            if (res?.submissions) {
                setSubmissions(res.submissions)
            }
        } catch (e: any) {
            setError('Fehler beim Laden: ' + (e?.message || e))
        } finally {
            setLoading(false)
        }
    }, [filterStatus])

    useEffect(() => {
        loadSubmissions()
    }, [loadSubmissions])

    // Import from JSON file
    const handleImport = async () => {
        try {
            const res = await (window as any).api?.submissions?.importFromFile?.()
            if (res?.imported > 0) {
                notify('success', `${res.imported} Einreichung(en) importiert`)
                loadSubmissions()
                bumpDataVersion()
            } else if (res?.imported === 0) {
                notify('info', 'Keine neuen Einreichungen im Import gefunden')
            }
        } catch (e: any) {
            notify('error', 'Import fehlgeschlagen: ' + (e?.message || e))
        }
    }

    // Approve submission
    const handleApprove = async (notes: string) => {
        if (!reviewSubmission) return
        try {
            const res = await (window as any).api?.submissions?.approve?.({
                id: reviewSubmission.id,
                notes
            })
            if (res?.voucherId) {
                notify('success', `Einreichung genehmigt – Buchung #${res.voucherId} erstellt`)
            } else {
                notify('success', 'Einreichung genehmigt')
            }
            setReviewSubmission(null)
            loadSubmissions()
            bumpDataVersion()
        } catch (e: any) {
            notify('error', 'Genehmigung fehlgeschlagen: ' + (e?.message || e))
        }
    }

    // Reject submission
    const handleReject = async (notes: string) => {
        if (!reviewSubmission) return
        try {
            await (window as any).api?.submissions?.reject?.({
                id: reviewSubmission.id,
                notes
            })
            notify('info', 'Einreichung abgelehnt')
            setReviewSubmission(null)
            loadSubmissions()
            bumpDataVersion()
        } catch (e: any) {
            notify('error', 'Ablehnung fehlgeschlagen: ' + (e?.message || e))
        }
    }

    // Delete submission
    const handleDelete = async (id: number) => {
        if (!confirm('Einreichung wirklich löschen?')) return
        try {
            await (window as any).api?.submissions?.delete?.({ id })
            notify('success', 'Einreichung gelöscht')
            loadSubmissions()
            bumpDataVersion()
        } catch (e: any) {
            notify('error', 'Löschen fehlgeschlagen: ' + (e?.message || e))
        }
    }

    // Filtered and sorted submissions
    const filteredSubmissions = useMemo(() => {
        // Sort: pending first, then by date desc
        return [...submissions].sort((a, b) => {
            if (a.status === 'pending' && b.status !== 'pending') return -1
            if (a.status !== 'pending' && b.status === 'pending') return 1
            return new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime()
        })
    }, [submissions])

    // Stats
    const stats = useMemo(() => {
        const pending = submissions.filter(s => s.status === 'pending').length
        const approved = submissions.filter(s => s.status === 'approved').length
        const rejected = submissions.filter(s => s.status === 'rejected').length
        return { pending, approved, rejected, total: submissions.length }
    }, [submissions])

    return (
        <div className="page-content">
            {/* Header */}
            <header className="flex justify-between items-center mb-16">
                <div>
                    <h1 style={{ margin: 0 }}>Einreichungen</h1>
                    <p className="helper">Eingereichte Buchungsvorschläge von Mitgliedern</p>
                </div>
                <div className="flex gap-8">
                    <button className="btn" onClick={handleImport} title="JSON-Datei importieren">
                        {ICON_IMPORT} Importieren
                    </button>
                </div>
            </header>

            {/* Stats */}
            <div className="grid gap-16 mb-16" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
                <div className="card" style={{ padding: 16, textAlign: 'center' }}>
                    <div className="helper">Gesamt</div>
                    <div style={{ fontSize: 24, fontWeight: 700 }}>{stats.total}</div>
                </div>
                <div className="card" style={{ padding: 16, textAlign: 'center', borderLeft: '4px solid var(--warning)' }}>
                    <div className="helper">Ausstehend</div>
                    <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--warning)' }}>{stats.pending}</div>
                </div>
                <div className="card" style={{ padding: 16, textAlign: 'center', borderLeft: '4px solid var(--success)' }}>
                    <div className="helper">Genehmigt</div>
                    <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--success)' }}>{stats.approved}</div>
                </div>
                <div className="card" style={{ padding: 16, textAlign: 'center', borderLeft: '4px solid var(--danger)' }}>
                    <div className="helper">Abgelehnt</div>
                    <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--danger)' }}>{stats.rejected}</div>
                </div>
            </div>

            {/* Filter */}
            <div className="flex gap-8 mb-16">
                <select
                    className="input"
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value as any)}
                    style={{ width: 'auto' }}
                >
                    <option value="ALL">Alle Status</option>
                    <option value="pending">Ausstehend</option>
                    <option value="approved">Genehmigt</option>
                    <option value="rejected">Abgelehnt</option>
                </select>
                <button className="btn" onClick={loadSubmissions}>
                    {ICON_REFRESH} Aktualisieren
                </button>
            </div>

            {/* Error */}
            {error && (
                <div className="card mb-16" style={{ padding: 16, background: 'var(--danger-bg)', color: 'var(--danger)' }}>
                    {error}
                </div>
            )}

            {/* Loading */}
            {loading ? (
                <div className="card" style={{ padding: 32, textAlign: 'center' }}>
                    Laden...
                </div>
            ) : filteredSubmissions.length === 0 ? (
                <div className="card" style={{ padding: 32, textAlign: 'center' }}>
                    <p style={{ margin: 0 }}>Keine Einreichungen gefunden</p>
                    <p className="helper mt-8">
                        Importieren Sie eine .vereino-submission.json Datei oder warten Sie auf eingereichte Buchungsvorschläge
                    </p>
                </div>
            ) : (
                /* Table */
                <div className="card">
                    <table className="table">
                        <thead>
                            <tr>
                                <th>Status</th>
                                <th>Datum</th>
                                <th>Typ</th>
                                <th>Beschreibung</th>
                                <th style={{ textAlign: 'right' }}>Betrag</th>
                                <th>Eingereicht von</th>
                                <th>Eingereicht am</th>
                                <th style={{ textAlign: 'right' }}>Aktionen</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredSubmissions.map((sub) => (
                                <tr key={sub.id}>
                                    <td><StatusBadge status={sub.status} /></td>
                                    <td>{fmtDate(sub.date)}</td>
                                    <td>{sub.type === 'IN' ? 'Einnahme' : 'Ausgabe'}</td>
                                    <td style={{ maxWidth: 200 }} title={sub.description || ''}>
                                        <span className="text-ellipsis" style={{ display: 'block' }}>
                                            {sub.description || '–'}
                                        </span>
                                    </td>
                                    <td style={{ textAlign: 'right', fontWeight: 600, color: sub.type === 'IN' ? 'var(--success)' : 'var(--danger)' }}>
                                        {sub.type === 'OUT' && '-'}€ {(sub.gross_amount / 100).toFixed(2)}
                                    </td>
                                    <td>{sub.submitted_by}</td>
                                    <td>{fmtDate(sub.submitted_at.slice(0, 10))}</td>
                                    <td style={{ textAlign: 'right' }}>
                                        <div className="flex gap-4 justify-end">
                                            {sub.status === 'pending' && (
                                                <button
                                                    className="btn primary"
                                                    onClick={() => setReviewSubmission(sub)}
                                                    title="Prüfen & Entscheiden"
                                                >
                                                    Prüfen
                                                </button>
                                            )}
                                            {sub.voucher_id && (
                                                <button className="btn" title={`Zur Buchung #${sub.voucher_id}`}>
                                                    #{sub.voucher_id}
                                                </button>
                                            )}
                                            <button
                                                className="btn danger"
                                                onClick={() => handleDelete(sub.id)}
                                                title="Löschen"
                                                aria-label="Einreichung löschen"
                                            >
                                                {ICON_DELETE}
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Review Modal */}
            {reviewSubmission && (
                <ReviewModal
                    submission={reviewSubmission}
                    onClose={() => setReviewSubmission(null)}
                    onApprove={handleApprove}
                    onReject={handleReject}
                />
            )}
        </div>
    )
}
