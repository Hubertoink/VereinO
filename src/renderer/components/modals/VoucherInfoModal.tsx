import React, { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import TagsEditor from '../TagsEditor'
import { IconAttachment, IconBank, IconCash, IconArrow } from '../../utils/icons'
import { isMetaAmountValid } from './voucherMetaValidation'

// Types for multiple budget/earmark assignments
type BudgetAssignment = { id?: number; budgetId: number; amount: number; label?: string; color?: string | null }
type EarmarkAssignment = { id?: number; earmarkId: number; amount: number; code?: string; name?: string; color?: string | null }

type VoucherInfo = {
  id: number
  voucherNo: string
  date: string
  type: 'IN' | 'OUT' | 'TRANSFER' | 'INTERNAL'
  sphere: 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'
  description?: string | null
  note?: string | null
  paymentMethod?: 'BAR' | 'BANK' | null
  paymentAccountName?: string | null
  paymentAccountKind?: 'CASH' | 'BANK' | 'PAYPAL' | 'CARD' | 'OTHER' | null
  transferFrom?: 'BAR' | 'BANK' | null
  transferTo?: 'BAR' | 'BANK' | null
  transferFromAccountName?: string | null
  transferToAccountName?: string | null
  grossAmount: number
  originalId?: number | null
  originalVoucherNo?: string | null
  reversedById?: number | null
  reversedByVoucherNo?: string | null
  earmarkId?: number | null
  earmarkCode?: string | null
  budgetId?: number | null
  budgetLabel?: string | null
  budgetColor?: string | null
  tags?: string[]
  hasFiles?: boolean
  fileCount?: number
  // Multiple assignments
  budgets?: BudgetAssignment[]
  earmarksAssigned?: EarmarkAssignment[]
}

interface VoucherInfoModalProps {
  voucher: VoucherInfo
  onClose: () => void
  eurFmt: Intl.NumberFormat
  fmtDate: (d: string) => string
  notify: (type: 'info' | 'success' | 'error', text: string, duration?: number) => void
  earmarks?: Array<{ id: number; code: string; name: string; color?: string | null }>
  budgets?: Array<{ id: number; label: string; color?: string | null }>
  tagDefs?: Array<{ id: number; name: string; color?: string | null }>
  allowVoucherDeletion?: boolean
  onReverse?: () => void
  onOpenAttachments?: () => void
  onSaveMeta?: (payload: {
    note: string | null
    budgets: Array<{ budgetId: number; amount: number }>
    earmarks: Array<{ earmarkId: number; amount: number }>
    tags: string[]
  }) => Promise<void> | void
  windowMode?: boolean
}

// Helper for contrast text color
function contrastText(bg?: string | null) {
  if (!bg) return '#000'
  const m = /^#?([0-9a-fA-F]{6})$/.exec(bg.trim())
  if (!m) return '#000'
  const hex = m[1]
  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.6 ? '#000' : '#fff'
}

const IconEdit = ({ size = 28 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 20h4l10.5-10.5a2.8 2.8 0 0 0-4-4L4 16v4Z" />
    <path d="m13.5 6.5 4 4" />
    <path d="M12 20h8" />
  </svg>
)

const IconSave = ({ size = 26 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 3h12l2 2v16H5V3Z" />
    <path d="M8 3v6h8V3" />
    <path d="M8 21v-7h8v7" />
  </svg>
)

export default function VoucherInfoModal({ voucher, onClose, eurFmt, fmtDate, notify, earmarks = [], budgets = [], tagDefs = [], allowVoucherDeletion = false, onReverse, onOpenAttachments, onSaveMeta, windowMode = false }: VoucherInfoModalProps) {
  const typeLabel = voucher.type === 'IN' ? 'Einnahme' : voucher.type === 'OUT' ? 'Ausgabe' : voucher.type === 'INTERNAL' ? 'Interne Umbuchung' : 'Umbuchung'
  const sphereLabel = voucher.sphere === 'IDEELL' ? 'Ideell' : voucher.sphere === 'ZWECK' ? 'Zweckbetrieb' : voucher.sphere === 'VERMOEGEN' ? 'Vermögensverwaltung' : 'Wirt. Geschäftsbetrieb'
  const isReversalVoucher = !!voucher.originalId
  const isReversedOriginal = !!voucher.reversedById
  const originalRef = voucher.originalVoucherNo ? `#${voucher.originalVoucherNo}` : voucher.originalId ? `#${voucher.originalId}` : ''
  const reversedByRef = voucher.reversedByVoucherNo ? `#${voucher.reversedByVoucherNo}` : voucher.reversedById ? `#${voucher.reversedById}` : ''
  const statusLabel = isReversalVoucher
    ? `Stornobuchung zu ${originalRef || 'Originalbuchung'}`
    : isReversedOriginal
      ? `Storniert durch ${reversedByRef || 'Stornobuchung'}`
      : 'Aktiv'
  
  // Build budget assignments list
  const budgetAssignments: BudgetAssignment[] = voucher.budgets && voucher.budgets.length > 0
    ? voucher.budgets
    : voucher.budgetId && voucher.budgetLabel
      ? [{ budgetId: voucher.budgetId, label: voucher.budgetLabel, amount: 0, color: voucher.budgetColor }]
      : []
  
  // Build earmark assignments list
  const earmarkAssignments: EarmarkAssignment[] = voucher.earmarksAssigned && voucher.earmarksAssigned.length > 0
    ? voucher.earmarksAssigned
    : voucher.earmarkId && voucher.earmarkCode
      ? [{ earmarkId: voucher.earmarkId, code: voucher.earmarkCode, amount: 0 }]
      : []
  
  // Enrich earmark assignments with colors from earmarks list
  const enrichedEarmarks = earmarkAssignments.map(ea => {
    const found = earmarks.find(e => e.id === ea.earmarkId || e.code === ea.code)
    return { ...ea, color: ea.color || found?.color || null, code: ea.code || found?.code || `#${ea.earmarkId}` }
  })
  
  // Build tag display info
  const tagList = (voucher.tags || []).map(tagName => {
    const def = tagDefs.find(t => t.name.toLowerCase() === tagName.toLowerCase())
    return { name: tagName, color: def?.color || null }
  })
  
  // Payment label for copy functions
  let paymentLabel = ''
  if (voucher.type === 'TRANSFER') {
    const fromLabel = voucher.transferFromAccountName?.trim() || (voucher.transferFrom === 'BAR' ? 'Bar' : voucher.transferFrom === 'BANK' ? 'Bank' : 'Konto')
    const toLabel = voucher.transferToAccountName?.trim() || (voucher.transferTo === 'BAR' ? 'Bar' : voucher.transferTo === 'BANK' ? 'Bank' : 'Konto')
    paymentLabel = `${fromLabel} → ${toLabel}`
  } else if (voucher.type === 'INTERNAL') {
    paymentLabel = 'intern'
  } else {
    const methodLabel = voucher.paymentMethod === 'BAR' ? 'Bar' : voucher.paymentMethod === 'BANK' ? 'Bank' : null
    const accountLabel = voucher.paymentAccountName?.trim()
    paymentLabel = methodLabel && accountLabel ? `${methodLabel} · ${accountLabel}` : methodLabel || accountLabel || '-'
  }
  
  const budgetDisplay = budgetAssignments.length > 0 
    ? budgetAssignments.map(b => b.label || `#${b.budgetId}`).join(', ') 
    : '-'
  const earmarkDisplay = enrichedEarmarks.length > 0 
    ? enrichedEarmarks.map(e => e.code).join(', ') 
    : '-'
  const tagsDisplay = voucher.tags && voucher.tags.length > 0 ? voucher.tags.join(', ') : '-'
  const [editingMeta, setEditingMeta] = useState(false)
  const [savingMeta, setSavingMeta] = useState(false)
  const [metaNote, setMetaNote] = useState(voucher.note || '')
  const [metaBudgets, setMetaBudgets] = useState<Array<{ budgetId: number; amount: number }>>([])
  const [metaEarmarks, setMetaEarmarks] = useState<Array<{ earmarkId: number; amount: number }>>([])
  const [metaTags, setMetaTags] = useState<string[]>(voucher.tags || [])
  const [metaError, setMetaError] = useState('')
  const grossLimit = Math.abs(Number(voucher.grossAmount || 0))
  const totalBudgetAmount = metaBudgets.reduce((sum, b) => sum + Number(b.amount || 0), 0)
  const totalEarmarkAmount = metaEarmarks.reduce((sum, e) => sum + Number(e.amount || 0), 0)
  const budgetExceedsGross = totalBudgetAmount > grossLimit + 0.001
  const earmarkExceedsGross = totalEarmarkAmount > grossLimit + 0.001

  useEffect(() => {
    setMetaNote(voucher.note || '')
    setMetaBudgets(budgetAssignments.map((b) => ({ budgetId: b.budgetId, amount: Number(b.amount || voucher.grossAmount || 0) })))
    setMetaEarmarks(earmarkAssignments.map((e) => ({ earmarkId: e.earmarkId, amount: Number(e.amount || voucher.grossAmount || 0) })))
    setMetaTags(voucher.tags || [])
    setMetaError('')
    setEditingMeta(false)
  }, [voucher.id])

  const availableBudgets = useMemo(() => budgets || [], [budgets])
  const availableEarmarks = useMemo(() => earmarks || [], [earmarks])
  const isLockedByStorno = isReversalVoucher || isReversedOriginal
  const canEditMeta = !!onSaveMeta && !isLockedByStorno
  const canSaveMeta = canEditMeta && !savingMeta

  const resetMetaDraft = () => {
    setMetaNote(voucher.note || '')
    setMetaBudgets(budgetAssignments.map((b) => ({ budgetId: b.budgetId, amount: Number(b.amount || voucher.grossAmount || 0) })))
    setMetaEarmarks(earmarkAssignments.map((e) => ({ earmarkId: e.earmarkId, amount: Number(e.amount || voucher.grossAmount || 0) })))
    setMetaTags(voucher.tags || [])
    setMetaError('')
  }

  const validateMeta = () => {
    const isInternal = voucher.type === 'INTERNAL'
    const incompleteBudget = metaBudgets.find((b) => !b.budgetId || !isMetaAmountValid(Number(b.amount), isInternal))
    if (incompleteBudget) return isInternal
      ? 'Bitte wähle für jede Budget-Zeile ein Budget aus und gib einen von 0 verschiedenen Betrag ein.'
      : 'Bitte wähle für jede Budget-Zeile ein Budget aus und gib einen Betrag größer 0 ein.'
    const incompleteEarmark = metaEarmarks.find((e) => !e.earmarkId || !isMetaAmountValid(Number(e.amount), isInternal))
    if (incompleteEarmark) return isInternal
      ? 'Bitte wähle für jede Zweckbindungs-Zeile eine Zweckbindung aus und gib einen von 0 verschiedenen Betrag ein.'
      : 'Bitte wähle für jede Zweckbindungs-Zeile eine Zweckbindung aus und gib einen Betrag größer 0 ein.'
    const duplicateBudget = new Set(metaBudgets.map((b) => b.budgetId).filter(Boolean)).size !== metaBudgets.filter((b) => b.budgetId).length
    if (duplicateBudget) return 'Ein Budget kann hier nur einmal zugeordnet werden.'
    const duplicateEarmark = new Set(metaEarmarks.map((e) => e.earmarkId).filter(Boolean)).size !== metaEarmarks.filter((e) => e.earmarkId).length
    if (duplicateEarmark) return 'Eine Zweckbindung kann hier nur einmal zugeordnet werden.'
    if (budgetExceedsGross) return `Die Budget-Zuordnungen (${eurFmt.format(totalBudgetAmount)}) dürfen den Bruttobetrag (${eurFmt.format(grossLimit)}) nicht übersteigen.`
    if (earmarkExceedsGross) return `Die Zweckbindungs-Zuordnungen (${eurFmt.format(totalEarmarkAmount)}) dürfen den Bruttobetrag (${eurFmt.format(grossLimit)}) nicht übersteigen.`
    return ''
  }

  const saveMeta = async () => {
    if (!onSaveMeta) return
    const validationMessage = validateMeta()
    if (validationMessage) {
      setMetaError(validationMessage)
      return
    }
    const isInternal = voucher.type === 'INTERNAL'
    const cleanBudgets = metaBudgets
      .filter((b) => b.budgetId && isMetaAmountValid(Number(b.amount), isInternal))
      .map((b) => ({ budgetId: Number(b.budgetId), amount: Number(b.amount) }))
    const cleanEarmarks = metaEarmarks
      .filter((e) => e.earmarkId && isMetaAmountValid(Number(e.amount), isInternal))
      .map((e) => ({ earmarkId: Number(e.earmarkId), amount: Number(e.amount) }))

    setSavingMeta(true)
    try {
      await onSaveMeta({
        note: metaNote.trim() ? metaNote.trim() : null,
        budgets: cleanBudgets,
        earmarks: cleanEarmarks,
        tags: metaTags,
      })
      setEditingMeta(false)
      setMetaError('')
      notify('success', 'Buchungsdetails aktualisiert', 2000)
    } catch (e: any) {
      const message = e?.message || String(e)
      setMetaError(message)
      notify('error', message, 3000)
    } finally {
      setSavingMeta(false)
    }
  }

  // Escape key handler
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  // Kopier-Funktionen
  const copyAsText = () => {
    const text = `Datum: ${fmtDate(voucher.date)}
Belegnummer: ${voucher.voucherNo}
Beschreibung: ${voucher.description || '-'}
Kommentar: ${voucher.note || '-'}
Brutto: ${eurFmt.format(voucher.grossAmount)}
Art: ${typeLabel}
Sphäre: ${sphereLabel}
Budget: ${budgetDisplay}
Zweckbindung: ${earmarkDisplay}
Zahlweg: ${paymentLabel}
Tags: ${tagsDisplay}`
    const withStatus = `${text}
Status: ${statusLabel}`
    
    navigator.clipboard.writeText(withStatus).then(() => {
      notify('success', 'Als Text kopiert', 2000)
    }).catch(() => {
      notify('error', 'Kopieren fehlgeschlagen', 2000)
    })
  }

  const copyForExcel = () => {
    // Tab-separated format (headers + data)
    const headers = 'Datum\tBelegnummer\tBeschreibung\tKommentar\tBrutto\tArt\tSphäre\tBudget\tZweckbindung\tZahlweg\tTags\tStatus'
    const data = `${fmtDate(voucher.date)}\t${voucher.voucherNo}\t${voucher.description || '-'}\t${voucher.note || '-'}\t${eurFmt.format(voucher.grossAmount)}\t${typeLabel}\t${sphereLabel}\t${budgetDisplay}\t${earmarkDisplay}\t${paymentLabel}\t${tagsDisplay}\t${statusLabel}`
    const combined = `${headers}\n${data}`
    
    navigator.clipboard.writeText(combined).then(() => {
      notify('success', 'Für Excel kopiert', 2000)
    }).catch(() => {
      notify('error', 'Kopieren fehlgeschlagen', 2000)
    })
  }

  return createPortal(
    <div
      className={`modal-overlay voucher-info-modal-overlay${windowMode ? ' voucher-info-modal-overlay--window' : ''}`}
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (windowMode) {
          e.stopPropagation()
          return
        }
      }}
      onClick={(e) => {
        if (windowMode) {
          e.stopPropagation()
          return
        }
      }}
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        background: windowMode ? 'transparent' : 'color-mix(in oklab, var(--surface) 65%, transparent)',
        padding: windowMode ? '0' : '24px 16px',
        zIndex: 9999,
        overflowY: 'auto',
        WebkitAppRegion: 'no-drag',
        pointerEvents: 'auto'
      } as React.CSSProperties}
    >
      <div
        className={`modal voucher-info-modal${windowMode ? ' voucher-info-modal--window' : ''}`}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: windowMode ? '100vw' : 'min(680px, 96vw)',
          height: windowMode ? '100dvh' : undefined,
          maxHeight: windowMode ? '100dvh' : '92vh',
          display: 'flex',
          flexDirection: 'column',
          borderRadius: windowMode ? 0 : 12,
          boxShadow: windowMode ? 'none' : '0 8px 24px rgba(0,0,0,0.25)',
          background: 'var(--surface)',
          padding: windowMode ? 0 : 16,
          WebkitAppRegion: 'no-drag',
          pointerEvents: 'auto',
          position: 'relative',
          zIndex: 1,
          userSelect: 'text'
        } as React.CSSProperties}
      >
        {/* Header */}
        <header
          className={windowMode ? 'modal-header-flex detached-booking-titlebar' : undefined}
          style={windowMode
            ? ({ pointerEvents: 'auto', padding: '8px 16px 0' } as React.CSSProperties)
            : { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}
        >
          <div style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            <h2 style={{ margin: 0, fontSize: 18 }}>📋 Buchungsdetails</h2>
          </div>
          <div className={windowMode ? 'booking-modal-header-actions' : undefined} style={windowMode ? ({ WebkitAppRegion: 'no-drag', pointerEvents: 'auto' } as React.CSSProperties) : { display: 'flex', alignItems: 'center', gap: 8 }}>
            {editingMeta ? (
              <button
                className="btn ghost booking-modal-icon-btn voucher-info-save-btn"
                onClick={saveMeta}
                disabled={!canSaveMeta || budgetExceedsGross || earmarkExceedsGross}
                title={savingMeta ? 'Speichert ...' : 'Details speichern'}
                aria-label={savingMeta ? 'Speichert ...' : 'Details speichern'}
              >
                <IconSave size={22} />
              </button>
            ) : null}
            {canEditMeta ? (
              <button
                className={`btn ghost booking-modal-icon-btn voucher-info-edit-btn${editingMeta ? ' voucher-info-edit-btn--active' : ''}`}
                onClick={() => {
                  if (editingMeta) resetMetaDraft()
                  setEditingMeta((v) => !v)
                }}
                disabled={savingMeta}
                title={editingMeta ? 'Bearbeitung beenden' : 'Details bearbeiten'}
                aria-label={editingMeta ? 'Bearbeitung beenden' : 'Details bearbeiten'}
              >
                <IconEdit size={24} />
              </button>
            ) : null}
            <button className="btn ghost booking-modal-icon-btn booking-modal-close-btn" onClick={onClose} aria-label="Schließen" title="Schließen (ESC)" style={{ fontSize: windowMode ? undefined : 20 }}>
              ✕
            </button>
          </div>
        </header>

        {/* Content */}
        <div className="voucher-info-modal__content" style={{ WebkitAppRegion: 'no-drag', pointerEvents: 'auto', padding: windowMode ? '12px 16px 0' : undefined } as React.CSSProperties}>
          <div className={`card voucher-info-card${editingMeta ? ' voucher-info-card--meta-editing' : ''}`} style={{ padding: 12, display: 'grid', gap: 8, overflow: 'visible' }}>
            <div className="voucher-info-primary-grid">
              <div className="voucher-info-primary-grid__left">
                <div className="voucher-info-row">
                  <span className="voucher-info-row__label">Datum:</span>
                  <span className="voucher-info-row__value" style={{ fontWeight: 600 }}>{fmtDate(voucher.date)}</span>
                </div>
                <div className="voucher-info-row">
                  <span className="voucher-info-row__label">Belegnummer:</span>
                  <span className="voucher-info-row__value">{voucher.voucherNo}</span>
                </div>
                {statusLabel !== 'Aktiv' ? (
                  <div className="voucher-info-row">
                    <span className="voucher-info-row__label">Status:</span>
                    <span className={`voucher-info-row__value badge ${isReversalVoucher ? 'badge-storno' : 'badge-storniert'}`}>{statusLabel}</span>
                  </div>
                ) : null}
                <div className="voucher-info-row">
                  <span className="voucher-info-row__label">Beschreibung:</span>
                  <span className="voucher-info-row__value" style={{ wordBreak: 'break-word' }}>{voucher.description || '-'}</span>
                </div>
              </div>
              <div className="voucher-info-primary-grid__right">
                <div className={`voucher-info-row voucher-info-note-row${editingMeta ? ' voucher-info-note-row--editing' : ''}`}>
                  <span className="voucher-info-row__label">Kommentar:</span>
                  {editingMeta ? (
                    <textarea
                      className="input booking-note-textarea voucher-info-row__value"
                      rows={3}
                      value={metaNote}
                      onChange={(e) => setMetaNote(e.target.value)}
                      placeholder="Interne Notiz, Rückfrage, Ablagehinweis ..."
                    />
                  ) : (
                    <span className="voucher-info-row__value" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{voucher.note || '-'}</span>
                  )}
                </div>
                <div className="voucher-info-row voucher-info-attachment-row">
                  <span className="voucher-info-row__label">Anhang:</span>
                  <div className="voucher-info-row__value voucher-info-attachment-actions">
                    {voucher.hasFiles || (voucher.fileCount || 0) > 0 ? (
                      <button type="button" className="btn voucher-info-attachment-btn" onClick={onOpenAttachments} disabled={!onOpenAttachments}>
                        📎 {voucher.fileCount || 1} {(voucher.fileCount || 1) === 1 ? 'Beleg' : 'Belege'} anzeigen
                      </button>
                    ) : <span>Kein Anhang</span>}
                    <button
                      type="button"
                      className="btn ghost voucher-info-attachment-btn voucher-info-attachment-btn--add"
                      onClick={onOpenAttachments}
                      disabled={!onOpenAttachments}
                      title="Anhang hinzufügen"
                      aria-label="Anhang hinzufügen"
                    >
                      <span className="voucher-info-attachment-btn__plus" aria-hidden="true">+</span>
                      <IconAttachment size={14} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="card voucher-info-card" style={{ padding: 12, display: 'grid', gap: 8 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 8, alignItems: 'center' }}>
              <span style={{ color: 'var(--text-dim)', fontWeight: 500 }}>Brutto:</span>
              <span style={{ 
                fontWeight: 700, 
                fontSize: 16,
                color: voucher.type === 'IN' ? 'var(--success)' : voucher.type === 'OUT' ? 'var(--danger)' : 'var(--warning)'
              }}>
                {eurFmt.format(voucher.grossAmount)}
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 8, alignItems: 'center' }}>
              <span style={{ color: 'var(--text-dim)', fontWeight: 500 }}>Art:</span>
              <div>
                <span className={`badge ${voucher.type.toLowerCase()}`}>{voucher.type}</span>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 8, alignItems: 'center' }}>
              <span style={{ color: 'var(--text-dim)', fontWeight: 500 }}>Sphäre:</span>
              <span>{sphereLabel}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 8, alignItems: 'center' }}>
              <span style={{ color: 'var(--text-dim)', fontWeight: 500 }}>Zahlweg:</span>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                {voucher.type === 'TRANSFER' ? (
                  <span className={`badge pm-transfer pm-transfer-${(voucher.transferFrom || '').toLowerCase()}-${(voucher.transferTo || '').toLowerCase()}`}>
                    <span className="pm-icon">{voucher.transferFrom === 'BAR' ? <IconCash size={16} /> : <IconBank size={16} />}</span>
                    <span className="transfer-arrow">→</span>
                    <span className="pm-icon">{voucher.transferTo === 'BAR' ? <IconCash size={16} /> : <IconBank size={16} />}</span>
                  </span>
                ) : voucher.type === 'INTERNAL' ? (
                  <span className="badge pm-internal">intern</span>
                ) : voucher.paymentMethod ? (
                  <span className={`badge pm-${voucher.paymentMethod.toLowerCase()}`}>
                    {voucher.paymentMethod === 'BAR' ? <IconCash size={18} /> : <IconBank size={18} />}
                  </span>
                ) : (
                  <span>-</span>
                )}
                <span>{paymentLabel}</span>
              </div>
            </div>
          </div>

          <div className="card voucher-info-card" style={{ padding: 12, display: 'grid', gap: 8, overflow: 'visible' }}>
            {isLockedByStorno ? (
              <div className="voucher-info-meta-notice">
                Diese Buchung ist Teil einer Storno-Kette. Budget, Zweckbindung, Tags und Kommentar bleiben unverändert; Anhänge können weiterhin ergänzt werden.
              </div>
            ) : null}
            {metaError ? (
              <div className="voucher-info-meta-error" role="alert">
                {metaError}
              </div>
            ) : null}
            {editingMeta && budgetExceedsGross ? (
              <div className="voucher-info-meta-error" role="alert">
                Budget-Summe {eurFmt.format(totalBudgetAmount)} übersteigt den Bruttobetrag {eurFmt.format(grossLimit)}.
              </div>
            ) : null}
            {editingMeta && earmarkExceedsGross ? (
              <div className="voucher-info-meta-error" role="alert">
                Zweckbindungs-Summe {eurFmt.format(totalEarmarkAmount)} übersteigt den Bruttobetrag {eurFmt.format(grossLimit)}.
              </div>
            ) : null}
            <div style={{ display: 'grid', gridTemplateColumns: '140px minmax(0, 1fr)', gap: 8, alignItems: 'start' }}>
              <span style={{ color: 'var(--text-dim)', fontWeight: 500 }}>Budget:</span>
              {editingMeta ? (
                <div style={{ display: 'grid', gap: 8 }}>
                  {metaBudgets.map((item, idx) => (
                    <div key={idx} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 120px auto', gap: 8, alignItems: 'center', minWidth: 0 }}>
                      <select
                        className="input"
                        style={!item.budgetId ? { borderColor: 'var(--danger)' } : undefined}
                        value={item.budgetId || ''}
                        onChange={(e) => {
                          const next = [...metaBudgets]
                          next[idx] = { ...next[idx], budgetId: Number(e.target.value) }
                          setMetaBudgets(next)
                        }}
                      >
                        <option value="">Budget wählen</option>
                        {availableBudgets.map((b) => <option key={b.id} value={b.id}>{b.label || `#${b.id}`}</option>)}
                      </select>
                      <input
                        className="input"
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.amount || ''}
                        style={!isMetaAmountValid(Number(item.amount), voucher.type === 'INTERNAL') || budgetExceedsGross ? { borderColor: 'var(--danger)' } : undefined}
                        onChange={(e) => {
                          const next = [...metaBudgets]
                          next[idx] = { ...next[idx], amount: Number(e.target.value || 0) }
                          setMetaBudgets(next)
                        }}
                        title="Zuordnungsbetrag"
                      />
                      <button className="btn ghost" type="button" onClick={() => setMetaBudgets(metaBudgets.filter((_, i) => i !== idx))}>Entfernen</button>
                    </div>
                  ))}
                  <button className="btn" type="button" style={{ justifySelf: 'start' }} onClick={() => setMetaBudgets([...metaBudgets, { budgetId: 0, amount: Math.abs(Number(voucher.grossAmount || 0)) }])}>+ Budget</button>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {budgetAssignments.length > 0 ? (
                  budgetAssignments.map((ba, idx) => {
                    const bg = ba.color || undefined
                    return (
                      <span 
                        key={idx}
                        className="badge-budget" 
                        style={{ 
                          background: bg, 
                          color: bg ? contrastText(bg) : undefined,
                          border: bg ? `1px solid ${bg}` : undefined,
                          padding: '2px 8px',
                          borderRadius: 4,
                          display: 'inline-block'
                        }}
                        title={ba.amount ? `${eurFmt.format(ba.amount)}` : undefined}
                      >
                        {ba.label || `#${ba.budgetId}`}
                        {ba.amount ? <span style={{ marginLeft: 4, opacity: 0.8, fontSize: 11 }}>({eurFmt.format(ba.amount)})</span> : null}
                      </span>
                    )
                  })
                ) : (
                  <span>-</span>
                )}
                </div>
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '140px minmax(0, 1fr)', gap: 8, alignItems: 'start' }}>
              <span style={{ color: 'var(--text-dim)', fontWeight: 500 }}>Zweckbindung:</span>
              {editingMeta ? (
                <div style={{ display: 'grid', gap: 8 }}>
                  {metaEarmarks.map((item, idx) => (
                    <div key={idx} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 120px auto', gap: 8, alignItems: 'center', minWidth: 0 }}>
                      <select
                        className="input"
                        style={!item.earmarkId ? { borderColor: 'var(--danger)' } : undefined}
                        value={item.earmarkId || ''}
                        onChange={(e) => {
                          const next = [...metaEarmarks]
                          next[idx] = { ...next[idx], earmarkId: Number(e.target.value) }
                          setMetaEarmarks(next)
                        }}
                      >
                        <option value="">Zweckbindung wählen</option>
                        {availableEarmarks.map((em) => <option key={em.id} value={em.id}>{em.code} - {em.name}</option>)}
                      </select>
                      <input
                        className="input"
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.amount || ''}
                        style={!isMetaAmountValid(Number(item.amount), voucher.type === 'INTERNAL') || earmarkExceedsGross ? { borderColor: 'var(--danger)' } : undefined}
                        onChange={(e) => {
                          const next = [...metaEarmarks]
                          next[idx] = { ...next[idx], amount: Number(e.target.value || 0) }
                          setMetaEarmarks(next)
                        }}
                        title="Zuordnungsbetrag"
                      />
                      <button className="btn ghost" type="button" onClick={() => setMetaEarmarks(metaEarmarks.filter((_, i) => i !== idx))}>Entfernen</button>
                    </div>
                  ))}
                  <button className="btn" type="button" style={{ justifySelf: 'start' }} onClick={() => setMetaEarmarks([...metaEarmarks, { earmarkId: 0, amount: Math.abs(Number(voucher.grossAmount || 0)) }])}>+ Zweckbindung</button>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {enrichedEarmarks.length > 0 ? (
                  enrichedEarmarks.map((ea, idx) => {
                    const bg = ea.color || undefined
                    return (
                      <span 
                        key={idx}
                        className="badge-earmark" 
                        style={{ 
                          background: bg, 
                          color: bg ? contrastText(bg) : undefined,
                          border: bg ? `1px solid ${bg}` : undefined,
                          padding: '2px 8px',
                          borderRadius: 4,
                          display: 'inline-block'
                        }}
                        title={ea.amount ? `${eurFmt.format(ea.amount)}` : undefined}
                      >
                        {ea.code}
                        {ea.amount ? <span style={{ marginLeft: 4, opacity: 0.8, fontSize: 11 }}>({eurFmt.format(ea.amount)})</span> : null}
                      </span>
                    )
                  })
                ) : (
                  <span>-</span>
                )}
                </div>
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '140px minmax(0, 1fr)', gap: 8, alignItems: 'start' }}>
              <span style={{ color: 'var(--text-dim)', fontWeight: 500 }}>Tags:</span>
              {editingMeta ? (
                <div className="voucher-info-tags-editor">
                  <TagsEditor
                    value={metaTags}
                    onChange={setMetaTags}
                    tagDefs={tagDefs}
                  />
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {tagList.length > 0 ? (
                  tagList.map((tag, idx) => (
                    <span 
                      key={idx}
                      className="chip" 
                      style={{ 
                        background: tag.color || undefined, 
                        color: tag.color ? contrastText(tag.color) : undefined,
                        padding: '2px 8px',
                        borderRadius: 4,
                        fontSize: 12
                      }}
                    >
                      {tag.name}
                    </span>
                  ))
                ) : (
                  <span>-</span>
                )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer mit Aktionen */}
        <div
          style={{
            display: 'flex',
            gap: 8,
            marginTop: 16,
            padding: windowMode ? '16px 16px 0' : undefined,
            paddingTop: 16,
            borderTop: '1px solid var(--border)',
            flexWrap: 'wrap',
            WebkitAppRegion: 'no-drag',
            pointerEvents: 'auto'
          } as React.CSSProperties}
        >
          {!allowVoucherDeletion && !isReversalVoucher && !isReversedOriginal && onReverse ? (
            <button className="btn danger" onClick={() => { onReverse(); }} style={{ flex: 1, minWidth: 160 }}>
              ↺ Stornieren
            </button>
          ) : null}
          <button className="btn primary" onClick={copyAsText} style={{ flex: 1, minWidth: 160 }}>
            📋 Als Text kopieren
          </button>
          <button className="btn primary" onClick={copyForExcel} style={{ flex: 1, minWidth: 160 }}>
            📊 Für Excel kopieren
          </button>
        </div>

        <div className="helper" style={{ marginTop: 8, marginBottom: windowMode ? 10 : 0, fontSize: 11, textAlign: 'center' }}>
          Esc = Schließen
        </div>
      </div>
    </div>,
    document.body
  )
}
