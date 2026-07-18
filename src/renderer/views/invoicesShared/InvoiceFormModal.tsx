import React, { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import TagsEditor from '../../components/TagsEditor'
import DatePickerButton from '../../components/common/DatePickerButton'
import PartySelector from '../../components/common/PartySelector'
import type {
  InvoiceBudgetAssignment,
  EditInvoiceFile,
  InvoiceBudgetOption,
  InvoiceEarmarkAssignment,
  InvoiceDraft,
  InvoiceEarmarkOption,
  InvoicePaymentAccountOption,
  InvoiceFormState,
  InvoiceTagDef
} from './types'

type Props = {
  form: InvoiceFormState
  formError: string
  requiredTouched: boolean
  tags: InvoiceTagDef[]
  budgets: InvoiceBudgetOption[]
  earmarks: InvoiceEarmarkOption[]
  paymentAccounts: InvoicePaymentAccountOption[]
  descSuggestions: string[]
  formFiles: File[]
  editInvoiceFiles: EditInvoiceFile[]
  onClose: () => void
  onDraftChange: (draft: InvoiceDraft) => void
  onSave: () => void
  onRequestDelete: () => void
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
  tags,
  budgets,
  earmarks,
  paymentAccounts,
  descSuggestions,
  formFiles,
  editInvoiceFiles,
  onClose,
  onDraftChange,
  onSave,
  onRequestDelete,
  onSetRequiredTouched,
  onRemovePendingFile,
  onAddCreateFiles,
  onUploadEditFiles,
  onDeleteEditFile,
  parseAmount
}: Props) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const editInvoiceFileInputRef = useRef<HTMLInputElement | null>(null)
  const invoiceDateInputRef = useRef<HTMLInputElement | null>(null)
  const invoiceDueDateInputRef = useRef<HTMLInputElement | null>(null)
  const invoiceNoInputRef = useRef<HTMLInputElement | null>(null)
  const invoiceAmountInputRef = useRef<HTMLInputElement | null>(null)
  const invoiceDescriptionInputRef = useRef<HTMLInputElement | null>(null)
  const invoiceTagsInputRef = useRef<HTMLInputElement | null>(null)

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
  const activePaymentAccounts = paymentAccounts.filter((account) => account.isActive !== 0)
  const paymentAccountById = new Map(paymentAccounts.map((account) => [account.id, account]))
  const totalBudgetAmount = (form.draft.budgets || []).reduce((sum, item) => sum + Number(item.amount || 0), 0)
  const totalEarmarkAmount = (form.draft.earmarks || []).reduce((sum, item) => sum + Number(item.amount || 0), 0)
  const grossAmountValue = parseAmount(form.draft.grossAmount) || 0

  function addBudgetAssignment() {
    setDraft({
      budgets: [...(form.draft.budgets || []), { budgetId: 0, amount: grossAmountValue || 0 }],
      budgetId: ''
    })
  }

  function updateBudgetAssignment(index: number, patch: Partial<InvoiceBudgetAssignment>) {
    const next = [...(form.draft.budgets || [])]
    next[index] = { ...next[index], ...patch }
    setDraft({
      budgets: next,
      budgetId: typeof next[0]?.budgetId === 'number' && next[0].budgetId > 0 ? next[0].budgetId : ''
    })
  }

  function removeBudgetAssignment(index: number) {
    const next = (form.draft.budgets || []).filter((_, currentIndex) => currentIndex !== index)
    setDraft({
      budgets: next,
      budgetId: typeof next[0]?.budgetId === 'number' && next[0].budgetId > 0 ? next[0].budgetId : ''
    })
  }

  function addEarmarkAssignment() {
    setDraft({
      earmarks: [...(form.draft.earmarks || []), { earmarkId: 0, amount: grossAmountValue || 0 }],
      earmarkId: ''
    })
  }

  function updateEarmarkAssignment(index: number, patch: Partial<InvoiceEarmarkAssignment>) {
    const next = [...(form.draft.earmarks || [])]
    next[index] = { ...next[index], ...patch }
    setDraft({
      earmarks: next,
      earmarkId: typeof next[0]?.earmarkId === 'number' && next[0].earmarkId > 0 ? next[0].earmarkId : ''
    })
  }

  function removeEarmarkAssignment(index: number) {
    const next = (form.draft.earmarks || []).filter((_, currentIndex) => currentIndex !== index)
    setDraft({
      earmarks: next,
      earmarkId: typeof next[0]?.earmarkId === 'number' && next[0].earmarkId > 0 ? next[0].earmarkId : ''
    })
  }

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
          <div className={`modal invoice-modal invoices-modal-redesign invoices-modal--type-${form.draft.voucherType.toLowerCase()}`} onClick={(e) => e.stopPropagation()}>
            <div className="invoices-modal-header">
              <h2 style={{ margin: 0 }}>
                {form.mode === 'create'
                  ? `+ ${form.draft.voucherType === 'IN' ? 'Forderung' : 'Verbindlichkeit'}`
                  : `${form.draft.voucherType === 'IN' ? 'Forderung' : 'Verbindlichkeit'} bearbeiten`}
              </h2>
              <button className="btn ghost booking-modal-icon-btn booking-modal-close-btn invoices-modal-close-btn" onClick={onClose} title="Schließen (ESC)" aria-label="Schließen">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                </svg>
              </button>
            </div>

            {formError && <div className="invoices-text-danger" style={{ padding: '0 16px' }}>{formError}</div>}

            <div className="invoices-modal-body">
              <div className="invoices-modal-left">
                <div className="card invoice-form-card" style={{ padding: 10 }}>
                  <div className="helper" style={{ marginBottom: 6 }}>Basis</div>
                  <div className="row">
                    <div className={`field invoice-floating-field${form.draft.date ? ' invoice-floating-field--filled' : ''}`}>
                      <label htmlFor="invoice-date">Datum <span className="req-asterisk">*</span></label>
                      <span className="booking-date-input-wrap">
                        <input
                          id="invoice-date"
                          ref={invoiceDateInputRef}
                          className="input"
                          type="date"
                          value={form.draft.date}
                          onChange={(e) => setDraft({ date: e.target.value })}
                          style={requiredTouched && !form.draft.date ? { borderColor: 'var(--danger)' } : undefined}
                        />
                        <DatePickerButton inputRef={invoiceDateInputRef} ariaLabel="Kalender zur Datumsauswahl öffnen" />
                      </span>
                    </div>
                    <div className="field invoice-type-field">
                      <label>Art</label>
                      <div className="btn-group" role="group">
                        <button type="button" className={`btn ${form.draft.voucherType === 'IN' ? 'btn-toggle-active btn-type-in' : ''}`} onClick={() => setDraft({ voucherType: 'IN' })}>IN</button>
                        <button type="button" className={`btn ${form.draft.voucherType === 'OUT' ? 'btn-toggle-active btn-type-out' : ''}`} onClick={() => setDraft({ voucherType: 'OUT' })}>OUT</button>
                      </div>
                    </div>
                  </div>
                  <div className="row">
                    <div className="field invoice-floating-field invoice-floating-field--filled">
                      <label htmlFor="invoice-sphere">Sphäre</label>
                      <select id="invoice-sphere" className="input" value={form.draft.sphere} onChange={(e) => setDraft({ sphere: e.target.value as InvoiceDraft['sphere'] })}>
                        <option value="IDEELL">IDEELL</option>
                        <option value="ZWECK">ZWECK</option>
                        <option value="VERMOEGEN">VERMOEGEN</option>
                        <option value="WGB">WGB</option>
                      </select>
                    </div>
                    <div className={`field invoice-floating-field${form.draft.paymentAccountId ? ' invoice-floating-field--filled' : ''}`}>
                      <label htmlFor="invoice-account">Konto</label>
                      <select
                        id="invoice-account"
                        className="input"
                        style={{ color: paymentAccountById.get(Number(form.draft.paymentAccountId || 0))?.color || undefined }}
                        value={form.draft.paymentAccountId ?? ''}
                        onChange={(e) => {
                          const nextAccountId = e.target.value ? Number(e.target.value) : ''
                          const nextAccount = typeof nextAccountId === 'number' ? paymentAccountById.get(nextAccountId) : null
                          setDraft({
                            paymentAccountId: nextAccountId,
                            paymentMethod: nextAccount?.kind === 'CASH' ? 'BAR' : nextAccount ? 'BANK' : ''
                          })
                        }}
                      >
                        <option value="" />
                        {activePaymentAccounts.map((account) => (
                          <option key={account.id} value={account.id} style={{ color: account.color || undefined }}>
                            {account.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                <div className="card invoice-form-card" style={{ padding: 10 }}>
                  <div className="helper" style={{ marginBottom: 6 }}>Beschreibung & Tags</div>
                  <div className={`field invoice-floating-field${(form.draft.description || '').trim() ? ' invoice-floating-field--filled' : ''}`}>
                    <label htmlFor="invoice-description">Beschreibung</label>
                    <input
                      id="invoice-description"
                      ref={invoiceDescriptionInputRef}
                      className="input"
                      list="desc-suggestions"
                      value={form.draft.description || ''}
                      onChange={(e) => setDraft({ description: e.target.value })}
                      placeholder="z. B. Mitgliedsbeitrag, Spende ..."
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="invoice-note">Kommentar</label>
                    <textarea
                      id="invoice-note"
                      className="input"
                      value={form.draft.note || ''}
                      onChange={(e) => setDraft({ note: e.target.value })}
                      placeholder="Interne Notiz zur Verbindlichkeit"
                      rows={2}
                    />
                  </div>
                  <TagsEditor
                    label="Tags"
                    className="invoice-tags-editor"
                    value={form.draft.tags}
                    onChange={(nextTags) => setDraft({ tags: nextTags })}
                    tagDefs={tags}
                    inputRef={invoiceTagsInputRef}
                  />
                </div>
              </div>

              <div className="invoices-modal-right">
                <div className="card invoice-form-card" style={{ padding: 10 }}>
                  <div className="helper" style={{ marginBottom: 6 }}>Finanzen</div>
                  <div className="field invoice-floating-field invoice-floating-field--filled invoice-finance-party">
                    <label htmlFor="invoice-party">{form.draft.voucherType === 'OUT' ? 'Lieferant / Zahlungsempfänger' : 'Kunde / Zahlungspflichtiger'} <span className="req-asterisk">*</span></label>
                    <PartySelector
                      valueId={form.draft.partyId}
                      valueName={form.draft.party}
                      role={form.draft.voucherType === 'OUT' ? 'SUPPLIER' : 'CUSTOMER'}
                      inputId="invoice-party"
                      placeholder={form.draft.voucherType === 'OUT' ? 'Lieferant wählen oder eingeben' : 'Kunde wählen oder eingeben'}
                      invalid={requiredTouched && !form.draft.party?.trim()}
                      onChange={(selection) => setDraft({ party: selection.name, partyId: selection.partyId })}
                    />
                  </div>
                  <div className="row">
                    <div className={`field invoice-floating-field${(form.draft.invoiceNo || '').trim() ? ' invoice-floating-field--filled' : ''}`}>
                      <label htmlFor="invoice-number">{form.draft.voucherType === 'IN' ? 'Forderungs-Nr.' : 'Verbindl.-Nr.'} <span className="req-asterisk">*</span></label>
                      <input
                        id="invoice-number"
                        ref={invoiceNoInputRef}
                        className="input"
                        value={form.draft.invoiceNo || ''}
                        onChange={(e) => setDraft({ invoiceNo: e.target.value })}
                        placeholder="z. B. 2025-001"
                        style={requiredTouched && !(form.draft.invoiceNo || '').trim() ? { borderColor: 'var(--danger)' } : undefined}
                      />
                    </div>
                    <div className="field invoice-floating-field invoice-floating-field--filled">
                      <label htmlFor="invoice-due-date">Fälligkeit</label>
                      <span className="booking-date-input-wrap">
                        <input id="invoice-due-date" ref={invoiceDueDateInputRef} className="input" type="date" value={form.draft.dueDate || ''} onChange={(e) => setDraft({ dueDate: e.target.value || null })} />
                        <DatePickerButton inputRef={invoiceDueDateInputRef} ariaLabel="Kalender zur Fälligkeitsauswahl öffnen" />
                      </span>
                    </div>
                  </div>
                  <div className="row">
                    <div className="field">
                      <span className={`adorn-wrap invoice-floating-control${form.draft.grossAmount?.trim() ? ' invoice-floating-control--filled' : ''}`}>
                        <label htmlFor="invoice-amount">Betrag <span className="req-asterisk">*</span></label>
                        <input
                          id="invoice-amount"
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
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        Budget
                        <button type="button" className="btn ghost" style={{ padding: '2px 6px', fontSize: 12 }} onClick={addBudgetAssignment}>+</button>
                      </label>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {(form.draft.budgets || []).map((assignment, index) => (
                          <div key={`budget-${index}`} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <select
                              className="input"
                              style={{ flex: 1 }}
                              value={assignment.budgetId || ''}
                              onChange={(e) => updateBudgetAssignment(index, { budgetId: e.target.value ? Number(e.target.value) : 0 })}
                            >
                              <option value="">-</option>
                              {budgets.map((budget) => <option key={budget.id} value={budget.id}>{budget.year}{budget.name ? ` - ${budget.name}` : ''}</option>)}
                            </select>
                            <span className="adorn-wrap" style={{ width: 110 }}>
                              <input
                                className="input"
                                type="number"
                                step="0.01"
                                min="0"
                                value={assignment.amount ?? ''}
                                onChange={(e) => updateBudgetAssignment(index, { amount: e.target.value ? Number(e.target.value) : 0 })}
                              />
                              <span className="adorn-suffix">€</span>
                            </span>
                            <button type="button" className="btn ghost" style={{ padding: '2px 6px' }} onClick={() => removeBudgetAssignment(index)}>×</button>
                          </div>
                        ))}
                        <div className="helper">
                          {(form.draft.budgets || []).length > 0 ? `Summe: ${totalBudgetAmount.toFixed(2)} €` : 'Kein Budget zugeordnet. Klicke + zum Hinzufügen.'}
                        </div>
                      </div>
                    </div>
                    <div className="field">
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        Zweckbindung
                        <button type="button" className="btn ghost" style={{ padding: '2px 6px', fontSize: 12 }} onClick={addEarmarkAssignment}>+</button>
                      </label>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {(form.draft.earmarks || []).map((assignment, index) => (
                          <div key={`earmark-${index}`} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <select
                              className="input"
                              style={{ flex: 1 }}
                              value={assignment.earmarkId || ''}
                              onChange={(e) => updateEarmarkAssignment(index, { earmarkId: e.target.value ? Number(e.target.value) : 0 })}
                            >
                              <option value="">-</option>
                              {earmarks.map((earmark) => <option key={earmark.id} value={earmark.id}>{earmark.code} - {earmark.name}</option>)}
                            </select>
                            <span className="adorn-wrap" style={{ width: 110 }}>
                              <input
                                className="input"
                                type="number"
                                step="0.01"
                                min="0"
                                value={assignment.amount ?? ''}
                                onChange={(e) => updateEarmarkAssignment(index, { amount: e.target.value ? Number(e.target.value) : 0 })}
                              />
                              <span className="adorn-suffix">€</span>
                            </span>
                            <button type="button" className="btn ghost" style={{ padding: '2px 6px' }} onClick={() => removeEarmarkAssignment(index)}>×</button>
                          </div>
                        ))}
                        <div className="helper">
                          {(form.draft.earmarks || []).length > 0 ? `Summe: ${totalEarmarkAmount.toFixed(2)} €` : 'Keine Zweckbindung zugeordnet. Klicke + zum Hinzufügen.'}
                        </div>
                      </div>
                    </div>
                  </div>
                  {grossAmountValue > 0 && (
                    <div className="helper" style={{ fontSize: 11 }}>
                      Betrag: {grossAmountValue.toFixed(2)} € · Budgets: {totalBudgetAmount.toFixed(2)} € · Zweckbindungen: {totalEarmarkAmount.toFixed(2)} €
                    </div>
                  )}
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

            <datalist id="desc-suggestions">{descSuggestions.map((desc, index) => <option key={index} value={desc} />)}</datalist>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
