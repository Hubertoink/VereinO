import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { ICONS } from '../../utils/icons'
import TagsEditor from '../../components/TagsEditor'

// Unicode icons for buttons
const ICON_IMPORT = '📥'
const ICON_DELETE = ICONS.DELETE

// Type matching the backend schema
interface Submission {
    id: number
    externalId?: string | null
    date: string
    type: 'IN' | 'OUT'
    sphere?: 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB' | null
    paymentMethod?: 'BAR' | 'BANK' | null
    description?: string | null
    grossAmount: number
    categoryHint?: string | null
    counterparty?: string | null
    submittedBy: string
    submittedAt: string
    status: 'pending' | 'approved' | 'rejected'
    reviewedAt?: string | null
    reviewerNotes?: string | null
    voucherId?: number | null
    attachments?: Array<{
        id: number
        filename: string
        mimeType?: string | null
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
    // Attachment changes
    removedAttachmentIds?: number[]
    newAttachments?: Array<{ filename: string; mimeType: string; dataBase64: string }>
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
    const [previewAttachment, setPreviewAttachment] = useState<{ filename: string; mimeType?: string | null; dataBase64?: string } | null>(null)
    const [loadingPreview, setLoadingPreview] = useState(false)
    
    // Attachments management - track existing attachments and new ones
    const [existingAttachments, setExistingAttachments] = useState(submission.attachments || [])
    const [removedAttachmentIds, setRemovedAttachmentIds] = useState<number[]>([])
    const [newAttachments, setNewAttachments] = useState<Array<{ filename: string; mimeType: string; dataBase64: string }>>([])
    
    // Editable voucher draft - convert from cents to euros for display
    const [draft, setDraft] = useState<VoucherDraft>(() => ({
        date: submission.date,
        type: submission.type,
        sphere: submission.sphere || 'IDEELL',
        description: submission.description || '',
        grossAmount: submission.grossAmount, // stored in cents
        vatRate: 0,
        paymentMethod: submission.paymentMethod || 'BANK',
        earmarkId: null,
        budgetId: null,
        tags: [],
        counterparty: submission.counterparty || ''
    }))

    // Euro input state (for display, stored separately from cents)
    const [grossAmountEuro, setGrossAmountEuro] = useState(() => 
        (submission.grossAmount / 100).toFixed(2).replace('.', ',')
    )

    // ESC key handler
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose()
            }
        }
        document.addEventListener('keydown', handleKeyDown)
        return () => document.removeEventListener('keydown', handleKeyDown)
    }, [onClose])

    const handleApprove = async () => {
        setLoading(true)
        await onApprove(notes, {
            ...draft,
            removedAttachmentIds,
            newAttachments
        })
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
            <div className="modal" style={{ maxWidth: editMode ? 1100 : 600, display: 'flex', flexDirection: 'column', maxHeight: '90vh' }} onClick={(e) => e.stopPropagation()}>
                <header className="flex justify-between items-center mb-16">
                    <h2 style={{ margin: 0 }}>
                        {editMode ? 'Buchung bearbeiten & genehmigen' : 'Einreichung prüfen'}
                    </h2>
                    <button className="btn ghost" onClick={onClose} aria-label="Schließen">✕</button>
                </header>

                {/* Scrollable content area */}
                <div style={{ flex: 1, overflowY: 'auto', marginBottom: 16 }}>
                    {/* Original submission summary - like Zusammenfassung in voucher modal */}
                    <div className="card mb-16" style={{ padding: 12, background: 'var(--surface-alt)' }}>
                        <div className="helper mb-4" style={{ fontSize: 11 }}>Eingereichte Daten</div>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>
                            {submission.date} · {submission.type === 'IN' ? 'Einnahme' : 'Ausgabe'} · {submission.paymentMethod || 'BANK'} ·{' '}
                            <span style={{ color: submission.type === 'IN' ? 'var(--success)' : 'var(--danger)' }}>
                                {submission.type === 'OUT' && '-'}€ {(submission.grossAmount / 100).toFixed(2)}
                            </span>
                            {submission.sphere && ` · ${submission.sphere}`}
                        </div>
                        <div className="helper mt-4">
                            {submission.description || '–'} · Von: {submission.submittedBy}
                            {submission.categoryHint && ` · Hinweis: ${submission.categoryHint}`}
                        </div>
                        {submission.attachments && submission.attachments.length > 0 && !editMode && (
                            <div className="mt-8 flex flex-wrap gap-4">
                                {submission.attachments.map((att) => (
                                    <button
                                        key={att.id}
                                        className="chip"
                                        style={{ cursor: 'pointer' }}
                                        onClick={async () => {
                                            setLoadingPreview(true)
                                            try {
                                                const data = await (window as any).api?.submissions?.readAttachment?.({ attachmentId: att.id })
                                                if (data) {
                                                    setPreviewAttachment(data)
                                                }
                                            } catch (e) {
                                                console.error('Failed to load attachment:', e)
                                            } finally {
                                                setLoadingPreview(false)
                                            }
                                        }}
                                        title="Klicken zum Ansehen"
                                    >
                                        📎 {att.filename}
                                    </button>
                                ))}
                                {loadingPreview && <span className="helper">Lade...</span>}
                            </div>
                        )}
                    </div>

                    {/* Toggle edit mode */}
                    {!editMode ? (
                        <button className="btn mb-16" onClick={() => setEditMode(true)} style={{ width: '100%' }}>
                            {ICONS.EDIT} Buchungsdetails vor Genehmigung bearbeiten
                        </button>
                    ) : (
                        /* Editable voucher form - styled like voucher modal */
                        <div className="grid gap-16" style={{ gridTemplateColumns: '1fr 1fr' }}>
                            {/* Left column: Basis + Beschreibung & Tags */}
                            <div className="flex flex-col gap-16">
                                {/* Basis card */}
                                <div className="card" style={{ padding: 16 }}>
                                    <div className="helper mb-12" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Basis</div>
                                    <div className="grid gap-12">
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
                                        </div>
                                        <div className="grid gap-12" style={{ gridTemplateColumns: '1fr 1fr' }}>
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
                                        </div>
                                    </div>
                                </div>

                                {/* Beschreibung & Tags card */}
                                <div className="card" style={{ padding: 16 }}>
                                    <div className="helper mb-12" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Beschreibung & Tags</div>
                                    <div className="grid gap-12">
                                        <div className="field">
                                            <label>Beschreibung</label>
                                            <input
                                                type="text"
                                                className="input"
                                                value={draft.description}
                                                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                                                placeholder="z. B. Mitgliedsbeitrag, Spende ..."
                                            />
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
                                        <TagsEditor
                                            label="Tags"
                                            value={draft.tags}
                                            onChange={(tags) => setDraft({ ...draft, tags })}
                                            tagDefs={tagDefs}
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Right column: Finanzen + Anhänge */}
                            <div className="flex flex-col gap-16">
                                {/* Finanzen card */}
                                <div className="card" style={{ padding: 16 }}>
                                    <div className="helper mb-12" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Finanzen</div>
                                    <div className="grid gap-12">
                                        <div className="grid gap-12" style={{ gridTemplateColumns: '1fr 1fr' }}>
                                            <div className="field">
                                                <label>Bruttobetrag (€)</label>
                                                <input
                                                    type="text"
                                                    inputMode="decimal"
                                                    className="input"
                                                    value={grossAmountEuro}
                                                    onChange={(e) => {
                                                        const val = e.target.value
                                                        setGrossAmountEuro(val)
                                                        const parsed = parseFloat(val.replace(',', '.'))
                                                        if (!isNaN(parsed)) {
                                                            setDraft({ ...draft, grossAmount: Math.round(parsed * 100) })
                                                        }
                                                    }}
                                                    onBlur={() => {
                                                        const parsed = parseFloat(grossAmountEuro.replace(',', '.'))
                                                        if (!isNaN(parsed)) {
                                                            setGrossAmountEuro(parsed.toFixed(2).replace('.', ','))
                                                        }
                                                    }}
                                                    placeholder="z.B. 150,00"
                                                />
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
                                            </div>
                                        </div>
                                        <div className="helper" style={{ marginTop: -8 }}>Netto: € {(netAmount / 100).toFixed(2)}</div>
                                        <div className="grid gap-12" style={{ gridTemplateColumns: '1fr 1fr' }}>
                                            <div className="field">
                                                <label>Budget</label>
                                                <select
                                                    className="input"
                                                    value={draft.budgetId ?? ''}
                                                    onChange={(e) => setDraft({ ...draft, budgetId: e.target.value ? Number(e.target.value) : null })}
                                                >
                                                    <option value="">—</option>
                                                    {budgetsForEdit.map((b) => (
                                                        <option key={b.id} value={b.id}>{b.label}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div className="field">
                                                <label>Zweckbindung</label>
                                                <select
                                                    className="input"
                                                    value={draft.earmarkId ?? ''}
                                                    onChange={(e) => setDraft({ ...draft, earmarkId: e.target.value ? Number(e.target.value) : null })}
                                                >
                                                    <option value="">—</option>
                                                    {earmarks.map((em) => (
                                                        <option key={em.id} value={em.id}>{em.code} – {em.name}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Anhänge card */}
                                <div className="card" style={{ padding: 16 }}>
                                    <div className="flex justify-between items-center mb-12">
                                        <div className="helper" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Anhänge</div>
                                        <label className="btn" style={{ cursor: 'pointer', padding: '4px 10px', fontSize: 12 }}>
                                            + Datei(en)
                                            <input
                                                type="file"
                                                accept="image/*,application/pdf,.pdf,.doc,.docx,.xls,.xlsx"
                                                style={{ display: 'none' }}
                                                onChange={(e) => {
                                                    const file = e.target.files?.[0]
                                                    if (!file) return
                                                    
                                                    const isImage = file.type.startsWith('image/')
                                                    const maxSize = isImage ? 5 * 1024 * 1024 : 10 * 1024 * 1024
                                                    
                                                    if (file.size > maxSize) {
                                                        alert(`Datei zu groß (max. ${isImage ? '5' : '10'}MB)`)
                                                        return
                                                    }
                                                    
                                                    const reader = new FileReader()
                                                    reader.onload = (ev) => {
                                                        const dataUrl = ev.target?.result as string
                                                        const base64 = dataUrl.split(',')[1]
                                                        setNewAttachments([...newAttachments, {
                                                            filename: file.name,
                                                            mimeType: file.type || 'application/octet-stream',
                                                            dataBase64: base64
                                                        }])
                                                    }
                                                    reader.readAsDataURL(file)
                                                    e.target.value = ''
                                                }}
                                            />
                                        </label>
                                    </div>
                                    <div className="flex flex-wrap gap-8">
                                        {/* Existing attachments */}
                                        {existingAttachments
                                            .filter(att => !removedAttachmentIds.includes(att.id))
                                            .map((att) => (
                                                <div key={att.id} className="chip" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                                    <button
                                                        type="button"
                                                        className="btn ghost"
                                                        style={{ padding: 0, fontSize: 13 }}
                                                        onClick={async () => {
                                                            setLoadingPreview(true)
                                                            try {
                                                                const data = await (window as any).api?.submissions?.readAttachment?.({ attachmentId: att.id })
                                                                if (data) {
                                                                    setPreviewAttachment(data)
                                                                }
                                                            } catch (e) {
                                                                console.error('Failed to load attachment:', e)
                                                            } finally {
                                                                setLoadingPreview(false)
                                                            }
                                                        }}
                                                        title="Klicken zum Ansehen"
                                                    >
                                                        📎 {att.filename}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="btn ghost"
                                                        style={{ padding: 0, marginLeft: 4, color: 'var(--danger)', fontSize: 14 }}
                                                        onClick={() => setRemovedAttachmentIds([...removedAttachmentIds, att.id])}
                                                        title="Anhang entfernen"
                                                    >
                                                        ×
                                                    </button>
                                                </div>
                                            ))}
                                        {/* New attachments */}
                                        {newAttachments.map((att, idx) => (
                                            <div key={`new-${idx}`} className="chip" style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'color-mix(in oklab, var(--success) 20%, transparent)' }}>
                                                <button
                                                    type="button"
                                                    className="btn ghost"
                                                    style={{ padding: 0, fontSize: 13 }}
                                                    onClick={() => setPreviewAttachment({ filename: att.filename, mimeType: att.mimeType, dataBase64: att.dataBase64 })}
                                                    title="Klicken zum Ansehen"
                                                >
                                                    📎 {att.filename} <span className="helper">(neu)</span>
                                                </button>
                                                <button
                                                    type="button"
                                                    className="btn ghost"
                                                    style={{ padding: 0, marginLeft: 4, color: 'var(--danger)', fontSize: 14 }}
                                                    onClick={() => setNewAttachments(newAttachments.filter((_, i) => i !== idx))}
                                                    title="Anhang entfernen"
                                                >
                                                    ×
                                                </button>
                                            </div>
                                        ))}
                                        {existingAttachments.filter(att => !removedAttachmentIds.includes(att.id)).length === 0 && newAttachments.length === 0 && (
                                            <span className="helper">Keine Anhänge</span>
                                        )}
                                        {loadingPreview && <span className="helper">Lade...</span>}
                                    </div>
                                </div>

                                {/* Notizen card */}
                                <div className="card" style={{ padding: 16 }}>
                                    <div className="helper mb-12" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Notizen</div>
                                    <textarea
                                        className="input"
                                        rows={2}
                                        value={notes}
                                        onChange={(e) => setNotes(e.target.value)}
                                        placeholder="Anmerkungen zur Entscheidung..."
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Notes field only shown when not in edit mode */}
                    {!editMode && (
                        <div className="field mb-16">
                            <label>Notizen (optional)</label>
                            <textarea
                                className="input"
                                rows={2}
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                placeholder="Anmerkungen zur Entscheidung..."
                            />
                        </div>
                    )}
                </div>

                {/* Footer with shortcuts and actions */}
                <div className="flex justify-between items-center" style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 'auto' }}>
                    <span className="helper" style={{ fontSize: 11 }}>
                        Esc = Abbrechen
                    </span>
                    <div className="flex gap-8">
                        <button className="btn danger" onClick={handleReject} disabled={loading}>
                            {ICONS.CROSS} Ablehnen
                        </button>
                        <button className="btn" onClick={onClose}>Abbrechen</button>
                        <button className="btn primary" onClick={handleApprove} disabled={loading}>
                            {ICONS.CHECK} Genehmigen
                        </button>
                    </div>
                </div>

                {/* Attachment Preview Modal - rendered via portal to escape ReviewModal */}
                {previewAttachment && createPortal(
                    <div className="modal-overlay" style={{ zIndex: 10001 }} onClick={() => setPreviewAttachment(null)}>
                        <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 800, maxHeight: '90vh', overflow: 'auto', zIndex: 10002 }}>
                            <header className="flex justify-between items-center mb-16">
                                <h3 style={{ margin: 0 }}>📎 {previewAttachment.filename}</h3>
                                <button className="btn ghost" onClick={() => setPreviewAttachment(null)} aria-label="Schließen">✕</button>
                            </header>
                            <div style={{ textAlign: 'center' }}>
                                {previewAttachment.mimeType?.startsWith('image/') ? (
                                    <img
                                        src={`data:${previewAttachment.mimeType};base64,${previewAttachment.dataBase64}`}
                                        alt={previewAttachment.filename}
                                        style={{ maxWidth: '100%', maxHeight: '70vh', borderRadius: 8 }}
                                    />
                                ) : previewAttachment.mimeType === 'application/pdf' ? (
                                    <iframe
                                        src={`data:application/pdf;base64,${previewAttachment.dataBase64}`}
                                        style={{ width: '100%', height: '70vh', border: 'none', borderRadius: 8 }}
                                        title={previewAttachment.filename}
                                    />
                                ) : (
                                    <div className="card" style={{ padding: 32, background: 'var(--surface-alt)' }}>
                                        <p style={{ fontSize: 48, marginBottom: 8 }}>📄</p>
                                        <p style={{ fontWeight: 600 }}>{previewAttachment.filename}</p>
                                        <p className="helper">Vorschau nicht verfügbar für diesen Dateityp</p>
                                    </div>
                                )}
                            </div>
                            <div className="flex justify-end mt-16 gap-8">
                                <button 
                                    className="btn"
                                    onClick={() => {
                                        // Download the file
                                        const link = document.createElement('a')
                                        link.href = `data:${previewAttachment.mimeType || 'application/octet-stream'};base64,${previewAttachment.dataBase64}`
                                        link.download = previewAttachment.filename
                                        document.body.appendChild(link)
                                        link.click()
                                        document.body.removeChild(link)
                                    }}
                                >
                                    📥 Herunterladen
                                </button>
                                <button className="btn" onClick={() => setPreviewAttachment(null)}>Schließen</button>
                            </div>
                        </div>
                    </div>,
                    document.body
                )}
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
    const [deleteConfirm, setDeleteConfirm] = useState<Submission | null>(null)
    const [deleting, setDeleting] = useState(false)
    const [showHelp, setShowHelp] = useState(false)
    const helpButtonRef = useRef<HTMLButtonElement>(null)

    // Click-outside handler for help flyout
    useEffect(() => {
        if (!showHelp) return
        const handleClickOutside = (e: MouseEvent) => {
            const target = e.target as Node
            const flyout = document.getElementById('submissions-help-flyout')
            if (flyout && !flyout.contains(target) && helpButtonRef.current && !helpButtonRef.current.contains(target)) {
                setShowHelp(false)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [showHelp])

    // ESC key handler for delete modal
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && deleteConfirm) {
                setDeleteConfirm(null)
            }
        }
        document.addEventListener('keydown', handleKeyDown)
        return () => document.removeEventListener('keydown', handleKeyDown)
    }, [deleteConfirm])

    // Load submissions
    const loadSubmissions = useCallback(async () => {
        setLoading(true)
        setError('')
        try {
            const filter = filterStatus === 'ALL' ? {} : { status: filterStatus }
            const res = await (window as any).api?.submissions?.list?.(filter)
            if (res?.rows) {
                setSubmissions(res.rows)
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
                // Trigger badge updates
                window.dispatchEvent(new Event('data-changed'))
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
            // Build description with counterparty appended if present
            let finalDescription = draft.description || ''
            if (draft.counterparty && draft.counterparty.trim()) {
                if (finalDescription) {
                    finalDescription = `${finalDescription} - ${draft.counterparty.trim()}`
                } else {
                    finalDescription = draft.counterparty.trim()
                }
            }

            // First create the voucher with the edited data
            // Note: Voucher API expects Euro, but draft.grossAmount is in cents
            const voucherPayload = {
                date: draft.date,
                type: draft.type,
                sphere: draft.sphere,
                description: finalDescription || undefined,
                grossAmount: draft.grossAmount / 100, // Convert from cents to euros
                vatRate: draft.vatRate,
                paymentMethod: draft.paymentMethod,
                earmarkId: draft.earmarkId || undefined,
                budgetId: draft.budgetId || undefined,
                tags: draft.tags.length > 0 ? draft.tags : undefined
            }
            
            const voucherRes = await (window as any).api?.vouchers?.create?.(voucherPayload)
            
            if (voucherRes?.id) {
                // Copy attachments from submission to voucher (excluding removed ones)
                const removedIds = draft.removedAttachmentIds || []
                if (reviewSubmission.attachments && reviewSubmission.attachments.length > 0) {
                    for (const att of reviewSubmission.attachments) {
                        // Skip removed attachments
                        if (removedIds.includes(att.id)) continue
                        
                        try {
                            // Read the attachment data from submission
                            const attData = await (window as any).api?.submissions?.readAttachment?.({ attachmentId: att.id })
                            if (attData?.dataBase64) {
                                // Add to voucher
                                await (window as any).api?.attachments?.add?.({
                                    voucherId: voucherRes.id,
                                    fileName: attData.filename,
                                    dataBase64: attData.dataBase64,
                                    mimeType: attData.mimeType
                                })
                            }
                        } catch (attErr) {
                            console.error('Failed to copy attachment:', att.id, attErr)
                        }
                    }
                }
                
                // Add new attachments
                if (draft.newAttachments && draft.newAttachments.length > 0) {
                    for (const newAtt of draft.newAttachments) {
                        try {
                            await (window as any).api?.attachments?.add?.({
                                voucherId: voucherRes.id,
                                fileName: newAtt.filename,
                                dataBase64: newAtt.dataBase64,
                                mimeType: newAtt.mimeType
                            })
                        } catch (attErr) {
                            console.error('Failed to add new attachment:', newAtt.filename, attErr)
                        }
                    }
                }

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
            window.dispatchEvent(new Event('data-changed'))
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
            window.dispatchEvent(new Event('data-changed'))
        } catch (e: any) {
            notify('error', 'Ablehnung fehlgeschlagen: ' + (e?.message || e))
        }
    }

    // Delete submission
    const handleDelete = async (sub: Submission) => {
        setDeleteConfirm(sub)
    }

    const confirmDelete = async () => {
        if (!deleteConfirm) return
        setDeleting(true)
        try {
            await (window as any).api?.submissions?.delete?.({ id: deleteConfirm.id })
            notify('success', 'Einreichung gelöscht')
            setDeleteConfirm(null)
            loadSubmissions()
            bumpDataVersion()
            window.dispatchEvent(new Event('data-changed'))
        } catch (e: any) {
            notify('error', 'Löschen fehlgeschlagen: ' + (e?.message || e))
        } finally {
            setDeleting(false)
        }
    }

    // Filtered and sorted submissions
    const filteredSubmissions = useMemo(() => {
        // Sort: pending first, then by date desc
        return [...submissions].sort((a, b) => {
            if (a.status === 'pending' && b.status !== 'pending') return -1
            if (a.status !== 'pending' && b.status === 'pending') return 1
            return new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()
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
                <div className="flex gap-8" style={{ position: 'relative' }}>
                    <button
                        ref={helpButtonRef}
                        className="btn-info-icon"
                        onClick={() => setShowHelp(!showHelp)}
                        title="Hilfe anzeigen"
                        aria-label="Hilfe anzeigen"
                        aria-expanded={showHelp}
                    >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10" />
                            <line x1="12" y1="16" x2="12" y2="12" />
                            <line x1="12" y1="8" x2="12.01" y2="8" />
                        </svg>
                    </button>
                    {showHelp && (
                        <div
                            id="submissions-help-flyout"
                            className="flyout-popover"
                            role="tooltip"
                            style={{
                                position: 'absolute',
                                top: '100%',
                                right: 0,
                                marginTop: 8,
                                width: 360,
                                zIndex: 100
                            }}
                        >
                            <div className="flyout-arrow" />
                            <h4 className="flyout-title">Wie funktioniert das?</h4>
                            <p className="flyout-text">
                                Mitglieder können ihre Auslagen über die Web-App unter{' '}
                                <a
                                    href="#"
                                    onClick={(e) => { e.preventDefault(); window.api?.shell?.openExternal?.('https://vereino.kassiero.de/') }}
                                    className="flyout-link"
                                >
                                    vereino.kassiero.de
                                </a>{' '}
                                erfassen.
                            </p>
                            <p className="flyout-text" style={{ marginBottom: 0 }}>
                                Am Ende wird eine Datei (<code>.vereino-submission.json</code>) erstellt, die das Mitglied an den Kassenwart sendet.
                                Diese Datei kann über den <strong>Importieren</strong>-Button eingelesen werden.
                            </p>
                        </div>
                    )}
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
                                <th style={{ textAlign: 'left' }}>Status</th>
                                <th style={{ textAlign: 'left' }}>Datum</th>
                                <th style={{ textAlign: 'left' }}>Typ</th>
                                <th style={{ textAlign: 'left' }}>Beschreibung</th>
                                <th style={{ textAlign: 'right' }}>Betrag</th>
                                <th style={{ textAlign: 'left' }}>Eingereicht von</th>
                                <th style={{ textAlign: 'left' }}>Eingereicht am</th>
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
                                        {sub.type === 'OUT' && '-'}€ {(sub.grossAmount / 100).toFixed(2)}
                                    </td>
                                    <td>{sub.submittedBy}</td>
                                    <td>{fmtDate(sub.submittedAt.slice(0, 10))}</td>
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
                                            {sub.voucherId && (
                                                <button className="btn" title={`Zur Buchung #${sub.voucherId}`}>
                                                    #{sub.voucherId}
                                                </button>
                                            )}
                                            <button
                                                className="btn danger"
                                                onClick={() => handleDelete(sub)}
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

            {/* Delete Confirmation Modal */}
            {deleteConfirm && (
                <div className="modal-overlay" role="dialog" aria-modal="true" onClick={() => setDeleteConfirm(null)}>
                    <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
                        <header className="flex justify-between items-center mb-16">
                            <h2 style={{ margin: 0 }}>Einreichung löschen</h2>
                            <button className="btn ghost" onClick={() => setDeleteConfirm(null)} aria-label="Schließen">✕</button>
                        </header>
                        <div className="mb-16">
                            <p style={{ margin: '0 0 8px 0' }}>Diese Einreichung wirklich löschen?</p>
                            <div className="card" style={{ padding: 12, background: 'var(--surface-alt)' }}>
                                <div className="grid gap-4" style={{ gridTemplateColumns: '1fr 1fr' }}>
                                    <div>
                                        <span className="helper">Datum:</span> {fmtDate(deleteConfirm.date)}
                                    </div>
                                    <div>
                                        <span className="helper">Betrag:</span>{' '}
                                        <strong style={{ color: deleteConfirm.type === 'IN' ? 'var(--success)' : 'var(--danger)' }}>
                                            {deleteConfirm.type === 'OUT' && '-'}€ {(deleteConfirm.grossAmount / 100).toFixed(2)}
                                        </strong>
                                    </div>
                                    <div style={{ gridColumn: 'span 2' }}>
                                        <span className="helper">Beschreibung:</span> {deleteConfirm.description || '–'}
                                    </div>
                                    <div>
                                        <span className="helper">Eingereicht von:</span> {deleteConfirm.submittedBy}
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="flex justify-end gap-8">
                            <button className="btn" onClick={() => setDeleteConfirm(null)}>Abbrechen</button>
                            <button className="btn danger" onClick={confirmDelete} disabled={deleting}>
                                {deleting ? 'Lösche...' : 'Ja, löschen'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
