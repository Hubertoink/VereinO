import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { ICONS } from '../../utils/icons'
import TagsEditor from '../../components/TagsEditor'

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

// Editable voucher data for kassier review
interface VoucherDraft {
    date: string
    type: 'IN' | 'OUT'
    sphere: 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'
    description: string
    grossAmount: number
    vatRate: number
    paymentMethod: 'BAR' | 'BANK'
    earmarkId: number | null
    budgetId: number | null
    tags: string[]
    counterparty: string
}

interface SubmissionsViewProps {
    notify: (type: 'info' | 'success' | 'error', text: string, duration?: number) => void
    bumpDataVersion: () => void
    eurFmt: Intl.NumberFormat
    fmtDate: (d: string) => string
    earmarks: Array<{ id: number; code: string; name: string; color?: string | null }>
    budgetsForEdit: Array<{ id: number; label: string }>
    tagDefs: Array<{ id: number; name: string; color?: string | null }>
}

// Review modal for kassier to approve/reject with edit capability
function ReviewModal({
    submission,
    onClose,
    onApprove,
    onReject,
    earmarks,
    budgetsForEdit,
    tagDefs
}: {
    submission: Submission
    onClose: () => void
    onApprove: (notes: string, draft: VoucherDraft) => void
    onReject: (notes: string) => void
    earmarks: Array<{ id: number; code: string; name: string; color?: string | null }>
    budgetsForEdit: Array<{ id: number; label: string }>
    tagDefs: Array<{ id: number; name: string; color?: string | null }>
}) {
    const [notes, setNotes] = useState('')
    const [loading, setLoading] = useState(false)
    const [editMode, setEditMode] = useState(false)
    
    // Editable voucher draft
    const [draft, setDraft] = useState<VoucherDraft>(() => ({
        date: submission.date,
        type: submission.type,
        sphere: 'IDEELL',
        description: submission.description || '',
        grossAmount: submission.gross_amount,
        vatRate: 0,
        paymentMethod: 'BANK',
        earmarkId: null,
        budgetId: null,
        tags: [],
        counterparty: submission.counterparty || ''
    }))

    const handleApprove = async () => {
        setLoading(true)
        await onApprove(notes, draft)
        setLoading(false)
    }

    const handleReject = async () => {
        setLoading(true)
        await onReject(notes)
        setLoading(false)
    }

    // Calculate net amount from gross
    const netAmount = useMemo(() => {
        if (draft.vatRate === 0) return draft.grossAmount
        return Math.round(draft.grossAmount / (1 + draft.vatRate / 100))
    }, [draft.grossAmount, draft.vatRate])

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal" style={{ maxWidth: editMode ? 800 : 600 }} onClick={(e) => e.stopPropagation()}>
                <header className="flex justify-between items-center mb-16">
                    <h2 style={{ margin: 0 }}>
                        {editMode ? 'Buchung bearbeiten & genehmigen' : 'Einreichung prüfen'}
                    </h2>
                    <button className="btn danger" onClick={onClose} aria-label="Schließen">×</button>
                </header>

                {/* Original submission info */}
                <div className="card mb-16" style={{ padding: 16, background: 'var(--surface-alt)' }}>
                    <div className="helper mb-8">Eingereichte Daten</div>
                    <div className="grid gap-8" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
                        <div>
                            <span className="helper">Datum:</span> {submission.date}
                        </div>
                        <div>
                            <span className="helper">Typ:</span> {submission.type === 'IN' ? 'Einnahme' : 'Ausgabe'}
                        </div>
                        <div>
                            <span className="helper">Betrag:</span>{' '}
                            <strong style={{ color: submission.type === 'IN' ? 'var(--success)' : 'var(--danger)' }}>
                                {submission.type === 'OUT' && '-'}€ {(submission.gross_amount / 100).toFixed(2)}
                            </strong>
                        </div>
                        <div style={{ gridColumn: 'span 2' }}>
                            <span className="helper">Beschreibung:</span> {submission.description || '–'}
                        </div>
                        <div>
                            <span className="helper">Von:</span> {submission.submitted_by}
                        </div>
                        {submission.category_hint && (
                            <div style={{ gridColumn: 'span 3' }}>
                                <span className="helper">Kategorie-Hinweis:</span> {submission.category_hint}
                            </div>
                        )}
                    </div>
                    {submission.attachments && submission.attachments.length > 0 && (
                        <div className="mt-8">
                            <span className="helper">Anhänge:</span>{' '}
                            {submission.attachments.map((att) => (
                                <span key={att.id} className="chip" style={{ marginLeft: 4 }}>
                                    📎 {att.name}
                                </span>
                            ))}
                        </div>
                    )}
                </div>

                {/* Toggle edit mode */}
                {!editMode ? (
                    <button className="btn mb-16" onClick={() => setEditMode(true)} style={{ width: '100%' }}>
                        {ICONS.EDIT} Buchungsdetails vor Genehmigung bearbeiten
                    </button>
                ) : (
                    /* Editable voucher form */
                    <div className="card mb-16" style={{ padding: 16 }}>
                        <div className="helper mb-8">Buchungsdetails (bearbeitbar)</div>
                        <div className="grid gap-12" style={{ gridTemplateColumns: '1fr 1fr' }}>
                            <div className="field">
                                <label>Datum</label>
                                <input
                                    type="date"
                                    className="input"
                                    value={draft.date}
                                    onChange={(e) => setDraft({ ...draft, date: e.target.value })}
                                />
                            </div>
                            <div className="field">
                                <label>Art</label>
                                <div className="btn-group">
                                    <button
                                        type="button"
                                        className={`btn ${draft.type === 'IN' ? 'btn-toggle-active btn-type-in' : ''}`}
                                        onClick={() => setDraft({ ...draft, type: 'IN' })}
                                    >
                                        Einnahme
                                    </button>
                                    <button
                                        type="button"
                                        className={`btn ${draft.type === 'OUT' ? 'btn-toggle-active btn-type-out' : ''}`}
                                        onClick={() => setDraft({ ...draft, type: 'OUT' })}
                                    >
                                        Ausgabe
                                    </button>
                                </div>
                            </div>
                            <div className="field">
                                <label>Sphäre</label>
                                <select
                                    className="input"
                                    value={draft.sphere}
                                    onChange={(e) => setDraft({ ...draft, sphere: e.target.value as any })}
                                >
                                    <option value="IDEELL">IDEELL</option>
                                    <option value="ZWECK">ZWECK</option>
                                    <option value="VERMOEGEN">VERMÖGEN</option>
                                    <option value="WGB">WGB</option>
                                </select>
                            </div>
                            <div className="field">
                                <label>Zahlweg</label>
                                <div className="btn-group">
                                    <button
                                        type="button"
                                        className={`btn ${draft.paymentMethod === 'BAR' ? 'btn-toggle-active' : ''}`}
                                        onClick={() => setDraft({ ...draft, paymentMethod: 'BAR' })}
                                    >
                                        Bar
                                    </button>
                                    <button
                                        type="button"
                                        className={`btn ${draft.paymentMethod === 'BANK' ? 'btn-toggle-active' : ''}`}
                                        onClick={() => setDraft({ ...draft, paymentMethod: 'BANK' })}
                                    >
                                        Bank
                                    </button>
                                </div>
                            </div>
                            <div className="field" style={{ gridColumn: 'span 2' }}>
                                <label>Beschreibung</label>
                                <input
                                    type="text"
                                    className="input"
                                    value={draft.description}
                                    onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                                    placeholder="Beschreibung der Buchung"
                                />
                            </div>
                            <div className="field">
                                <label>Bruttobetrag (Cent)</label>
                                <input
                                    type="number"
                                    className="input"
                                    value={draft.grossAmount}
                                    onChange={(e) => setDraft({ ...draft, grossAmount: Number(e.target.value) })}
                                    min={0}
                                />
                                <span className="helper">= € {(draft.grossAmount / 100).toFixed(2)}</span>
                            </div>
                            <div className="field">
                                <label>MwSt-Satz (%)</label>
                                <select
                                    className="input"
                                    value={draft.vatRate}
                                    onChange={(e) => setDraft({ ...draft, vatRate: Number(e.target.value) })}
                                >
                                    <option value={0}>0%</option>
                                    <option value={7}>7%</option>
                                    <option value={19}>19%</option>
                                </select>
                                <span className="helper">Netto: € {(netAmount / 100).toFixed(2)}</span>
                            </div>
                            <div className="field">
                                <label>Gegenpartei</label>
                                <input
                                    type="text"
                                    className="input"
                                    value={draft.counterparty}
                                    onChange={(e) => setDraft({ ...draft, counterparty: e.target.value })}
                                    placeholder="Zahler/Empfänger"
                                />
                            </div>
                            <div className="field">
                                <label>Zweckbindung</label>
                                <select
                                    className="input"
                                    value={draft.earmarkId ?? ''}
                                    onChange={(e) => setDraft({ ...draft, earmarkId: e.target.value ? Number(e.target.value) : null })}
                                >
                                    <option value="">– Keine –</option>
                                    {earmarks.map((em) => (
                                        <option key={em.id} value={em.id}>{em.code} – {em.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="field">
                                <label>Budget</label>
                                <select
                                    className="input"
                                    value={draft.budgetId ?? ''}
                                    onChange={(e) => setDraft({ ...draft, budgetId: e.target.value ? Number(e.target.value) : null })}
                                >
                                    <option value="">– Kein Budget –</option>
                                    {budgetsForEdit.map((b) => (
                                        <option key={b.id} value={b.id}>{b.label}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="field" style={{ gridColumn: 'span 2' }}>
                                <TagsEditor
                                    label="Tags"
                                    value={draft.tags}
                                    onChange={(tags) => setDraft({ ...draft, tags })}
                                    tagDefs={tagDefs}
                                />
                            </div>
                        </div>
                    </div>
                )}

                <div className="field">
                    <label>Notizen (optional)</label>
                    <textarea
                        className="input"
                        rows={2}
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

export default function SubmissionsView({ notify, bumpDataVersion, eurFmt, fmtDate, earmarks, budgetsForEdit, tagDefs }: SubmissionsViewProps) {
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

    // Approve submission with edited voucher data
    const handleApprove = async (notes: string, draft: VoucherDraft) => {
        if (!reviewSubmission) return
        try {
            // First create the voucher with the edited data
            const voucherPayload = {
                date: draft.date,
                type: draft.type,
                sphere: draft.sphere,
                description: draft.description || undefined,
                grossAmount: draft.grossAmount,
                vatRate: draft.vatRate,
                paymentMethod: draft.paymentMethod,
                earmarkId: draft.earmarkId || undefined,
                budgetId: draft.budgetId || undefined,
                tags: draft.tags.length > 0 ? draft.tags : undefined,
                counterparty: draft.counterparty || undefined
            }
            
            const voucherRes = await (window as any).api?.vouchers?.create?.(voucherPayload)
            
            if (voucherRes?.id) {
                // Mark submission as approved with the voucher ID
                await (window as any).api?.submissions?.approve?.({
                    id: reviewSubmission.id,
                    reviewerNotes: notes,
                    voucherId: voucherRes.id
                })
                notify('success', `Einreichung genehmigt – Buchung #${voucherRes.voucherNo} erstellt`)
            } else {
                notify('error', 'Buchung konnte nicht erstellt werden')
                return
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
                    earmarks={earmarks}
                    budgetsForEdit={budgetsForEdit}
                    tagDefs={tagDefs}
                />
            )}
        </div>
    )
}
