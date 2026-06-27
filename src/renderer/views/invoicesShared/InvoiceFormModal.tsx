import React, { createRef, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import TagsEditor from '../../components/TagsEditor'
import type {
  EditInvoiceFile,
  InvoiceBudgetOption,
  InvoiceDraft,
  InvoiceEarmarkOption,
  InvoiceFormState,
  InvoiceTagDef
} from './types'

type Props = {
  form: InvoiceFormState
  formError: string
  requiredTouched: boolean
  missingRequired: string[]
  tags: InvoiceTagDef[]
  budgets: InvoiceBudgetOption[]
  earmarks: InvoiceEarmarkOption[]
  partySuggestions: string[]
  descSuggestions: string[]
  formFiles: File[]
  editInvoiceFiles: EditInvoiceFile[]
  onClose: () => void
  onDraftChange: (draft: InvoiceDraft) => void
  onSave: () => void
  onRequestDelete: () => void
  onClearMissingRequired: () => void
  onSetRequiredTouched: (value: boolean) => void
  onRemovePendingFile: (index: number) => void
  onAddCreateFiles: (files: File[]) => void
  onUploadEditFiles: (files: File[]) => Promise<void>
  onDeleteEditFile: (fileId: number) => Promise<void>
  parseAmount: (input: string) => number | null
}

export default function InvoiceFormModal({
  form,
  formError,
  requiredTouched,
  missingRequired,
  tags,
  budgets,
  earmarks,
  partySuggestions,
  descSuggestions,
  formFiles,
  editInvoiceFiles,
  onClose,
  onDraftChange,
  onSave,
  onRequestDelete,
  onClearMissingRequired,
  onSetRequiredTouched,
  onRemovePendingFile,
  onAddCreateFiles,
  onUploadEditFiles,
  onDeleteEditFile,
  parseAmount
}: Props) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const editInvoiceFileInputRef = useRef<HTMLInputElement | null>(null)
  const invoiceDateInputRef = createRef<HTMLInputElement>()
  const invoicePartyInputRef = createRef<HTMLInputElement>()
  const invoiceNoInputRef = createRef<HTMLInputElement>()
  const invoiceAmountInputRef = createRef<HTMLInputElement>()
  const invoiceDescriptionInputRef = createRef<HTMLInputElement>()
  const invoiceTagsInputRef = createRef<HTMLInputElement>()

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose()
        e.preventDefault()
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        onSave()
        e.preventDefault()
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'u') {
        ;(form.mode === 'create' ? fileInputRef : editInvoiceFileInputRef).current?.click?.()
        e.preventDefault()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [form.mode, onClose, onSave])

  const setDraft = (patch: Partial<InvoiceDraft>) => onDraftChange({ ...form.draft, ...patch })

  async function handleCreateFiles(fileList: FileList | null) {
    const files = Array.from(fileList || [])
    if (files.length) onAddCreateFiles(files)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleEditFiles(fileList: FileList | null) {
    const files = Array.from(fileList || [])
    try {
      if (files.length) await onUploadEditFiles(files)
    } finally {
      if (editInvoiceFileInputRef.current) editInvoiceFileInputRef.current.value = ''
    }
  }

  async function handleDrop(fileList: FileList | null) {
    const files = Array.from(fileList || [])
    if (!files.length) return
    if (form.mode === 'create') {
      onAddCreateFiles(files)
      return
    }
    await onUploadEditFiles(files)
  }

  return (
    <>
      {createPortal(
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal invoice-modal invoices-modal-redesign" onClick={(e) => e.stopPropagation()}>
            <div className="invoices-modal-header">
              <h2 style={{ margin: 0 }}>
                {form.mode === 'create'
                  ? `+ ${form.draft.voucherType === 'IN' ? 'Forderung' : 'Verbindlichkeit'}`
                  : `${form.draft.voucherType === 'IN' ? 'Forderung' : 'Verbindlichkeit'} bearbeiten`}
              </h2>
              <button className="btn ghost" onClick={onClose} aria-label="Schließen">×</button>
            </div>

            {formError && <div className="invoices-text-danger" style={{ padding: '0 16px' }}>{formError}</div>}

            <div className="invoices-modal-body">
              <div className="invoices-modal-left">
                <div className="card" style={{ padding: 10 }}>
                  <div className="helper" style={{ marginBottom: 6 }}>Basis</div>
                  <div className="row">
                    <div className="field">
                      <label>Datum <span className="req-asterisk">*</span></label>
                      <input
                        ref={invoiceDateInputRef}
                        className="input"
                        type="date"
                        value={form.draft.date}
                        onChange={(e) => setDraft({ date: e.target.value })}
                        style={requiredTouched && !form.draft.date ? { borderColor: 'var(--danger)' } : undefined}
                      />
                    </div>
                    <div className="field">
                      <label>Art</label>
                      <div className="btn-group" role="group">
                        <button type="button" className={`btn ${form.draft.voucherType === 'IN' ? 'btn-toggle-active btn-type-in' : ''}`} onClick={() => setDraft({ voucherType: 'IN' })}>IN</button>
                        <button type="button" className={`btn ${form.draft.voucherType === 'OUT' ? 'btn-toggle-active btn-type-out' : ''}`} onClick={() => setDraft({ voucherType: 'OUT' })}>OUT</button>
                      </div>
                    </div>
                  </div>
                  <div className="row">
                    <div className="field">
                      <label>Sphäre</label>
                      <select className="input" value={form.draft.sphere} onChange={(e) => setDraft({ sphere: e.target.value as InvoiceDraft['sphere'] })}>
                        <option value="IDEELL">IDEELL</option>
                        <option value="ZWECK">ZWECK</option>
                        <option value="VERMOEGEN">VERMOEGEN</option>
                        <option value="WGB">WGB</option>
                      </select>
                    </div>
                    <div className="field">
                      <label>Zahlweg</label>
                      <div className="btn-group" role="group">
                        <button type="button" className={`btn ${form.draft.paymentMethod === 'BAR' ? 'btn-toggle-active' : ''}`} onClick={() => setDraft({ paymentMethod: 'BAR' })}>Bar</button>
                        <button type="button" className={`btn ${form.draft.paymentMethod === 'BANK' ? 'btn-toggle-active' : ''}`} onClick={() => setDraft({ paymentMethod: 'BANK' })}>Bank</button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="card" style={{ padding: 10 }}>
                  <div className="helper" style={{ marginBottom: 6 }}>Beschreibung & Tags</div>
                  <div className="field">
                    <label>Beschreibung</label>
                    <input
                      ref={invoiceDescriptionInputRef}
                      className="input"
                      list="desc-suggestions"
                      value={form.draft.description || ''}
                      onChange={(e) => setDraft({ description: e.target.value })}
                      placeholder="z. B. Mitgliedsbeitrag, Spende ..."
                    />
                  </div>
                  <TagsEditor
                    label="Tags"
                    value={form.draft.tags}
                    onChange={(nextTags) => setDraft({ tags: nextTags })}
                    tagDefs={tags}
                    inputRef={invoiceTagsInputRef}
                  />
                </div>
              </div>

              <div className="invoices-modal-right">
                <div className="card" style={{ padding: 10 }}>
                  <div className="helper" style={{ marginBottom: 6 }}>Finanzen</div>
                  <div className="field">
                    <label>Partei <span className="req-asterisk">*</span></label>
                    <input
                      ref={invoicePartyInputRef}
                      className="input"
                      list="party-suggestions"
                      value={form.draft.party}
                      onChange={(e) => setDraft({ party: e.target.value })}
                      placeholder="Name der Partei"
                      style={requiredTouched && !form.draft.party?.trim() ? { borderColor: 'var(--danger)' } : undefined}
                    />
                  </div>
                  <div className="row">
                    <div className="field">
                      <label>{form.draft.voucherType === 'IN' ? 'Forderungs-Nr.' : 'Verbindl.-Nr.'} <span className="req-asterisk">*</span></label>
                      <input
                        ref={invoiceNoInputRef}
                        className="input"
                        value={form.draft.invoiceNo || ''}
                        onChange={(e) => setDraft({ invoiceNo: e.target.value })}
                        placeholder="z. B. 2025-001"
                        style={requiredTouched && !(form.draft.invoiceNo || '').trim() ? { borderColor: 'var(--danger)' } : undefined}
                      />
                    </div>
                    <div className="field">
                      <label>Fälligkeit</label>
                      <input className="input" type="date" value={form.draft.dueDate || ''} onChange={(e) => setDraft({ dueDate: e.target.value || null })} />
                    </div>
                  </div>
                  <div className="row">
                    <div className="field">
                      <label>Betrag <span className="req-asterisk">*</span></label>
                      <span className="adorn-wrap">
                        <input
                          ref={invoiceAmountInputRef}
                          className="input"
                          inputMode="decimal"
                          placeholder="z. B. 199,90"
                          value={form.draft.grossAmount}
                          onChange={(e) => setDraft({ grossAmount: e.target.value })}
                          style={requiredTouched && (parseAmount(form.draft.grossAmount) == null || parseAmount(form.draft.grossAmount)! <= 0) ? { borderColor: 'var(--danger)' } : undefined}
                        />
                        <span className="adorn-suffix">€</span>
                      </span>
                    </div>
                  </div>
                  <div className="row">
                    <div className="field">
                      <label>Budget</label>
                      <select className="input" value={form.draft.budgetId ?? ''} onChange={(e) => setDraft({ budgetId: e.target.value ? Number(e.target.value) : '' })}>
                        <option value="">-</option>
                        {budgets.map((budget) => <option key={budget.id} value={budget.id}>{budget.year}{budget.name ? ` - ${budget.name}` : ''}</option>)}
                      </select>
                    </div>
                    <div className="field">
                      <label>Zweckbindung</label>
                      <select className="input" value={form.draft.earmarkId ?? ''} onChange={(e) => setDraft({ earmarkId: e.target.value ? Number(e.target.value) : '' })}>
                        <option value="">-</option>
                        {earmarks.map((earmark) => <option key={earmark.id} value={earmark.id}>{earmark.code} - {earmark.name}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="invoices-auto-post-inline">
                    <label htmlFor="autoPostToggle">Auto-Buchung</label>
                    <input type="checkbox" id="autoPostToggle" className="toggle" checked={form.draft.autoPost} onChange={(e) => setDraft({ autoPost: e.target.checked })} />
                  </div>
                  <div className="helper" style={{ fontSize: 11 }}>Bei vollständiger Zahlung wird automatisch eine Buchung erstellt.</div>
                </div>

                <div className="card" style={{ padding: 10 }} onDragOver={(e) => { e.preventDefault(); e.stopPropagation() }} onDrop={(e) => { e.preventDefault(); e.stopPropagation(); void handleDrop(e.dataTransfer?.files || null) }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <strong style={{ fontSize: 13 }}>Anhänge</strong>
                    <input
                      ref={form.mode === 'create' ? fileInputRef : editInvoiceFileInputRef}
                      type="file"
                      multiple
                      hidden
                      accept=".png,.jpg,.jpeg,.pdf,.doc,.docx"
                      onChange={(e) => {
                        void (form.mode === 'create' ? handleCreateFiles(e.target.files) : handleEditFiles(e.target.files))
                      }}
                    />
                    <button type="button" className="btn" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => (form.mode === 'create' ? fileInputRef : editInvoiceFileInputRef).current?.click?.()}>+ Datei(en)</button>
                  </div>

                  {(form.mode === 'create' ? formFiles : editInvoiceFiles).length > 0 ? (
                    <ul style={{ margin: '6px 0 0', paddingLeft: 16, fontSize: 12 }}>
                      {form.mode === 'create'
                        ? formFiles.map((file, index) => (
                            <li key={`${file.name}-${index}`} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</span>
                              <button type="button" className="btn ghost" style={{ padding: '2px 6px', fontSize: 12 }} onClick={() => onRemovePendingFile(index)}>×</button>
                            </li>
                          ))
                        : editInvoiceFiles.map((file) => (
                            <li key={file.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.fileName}</span>
                              <button type="button" className="btn ghost" style={{ padding: '2px 6px', fontSize: 12 }} onClick={() => void onDeleteEditFile(file.id)}>×</button>
                            </li>
                          ))}
                    </ul>
                  ) : (
                    <div className="invoices-dropzone-compact" onClick={() => (form.mode === 'create' ? fileInputRef : editInvoiceFileInputRef).current?.click?.()}>
                      <span style={{ fontSize: 18 }}>📎</span>
                      <span className="helper" style={{ fontSize: 11 }}>Dateien hierher ziehen oder klicken</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="invoices-modal-footer">
              <div className="helper">Ctrl+S = Speichern · Ctrl+U = Datei hinzufügen · Esc = Abbrechen</div>
              <div style={{ display: 'flex', gap: 8 }}>
                {form.mode === 'edit' && form.draft.id && <button className="btn danger" onClick={onRequestDelete}>Löschen</button>}
                <button
                  className="btn primary"
                  onClick={() => {
                    onSetRequiredTouched(true)
                    onSave()
                  }}
                >
                  Speichern
                </button>
              </div>
            </div>

            <datalist id="party-suggestions">{partySuggestions.map((party, index) => <option key={index} value={party} />)}</datalist>
            <datalist id="desc-suggestions">{descSuggestions.map((desc, index) => <option key={index} value={desc} />)}</datalist>
          </div>
        </div>,
        document.body
      )}

      {missingRequired.length > 0 && createPortal(
        <div className="modal-overlay" role="dialog" aria-modal="true" onClick={onClearMissingRequired}>
          <div className="modal invoices-missing-modal" onClick={(e) => e.stopPropagation()}>
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>Pflichtfelder fehlen</h3>
              <button className="btn" onClick={onClearMissingRequired} aria-label="Schließen">×</button>
            </header>
            <div className="card" style={{ padding: 10 }}>
              <div>Bitte ergänze die folgenden Felder:</div>
              <ul className="helper invoices-missing-list">
                {missingRequired.map((field) => <li key={field}>{field}</li>)}
              </ul>
            </div>
            <div className="invoices-missing-actions">
              <button className="btn primary" onClick={onClearMissingRequired}>OK</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
