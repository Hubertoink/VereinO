import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { IconArrowDown, IconArrowUp, IconArrowsExchange, IconCalendar, IconClipboardText, IconFilePlus, IconInfoCircle, IconMessage, IconPaperclip, IconReceipt2, IconRotateClockwise, IconTableExport, IconTag, IconX } from '@tabler/icons-react'
import SelectDropdown from '../common/SelectDropdown'
import TagsEditor from '../TagsEditor'
import ReceiptThumbnail, { type ReceiptPreviewCache } from '../ReceiptThumbnail'
import AppIcon from '../common/AppIcon'
import { IconBank, IconCash } from '../../utils/icons'
import { getContrastTextColor, resolveTagDisplayColor } from '../../utils/tagColors'
import { getInternalAssignmentValidationState, isMetaAmountValid } from './voucherMetaValidation'

// Types for multiple budget/earmark assignments
type BudgetAssignment = { id?: number; budgetId: number; amount: number; label?: string; color?: string | null }
type EarmarkAssignment = { id?: number; earmarkId: number; amount: number; code?: string; name?: string; color?: string | null }

type VoucherInfo = {
  id: number
  voucherNo: string
  date: string
  type: 'IN' | 'OUT' | 'TRANSFER' | 'INTERNAL'
  sphere: 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'
  primaryClassificationValueId?: number | null
  primaryClassificationName?: string | null
  primaryClassificationColor?: string | null
  primaryClassificationIcon?: string | null
  description?: string | null
  note?: string | null
  counterparty?: string | null
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
  earmarks?: Array<{ id: number; code: string; name: string; color?: string | null; isActive?: number | boolean }>
  budgets?: Array<{ id: number; label: string; color?: string | null; isArchived?: number }>
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
  suspended?: boolean
  embedded?: boolean
  initialEditing?: boolean
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

export default function VoucherInfoModal({ voucher, onClose, eurFmt, fmtDate, notify, earmarks = [], budgets = [], tagDefs = [], allowVoucherDeletion = false, onReverse, onOpenAttachments, onSaveMeta, windowMode = false, suspended = false, embedded = false, initialEditing = false }: VoucherInfoModalProps) {
  const [isGeneralProfile, setIsGeneralProfile] = useState(false)
  const previewCache = useRef<ReceiptPreviewCache>(new Map())
  const [previewRevision, setPreviewRevision] = useState(0)
  useEffect(() => {
    previewCache.current.clear()
    setPreviewRevision(value => value + 1)
  }, [voucher.id, voucher.fileCount, voucher.hasFiles, suspended])
  const typeLabel = voucher.type === 'IN' ? 'Einnahme' : voucher.type === 'OUT' ? 'Ausgabe' : voucher.type === 'INTERNAL' ? 'Interne Umbuchung' : 'Umbuchung'
  const sphereLabel = voucher.sphere === 'IDEELL' ? 'Ideell' : voucher.sphere === 'ZWECK' ? 'Zweckbetrieb' : voucher.sphere === 'VERMOEGEN' ? 'Vermögensverwaltung' : 'Wirt. Geschäftsbetrieb'
  const classificationLabel = isGeneralProfile ? 'Kategorie' : 'Sphäre'
  const classificationValue = isGeneralProfile
    ? `${voucher.primaryClassificationIcon ? `${voucher.primaryClassificationIcon} ` : ''}${voucher.primaryClassificationName || '—'}`
    : sphereLabel

  useEffect(() => {
    let active = true
    window.api?.classifications?.primary.list()
      .then((result) => { if (active) setIsGeneralProfile(result.profile === 'GENERAL') })
      .catch(() => { if (active) setIsGeneralProfile(false) })
    return () => { active = false }
  }, [])
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
  const tagList = (voucher.tags || []).map(tagName => ({
    name: tagName,
    color: resolveTagDisplayColor(tagName, tagDefs),
  }))
  
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
  const [editingMeta, setEditingMeta] = useState(initialEditing)
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
  const internalAssignmentValidation = getInternalAssignmentValidationState({
    budgets: metaBudgets,
    earmarks: metaEarmarks,
    isInternal: voucher.type === 'INTERNAL',
    grossAmount: grossLimit,
  })

  useEffect(() => {
    setMetaNote(voucher.note || '')
    setMetaBudgets(budgetAssignments.map((b) => ({ budgetId: b.budgetId, amount: Number(b.amount || voucher.grossAmount || 0) })))
    setMetaEarmarks(earmarkAssignments.map((e) => ({ earmarkId: e.earmarkId, amount: Number(e.amount || voucher.grossAmount || 0) })))
    setMetaTags(voucher.tags || [])
    setMetaError('')
    setEditingMeta(initialEditing)
  }, [voucher.id, initialEditing])

  const availableBudgets = useMemo(() => (budgets || []).filter((budget) => !budget?.isArchived), [budgets])
  const availableEarmarks = useMemo(() => (earmarks || []).filter((earmark) => earmark?.isActive !== 0 && earmark?.isActive !== false), [earmarks])
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
    const internalAssignmentValidation = getInternalAssignmentValidationState({
      budgets: metaBudgets,
      earmarks: metaEarmarks,
      isInternal,
      grossAmount: grossLimit,
    })
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
    if (isInternal && !internalAssignmentValidation.hasValidAssignments) {
      return internalAssignmentValidation.budgetHint || internalAssignmentValidation.earmarkHint || 'Interne Buchungen brauchen Budget- oder Zweckbindungs-Zeilen mit Quelle negativ, Ziel positiv und Summe 0.'
    }
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

  // Only the active dialog handles Escape; keep drafts while attachments are open.
  useEffect(() => {
    if (suspended || embedded) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose, suspended, embedded])

  // Kopier-Funktionen
  const copyAsText = () => {
    const text = `Datum: ${fmtDate(voucher.date)}
Belegnummer: ${voucher.voucherNo}
Beschreibung: ${voucher.description || '-'}
Geschäftspartner: ${voucher.counterparty || '-'}
Kommentar: ${voucher.note || '-'}
Brutto: ${eurFmt.format(voucher.grossAmount)}
Art: ${typeLabel}
${classificationLabel}: ${classificationValue}
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
    const headers = `Datum\tBelegnummer\tBeschreibung\tKommentar\tBrutto\tArt\t${classificationLabel}\tBudget\tZweckbindung\tZahlweg\tTags\tStatus`
    const data = `${fmtDate(voucher.date)}\t${voucher.voucherNo}\t${voucher.description || '-'}\t${voucher.note || '-'}\t${eurFmt.format(voucher.grossAmount)}\t${typeLabel}\t${classificationValue}\t${budgetDisplay}\t${earmarkDisplay}\t${paymentLabel}\t${tagsDisplay}\t${statusLabel}`
    const combined = `${headers}\n${data}`
    
    navigator.clipboard.writeText(combined).then(() => {
      notify('success', 'Für Excel kopiert', 2000)
    }).catch(() => {
      notify('error', 'Kopieren fehlgeschlagen', 2000)
    })
  }

  const content = (
    <div
      className={embedded ? 'voucher-info-embedded' : `modal-overlay voucher-info-modal-overlay${windowMode ? ' voucher-info-modal-overlay--window' : ''}`}
      role={embedded ? 'region' : 'dialog'}
      aria-modal={embedded ? undefined : true}
      aria-labelledby="voucher-info-heading"
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
      style={embedded ? undefined : {
        position: 'fixed',
        inset: 0,
        display: suspended ? 'none' : 'flex',
        alignItems: windowMode ? 'stretch' : 'center',
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
        style={embedded ? undefined : {
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
            <h2 id="voucher-info-heading" className="voucher-info-title">
              <AppIcon icon={IconReceipt2} size="action" />
              <span>Buchungsdetails</span>
            </h2>
            <p className="voucher-info-subtitle">{embedded ? 'Budget, Zweckbindung, Tags und Kommentar bearbeiten' : 'Alle Informationen zu dieser Buchung'}</p>
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
          <section className="card voucher-info-card voucher-info-summary">
            <div className="voucher-info-summary__main">
              <div className={`voucher-info-amount voucher-info-amount--${voucher.type.toLowerCase()}`}>
                <span className="voucher-info-eyebrow">Betrag</span>
                <strong><span className="voucher-info-amount__icon">{voucher.type === 'IN' ? <IconArrowUp size={22} /> : voucher.type === 'OUT' ? <IconArrowDown size={22} /> : <IconArrowsExchange size={22} />}</span>{eurFmt.format(voucher.grossAmount)}</strong>
                <span className={`badge ${voucher.type.toLowerCase()}`}>{typeLabel}</span>
              </div>
              <div className="voucher-info-purpose">
                <div className="voucher-info-purpose__heading"><span className="voucher-info-eyebrow">Verwendungszweck</span><span className="voucher-info-classification"><IconTag size={14} />{classificationValue}</span></div>
                <h3>{voucher.description || 'Keine Beschreibung'}</h3>
                {voucher.counterparty ? <p>{voucher.counterparty}</p> : null}
              </div>
            </div>
            <div className="voucher-info-facts">
              <div><IconCalendar size={21} /><span><small>Datum</small><strong>{fmtDate(voucher.date)}</strong></span></div>
              <div><IconReceipt2 size={21} /><span><small>Belegnummer</small><strong>{voucher.voucherNo}</strong></span></div>
              <div>{voucher.paymentMethod === 'BAR' ? <IconCash size={21} /> : voucher.type === 'TRANSFER' || voucher.type === 'INTERNAL' ? <IconArrowsExchange size={21} /> : <IconBank size={21} />}<span><small>Zahlweg</small><strong>{paymentLabel}</strong></span></div>
            </div>
            {statusLabel !== 'Aktiv' ? <span className={`badge ${isReversalVoucher ? 'badge-storno' : 'badge-storniert'}`}>{statusLabel}</span> : null}
          </section>
          <div className={`voucher-info-details-grid${editingMeta ? ' voucher-info-details-grid--editing' : ''}`}>
            <section className="card voucher-info-card voucher-info-information">
              <h3 className="voucher-info-section-title"><IconInfoCircle size={18} />Buchungsinformationen</h3>
              <div className="voucher-info-detail-row"><span>Art</span><div><span className={`badge ${voucher.type.toLowerCase()}`}>{typeLabel}</span></div></div>
              <div className="voucher-info-detail-row"><span>{classificationLabel}</span><span>{classificationValue}</span></div>
              <div className="voucher-info-detail-row"><span>Zahlweg</span><span>{paymentLabel}</span></div>
              <div className="voucher-info-assignments">
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
            <div className="voucher-info-detail-row">
              <span style={{ color: 'var(--text-dim)', fontWeight: 500 }}>Budget:</span>
              {editingMeta ? (
                <div style={{ display: 'grid', gap: 8 }}>
                  {metaBudgets.map((item, idx) => (
                    <div key={idx} className="voucher-info-assignment-editor" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 120px auto', gap: 8, alignItems: 'center', minWidth: 0 }}>
                      <SelectDropdown
                        ariaLabel="Budget wählen"
                        placeholder="Budget wählen"
                        invalid={!item.budgetId}
                        value={item.budgetId ? String(item.budgetId) : ''}
                        onChange={(value) => {
                          const next = [...metaBudgets]
                          next[idx] = { ...next[idx], budgetId: Number(value) }
                          setMetaBudgets(next)
                        }}
                        options={[
                          ...(item.budgetId && !availableBudgets.some(entry => entry.id === item.budgetId) ? [{ value: String(item.budgetId), label: `Aktuelles archiviertes Budget #${item.budgetId}` }] : []),
                          ...availableBudgets.map(item => ({ value: String(item.id), label: item.label || `#${item.id}`, color: item.color || undefined }))
                        ]}
                      />
                      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 8, alignItems: 'center' }}>
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
                        <span style={{ color: 'var(--text-dim)', fontWeight: 500 }}>€</span>
                      </div>
                      <button className="btn ghost voucher-info-assignment-remove" type="button" aria-label="Budgetzuordnung entfernen" title="Budgetzuordnung entfernen" onClick={() => setMetaBudgets(metaBudgets.filter((_, i) => i !== idx))}><IconX size={18} stroke={2.5} /></button>
                    </div>
                  ))}
                  <button className="btn" type="button" style={{ justifySelf: 'start' }} onClick={() => setMetaBudgets([...metaBudgets, { budgetId: 0, amount: Math.abs(Number(voucher.grossAmount || 0)) }])}>+ Budget</button>
                  {voucher.type === 'INTERNAL' && internalAssignmentValidation.budgetHint ? (
                    <div className="helper" style={{ color: 'var(--danger)' }}>{internalAssignmentValidation.budgetHint}</div>
                  ) : null}
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
                          color: bg ? getContrastTextColor(bg) : undefined,
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
            <div className="voucher-info-detail-row">
              <span style={{ color: 'var(--text-dim)', fontWeight: 500 }}>Zweckbindung:</span>
              {editingMeta ? (
                <div style={{ display: 'grid', gap: 8 }}>
                  {metaEarmarks.map((item, idx) => (
                    <div key={idx} className="voucher-info-assignment-editor" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 120px auto', gap: 8, alignItems: 'center', minWidth: 0 }}>
                      <SelectDropdown
                        ariaLabel="Zweckbindung wählen"
                        placeholder="Zweckbindung wählen"
                        invalid={!item.earmarkId}
                        value={item.earmarkId ? String(item.earmarkId) : ''}
                        onChange={(value) => {
                          const next = [...metaEarmarks]
                          next[idx] = { ...next[idx], earmarkId: Number(value) }
                          setMetaEarmarks(next)
                        }}
                        options={[
                          ...(item.earmarkId && !availableEarmarks.some(entry => entry.id === item.earmarkId) ? [{ value: String(item.earmarkId), label: `Aktuelle inaktive Zweckbindung #${item.earmarkId}` }] : []),
                          ...availableEarmarks.map(item => ({ value: String(item.id), label: `${item.code} - ${item.name}`, color: item.color || undefined }))
                        ]}
                      />
                      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 8, alignItems: 'center' }}>
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
                        <span style={{ color: 'var(--text-dim)', fontWeight: 500 }}>€</span>
                      </div>
                      <button className="btn ghost voucher-info-assignment-remove" type="button" aria-label="Zweckbindungzuordnung entfernen" title="Zweckbindungzuordnung entfernen" onClick={() => setMetaEarmarks(metaEarmarks.filter((_, i) => i !== idx))}><IconX size={18} stroke={2.5} /></button>
                    </div>
                  ))}
                  <button className="btn" type="button" style={{ justifySelf: 'start' }} onClick={() => setMetaEarmarks([...metaEarmarks, { earmarkId: 0, amount: Math.abs(Number(voucher.grossAmount || 0)) }])}>+ Zweckbindung</button>
                  {voucher.type === 'INTERNAL' && internalAssignmentValidation.earmarkHint ? (
                    <div className="helper" style={{ color: 'var(--danger)' }}>{internalAssignmentValidation.earmarkHint}</div>
                  ) : null}
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
                          color: bg ? getContrastTextColor(bg) : undefined,
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
            <div className="voucher-info-detail-row">
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
                        color: tag.color ? getContrastTextColor(tag.color) : undefined,
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
            </section>
            <section className="card voucher-info-card voucher-info-attachments">
              <h3 className="voucher-info-section-title"><IconPaperclip size={18} />Anhang</h3>
              {voucher.hasFiles || (voucher.fileCount || 0) > 0 ? (
                <button type="button" className="voucher-info-attachment-thumbnail" onClick={onOpenAttachments} disabled={!onOpenAttachments} aria-label="Belege anzeigen">
                  {!suspended && <ReceiptThumbnail voucherId={voucher.id} cache={previewCache.current} revision={previewRevision} />}
                  <span><IconPaperclip size={15} />{voucher.fileCount || 1} {(voucher.fileCount || 1) === 1 ? 'Beleg' : 'Belege'} anzeigen</span>
                </button>
              ) : (
                <div className="voucher-info-attachment-preview"><IconFilePlus size={36} stroke={1.5} /><strong>Kein Anhang</strong><p>Zu dieser Buchung wurde kein Anhang hinterlegt.</p></div>
              )}
              <button type="button" className="btn voucher-info-add-attachment" onClick={onOpenAttachments} disabled={!onOpenAttachments}><IconPaperclip size={16} />Anhang hinzufügen</button>
            </section>
          </div>
          <section className="card voucher-info-card voucher-info-comment">
            <h3 className="voucher-info-section-title"><IconMessage size={18} /><label htmlFor={editingMeta ? 'voucher-info-note' : undefined}>Kommentar</label></h3>
            {editingMeta ? <textarea id="voucher-info-note" className="input booking-note-textarea" rows={3} value={metaNote} onChange={(e) => setMetaNote(e.target.value)} placeholder="Interne Notiz, Rückfrage, Ablagehinweis ..." /> : (
              <div className="voucher-info-comment__text"><span>{voucher.note || 'Kein Kommentar'}</span>{voucher.note ? <button type="button" className="btn ghost" aria-label="Kommentar kopieren" title="Kommentar kopieren" onClick={() => { navigator.clipboard.writeText(voucher.note || '').then(() => notify('success', 'Kommentar kopiert', 2000)).catch(() => notify('error', 'Kopieren fehlgeschlagen', 2000)) }}><IconClipboardText size={18} /></button> : null}</div>
            )}
          </section>
        </div>

        {/* Footer mit Aktionen */}
        <div
          className="voucher-info-footer"
          style={{
            marginTop: 16,
            padding: windowMode ? '16px 16px 0' : undefined,
            WebkitAppRegion: 'no-drag',
            pointerEvents: 'auto'
          } as React.CSSProperties}
        >
          {!allowVoucherDeletion && !isReversalVoucher && !isReversedOriginal && onReverse ? (
            <button className="btn danger voucher-info-footer__button" onClick={() => { onReverse(); }}>
              <AppIcon icon={IconRotateClockwise} size="action" />
              <span>Stornieren</span>
            </button>
          ) : null}
          <button className="btn voucher-info-footer__button voucher-info-copy-btn" onClick={copyAsText}>
            <AppIcon icon={IconClipboardText} size="action" />
            <span>Als Text kopieren</span>
          </button>
          <button className="btn ghost voucher-info-footer__button voucher-info-excel-btn" onClick={copyForExcel}>
            <AppIcon icon={IconTableExport} size="action" />
            <span>Für Excel kopieren</span>
          </button>
          {embedded && <button className="btn" disabled={savingMeta} onClick={onClose}>Abbrechen</button>}
          {canEditMeta ? <button className="btn primary voucher-info-footer__button" disabled={editingMeta && (!canSaveMeta || budgetExceedsGross || earmarkExceedsGross)} onClick={() => { if (editingMeta) { void saveMeta() } else { setEditingMeta(true) } }}>{!embedded && (editingMeta ? <IconSave size={18} /> : <IconEdit size={18} />)}<span>{editingMeta ? savingMeta ? 'Speichert ...' : 'Speichern' : 'Bearbeiten'}</span></button> : null}
        </div>

        <div className="helper" style={{ marginTop: 8, marginBottom: windowMode ? 10 : 0, fontSize: 11, textAlign: 'center' }}>
          Esc = Schließen
        </div>
      </div>
    </div>
  )
  return embedded ? content : createPortal(content, document.body)
}
