import React, { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { IconBank, IconCash, IconArrow } from '../../utils/icons'

// Types for multiple budget/earmark assignments
type BudgetAssignment = { id?: number; budgetId: number; amount: number; label?: string; color?: string | null }
type EarmarkAssignment = { id?: number; earmarkId: number; amount: number; code?: string; name?: string; color?: string | null }

type VoucherInfo = {
  id: number
  voucherNo: string
  date: string
  type: 'IN' | 'OUT' | 'TRANSFER'
  sphere: 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'
  description?: string | null
  paymentMethod?: 'BAR' | 'BANK' | null
  transferFrom?: 'BAR' | 'BANK' | null
  transferTo?: 'BAR' | 'BANK' | null
  grossAmount: number
  earmarkId?: number | null
  earmarkCode?: string | null
  budgetId?: number | null
  budgetLabel?: string | null
  budgetColor?: string | null
  tags?: string[]
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

export default function VoucherInfoModal({ voucher, onClose, eurFmt, fmtDate, notify, earmarks = [], budgets = [], tagDefs = [] }: VoucherInfoModalProps) {
  const typeLabel = voucher.type === 'IN' ? 'Einnahme' : voucher.type === 'OUT' ? 'Ausgabe' : 'Umbuchung'
  const sphereLabel = voucher.sphere === 'IDEELL' ? 'Ideell' : voucher.sphere === 'ZWECK' ? 'Zweckbetrieb' : voucher.sphere === 'VERMOEGEN' ? 'Vermögensverwaltung' : 'Wirt. Geschäftsbetrieb'
  
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
    paymentLabel = `${voucher.transferFrom === 'BAR' ? 'Bar' : 'Bank'} → ${voucher.transferTo === 'BAR' ? 'Bar' : 'Bank'}`
  } else {
    paymentLabel = voucher.paymentMethod === 'BAR' ? 'Bar' : voucher.paymentMethod === 'BANK' ? 'Bank' : '-'
  }
  
  const budgetDisplay = budgetAssignments.length > 0 
    ? budgetAssignments.map(b => b.label || `#${b.budgetId}`).join(', ') 
    : '-'
  const earmarkDisplay = enrichedEarmarks.length > 0 
    ? enrichedEarmarks.map(e => e.code).join(', ') 
    : '-'
  const tagsDisplay = voucher.tags && voucher.tags.length > 0 ? voucher.tags.join(', ') : '-'

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
Brutto: ${eurFmt.format(voucher.grossAmount)}
Art: ${typeLabel}
Sphäre: ${sphereLabel}
Budget: ${budgetDisplay}
Zweckbindung: ${earmarkDisplay}
Zahlweg: ${paymentLabel}
Tags: ${tagsDisplay}`
    
    navigator.clipboard.writeText(text).then(() => {
      notify('success', 'Als Text kopiert', 2000)
    }).catch(() => {
      notify('error', 'Kopieren fehlgeschlagen', 2000)
    })
  }

  const copyForExcel = () => {
    // Tab-separated format (headers + data)
    const headers = 'Datum\tBelegnummer\tBeschreibung\tBrutto\tArt\tSphäre\tBudget\tZweckbindung\tZahlweg\tTags'
    const data = `${fmtDate(voucher.date)}\t${voucher.voucherNo}\t${voucher.description || '-'}\t${eurFmt.format(voucher.grossAmount)}\t${typeLabel}\t${sphereLabel}\t${budgetDisplay}\t${earmarkDisplay}\t${paymentLabel}\t${tagsDisplay}`
    const combined = `${headers}\n${data}`
    
    navigator.clipboard.writeText(combined).then(() => {
      notify('success', 'Für Excel kopiert', 2000)
    }).catch(() => {
      notify('error', 'Kopieren fehlgeschlagen', 2000)
    })
  }

  return createPortal(
    <div
      className="modal-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        background: 'color-mix(in oklab, var(--surface) 65%, transparent)',
        padding: '24px 16px',
        zIndex: 9999,
        overflowY: 'auto'
      }}
    >
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(640px, 96vw)',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          borderRadius: 12,
          boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
          background: 'var(--surface)',
          padding: 16
        }}
      >
        {/* Header */}
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18 }}>📋 Buchungsdetails</h2>
            <div className="helper" style={{ marginTop: 4 }}>Beleg {voucher.voucherNo}</div>
          </div>
          <button className="btn ghost" onClick={onClose} aria-label="Schließen" style={{ fontSize: 20 }}>
            ✕
          </button>
        </header>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', display: 'grid', gap: 12 }}>
          <div className="card" style={{ padding: 12, display: 'grid', gap: 8 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 8, alignItems: 'center' }}>
              <span style={{ color: 'var(--text-dim)', fontWeight: 500 }}>Datum:</span>
              <span style={{ fontWeight: 600 }}>{fmtDate(voucher.date)}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 8, alignItems: 'center' }}>
              <span style={{ color: 'var(--text-dim)', fontWeight: 500 }}>Belegnummer:</span>
              <span>{voucher.voucherNo}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 8, alignItems: 'start' }}>
              <span style={{ color: 'var(--text-dim)', fontWeight: 500 }}>Beschreibung:</span>
              <span style={{ wordBreak: 'break-word' }}>{voucher.description || '-'}</span>
            </div>
          </div>

          <div className="card" style={{ padding: 12, display: 'grid', gap: 8 }}>
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
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                {voucher.type === 'TRANSFER' ? (
                  <>
                    {voucher.transferFrom === 'BAR' ? <IconCash /> : <IconBank />}
                    <IconArrow />
                    {voucher.transferTo === 'BAR' ? <IconCash /> : <IconBank />}
                  </>
                ) : voucher.paymentMethod ? (
                  <>{voucher.paymentMethod === 'BAR' ? <IconCash /> : <IconBank />}</>
                ) : (
                  <span>-</span>
                )}
              </div>
            </div>
          </div>

          <div className="card" style={{ padding: 12, display: 'grid', gap: 8 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 8, alignItems: 'start' }}>
              <span style={{ color: 'var(--text-dim)', fontWeight: 500 }}>Budget:</span>
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
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 8, alignItems: 'start' }}>
              <span style={{ color: 'var(--text-dim)', fontWeight: 500 }}>Zweckbindung:</span>
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
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 8, alignItems: 'start' }}>
              <span style={{ color: 'var(--text-dim)', fontWeight: 500 }}>Tags:</span>
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
            </div>
          </div>
        </div>

        {/* Footer mit Kopier-Buttons */}
        <div
          style={{
            display: 'flex',
            gap: 8,
            marginTop: 16,
            paddingTop: 16,
            borderTop: '1px solid var(--border)',
            flexWrap: 'wrap'
          }}
        >
          <button className="btn primary" onClick={copyAsText} style={{ flex: 1, minWidth: 160 }}>
            📋 Als Text kopieren
          </button>
          <button className="btn primary" onClick={copyForExcel} style={{ flex: 1, minWidth: 160 }}>
            📊 Für Excel kopieren
          </button>
        </div>

        <div className="helper" style={{ marginTop: 8, fontSize: 11, textAlign: 'center' }}>
          Esc = Schließen
        </div>
      </div>
    </div>,
    document.body
  )
}
