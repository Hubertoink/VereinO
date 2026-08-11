import React, { useEffect, useRef, useState } from 'react'
import TagsEditor from '../../components/TagsEditor'
import DatePickerButton from '../../components/common/DatePickerButton'
import PartySelector from '../../components/common/PartySelector'
import SelectDropdown from '../../components/common/SelectDropdown'
import BookingPopupFrame from '../../components/modals/BookingPopupFrame'
import BookingOptionalArea from '../../components/booking/BookingOptionalArea'
import BookingKindSwitch from '../../components/booking/BookingKindSwitch'
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

type PrimaryClassification = { id: number; name: string; color: string | null; icon: string | null }

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
  const [isGeneralProfile, setIsGeneralProfile] = useState(false)
  const [categories, setCategories] = useState<PrimaryClassification[]>([])
  const [visibleExtras, setVisibleExtras] = useState<Set<'budget' | 'earmark' | 'tags' | 'comment' | 'attachments'>>(() => new Set([
    ...((form.draft.budgets || []).length ? ['budget' as const] : []),
    ...((form.draft.earmarks || []).length ? ['earmark' as const] : []),
    ...(form.draft.tags.length ? ['tags' as const] : []),
    ...(form.draft.note ? ['comment' as const] : []),
    ...((form.mode === 'create' ? formFiles : editInvoiceFiles).length ? ['attachments' as const] : [])
  ]))

  useEffect(() => {
    let active = true
    window.api.classifications.primary.list().then((result) => {
      if (!active) return
      setIsGeneralProfile(result.profile === 'GENERAL')
      setCategories(result.values)
    }).catch(() => { if (active) setIsGeneralProfile(false) })
    return () => { active = false }
  }, [])

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

  function toggleExtra(key: 'budget' | 'earmark' | 'tags' | 'comment' | 'attachments') {
    const opening = !visibleExtras.has(key)
    if (opening && key === 'budget' && !(form.draft.budgets || []).length) addBudgetAssignment()
    if (opening && key === 'earmark' && !(form.draft.earmarks || []).length) addEarmarkAssignment()
    if (!opening && key === 'budget') setDraft({ budgets: [], budgetId: '' })
    if (!opening && key === 'earmark') setDraft({ earmarks: [], earmarkId: '' })
    if (!opening && key === 'tags') setDraft({ tags: [] })
    if (!opening && key === 'comment') setDraft({ note: '' })
    setVisibleExtras((current) => {
      const next = new Set(current)
      if (opening) next.add(key)
      else next.delete(key)
      return next
    })
  }

  return (
    <>
      <BookingPopupFrame
        title={form.mode === 'create'
          ? `+ ${form.draft.voucherType === 'IN' ? 'Forderung' : 'Verbindlichkeit'}`
          : `${form.draft.voucherType === 'IN' ? 'Forderung' : 'Verbindlichkeit'} bearbeiten`}
        titleId="invoice-form-modal-title"
        subtitle={form.mode === 'create' ? 'Neue Verbindlichkeit oder Forderung erfassen' : 'Bestehende Rechnung bearbeiten'}
        onClose={onClose}
        className={`invoice-modal invoices-modal-redesign invoices-modal--type-${form.draft.voucherType.toLowerCase()}`}
        variant="compact"
        kindSwitch={<BookingKindSwitch value={form.draft.voucherType} ariaLabel="Art der Rechnung" options={[{ value: 'IN', label: 'Einnahme' }, { value: 'OUT', label: 'Ausgabe' }]} onChange={(value) => setDraft({ voucherType: value as InvoiceDraft['voucherType'] })} />}
      >

            {formError && <div className="invoices-text-danger" style={{ padding: '0 16px' }}>{formError}</div>}

            <div className="invoices-modal-body">
              <div className="invoices-modal-left">
                <div className="card invoice-form-card" style={{ padding: 10 }}>
                  <div className="helper" style={{ marginBottom: 6 }}>Basis</div>
                  <div className="row">
                    <div className={`field invoice-floating-field booking-compact-control${form.draft.date ? ' invoice-floating-field--filled' : ''}`}>
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
                  </div>
                  <div className="row">
                    <div className="field invoice-floating-field booking-compact-control invoice-floating-field--filled">
                      <label htmlFor="invoice-sphere">{isGeneralProfile ? 'Kategorie' : 'Sphäre'}</label>
                      {isGeneralProfile ? <SelectDropdown id="invoice-sphere" value={String(form.draft.primaryClassificationValueId ?? '')} placeholder="Kategorie wählen" ariaLabel="Kategorie der Rechnung" onChange={(value) => {
                        const category = categories.find((entry) => entry.id === Number(value))
                        setDraft({ primaryClassificationValueId: value ? Number(value) : '', primaryClassificationName: category?.name || null, primaryClassificationColor: category?.color || null, primaryClassificationIcon: category?.icon || null })
                      }} options={categories.map((category) => ({ value: String(category.id), label: `${category.icon ? `${category.icon} ` : ''}${category.name}`, color: category.color || undefined }))} /> : <select id="invoice-sphere" className="input" value={form.draft.sphere} onChange={(e) => setDraft({ sphere: e.target.value as InvoiceDraft['sphere'] })}>
                        <option value="IDEELL">IDEELL</option>
                        <option value="ZWECK">ZWECK</option>
                        <option value="VERMOEGEN">VERMOEGEN</option>
                        <option value="WGB">WGB</option>
                      </select>}
                    </div>
                    <div className={`field invoice-floating-field booking-compact-control${form.draft.paymentAccountId ? ' invoice-floating-field--filled' : ''}`}>
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
                  <div className="helper" style={{ marginBottom: 6 }}>Beschreibung</div>
                  <div className={`field invoice-floating-field booking-compact-control${(form.draft.description || '').trim() ? ' invoice-floating-field--filled' : ''}`}>
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
                </div>
              </div>

              <div className="invoices-modal-right">
                <div className="card invoice-form-card" style={{ padding: 10 }}>
                  <div className="helper" style={{ marginBottom: 6 }}>Finanzen</div>
                  <div className="field invoice-floating-field booking-compact-control invoice-floating-field--filled invoice-finance-party">
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
                    <div className={`field invoice-floating-field booking-compact-control${(form.draft.invoiceNo || '').trim() ? ' invoice-floating-field--filled' : ''}`}>
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
                    <div className="field invoice-floating-field booking-compact-control invoice-floating-field--filled">
                      <label htmlFor="invoice-due-date">Fälligkeit</label>
                      <span className="booking-date-input-wrap">
                        <input id="invoice-due-date" ref={invoiceDueDateInputRef} className="input" type="date" value={form.draft.dueDate || ''} onChange={(e) => setDraft({ dueDate: e.target.value || null })} />
                        <DatePickerButton inputRef={invoiceDueDateInputRef} ariaLabel="Kalender zur Fälligkeitsauswahl öffnen" />
                      </span>
                    </div>
                  </div>
                  <div className="row">
                    <div className="field">
                      <span className={`adorn-wrap invoice-floating-control booking-compact-control${form.draft.grossAmount?.trim() ? ' invoice-floating-control--filled' : ''}`}>
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
                  <div className="invoices-auto-post-inline">
                    <label htmlFor="autoPostToggle">Auto-Buchung</label>
                    <input type="checkbox" id="autoPostToggle" className="toggle" checked={form.draft.autoPost} onChange={(e) => setDraft({ autoPost: e.target.checked })} />
                  </div>
                  <div className="helper" style={{ fontSize: 11 }}>Bei vollständiger Zahlung wird automatisch eine Buchung erstellt.</div>
                </div>

              </div>

            <BookingOptionalArea
              actions={[
                { key: 'budget', label: 'Budget', active: visibleExtras.has('budget'), count: (form.draft.budgets || []).length },
                { key: 'earmark', label: 'Zweckbindung', active: visibleExtras.has('earmark'), count: (form.draft.earmarks || []).length },
                { key: 'tags', label: 'Tag', active: visibleExtras.has('tags'), count: form.draft.tags.length },
                { key: 'comment', label: 'Kommentar', active: visibleExtras.has('comment') },
                { key: 'attachments', label: 'Anhang', active: visibleExtras.has('attachments'), count: (form.mode === 'create' ? formFiles : editInvoiceFiles).length }
              ]}
              onToggle={(key) => toggleExtra(key as 'budget' | 'earmark' | 'tags' | 'comment' | 'attachments')}
            >
              {visibleExtras.has('budget') && <div className="compact-booking-optional-section" aria-label="Budget-Zuordnungen">
                <div className="compact-booking-section-title"><strong>Budget</strong><button type="button" onClick={() => toggleExtra('budget')} aria-label="Budget-Feld entfernen">×</button></div>
                {(form.draft.budgets || []).map((assignment, index) => <div key={`budget-${index}`} className="compact-booking-assignment-row">
                  <select className="input" value={assignment.budgetId || ''} onChange={(event) => updateBudgetAssignment(index, { budgetId: event.target.value ? Number(event.target.value) : 0 })}>
                    <option value="">Budget wählen</option>
                    {budgets.map((budget) => <option key={budget.id} value={budget.id}>{budget.year}{budget.name ? ` – ${budget.name}` : ''}</option>)}
                  </select>
                  <span className="adorn-wrap"><input className="input" type="number" step="0.01" min="0" value={assignment.amount ?? ''} onChange={(event) => updateBudgetAssignment(index, { amount: event.target.value ? Number(event.target.value) : 0 })} aria-label={`Betrag für Budget ${index + 1}`} /><span className="adorn-suffix">€</span></span>
                  <button type="button" className="compact-booking-remove-row" onClick={() => removeBudgetAssignment(index)} aria-label={`Budget ${index + 1} entfernen`}>×</button>
                </div>)}
                <button type="button" className="compact-booking-add-row" onClick={addBudgetAssignment}>+ Budgetzeile</button>
                <small className="helper">{(form.draft.budgets || []).length ? `Summe: ${totalBudgetAmount.toFixed(2)} €` : 'Kein Budget zugeordnet.'}</small>
              </div>}

              {visibleExtras.has('earmark') && <div className="compact-booking-optional-section" aria-label="Zweckbindungs-Zuordnungen">
                <div className="compact-booking-section-title"><strong>Zweckbindung</strong><button type="button" onClick={() => toggleExtra('earmark')} aria-label="Zweckbindungs-Feld entfernen">×</button></div>
                {(form.draft.earmarks || []).map((assignment, index) => <div key={`earmark-${index}`} className="compact-booking-assignment-row">
                  <select className="input" value={assignment.earmarkId || ''} onChange={(event) => updateEarmarkAssignment(index, { earmarkId: event.target.value ? Number(event.target.value) : 0 })}>
                    <option value="">Zweckbindung wählen</option>
                    {earmarks.map((earmark) => <option key={earmark.id} value={earmark.id}>{earmark.code} – {earmark.name}</option>)}
                  </select>
                  <span className="adorn-wrap"><input className="input" type="number" step="0.01" min="0" value={assignment.amount ?? ''} onChange={(event) => updateEarmarkAssignment(index, { amount: event.target.value ? Number(event.target.value) : 0 })} aria-label={`Betrag für Zweckbindung ${index + 1}`} /><span className="adorn-suffix">€</span></span>
                  <button type="button" className="compact-booking-remove-row" onClick={() => removeEarmarkAssignment(index)} aria-label={`Zweckbindung ${index + 1} entfernen`}>×</button>
                </div>)}
                <button type="button" className="compact-booking-add-row" onClick={addEarmarkAssignment}>+ Zweckbindungszeile</button>
                <small className="helper">{(form.draft.earmarks || []).length ? `Summe: ${totalEarmarkAmount.toFixed(2)} €` : 'Keine Zweckbindung zugeordnet.'}</small>
              </div>}

              {(visibleExtras.has('budget') || visibleExtras.has('earmark')) && grossAmountValue > 0 && <small className="helper">Betrag: {grossAmountValue.toFixed(2)} € · Budgets: {totalBudgetAmount.toFixed(2)} € · Zweckbindungen: {totalEarmarkAmount.toFixed(2)} €</small>}

              {visibleExtras.has('tags') && <div className="compact-booking-optional-section">
                <div className="compact-booking-section-title"><strong>Tags</strong><button type="button" onClick={() => toggleExtra('tags')} aria-label="Tags entfernen">×</button></div>
                <TagsEditor value={form.draft.tags} onChange={(nextTags) => setDraft({ tags: nextTags })} tagDefs={tags} inputRef={invoiceTagsInputRef} />
              </div>}

              {visibleExtras.has('comment') && <div className="compact-booking-optional-section">
                <div className="compact-booking-section-title"><strong>Kommentar</strong><button type="button" onClick={() => toggleExtra('comment')} aria-label="Kommentar entfernen">×</button></div>
                <textarea id="invoice-note" className="input" value={form.draft.note || ''} onChange={(event) => setDraft({ note: event.target.value })} placeholder="Interne Notiz zur Verbindlichkeit" rows={3} />
              </div>}

              {visibleExtras.has('attachments') && <div className="compact-booking-optional-section" onDragOver={(event) => { event.preventDefault(); event.stopPropagation() }} onDrop={(event) => { event.preventDefault(); event.stopPropagation(); void handleDrop(event.dataTransfer?.files || null) }}>
                <div className="compact-booking-section-title"><strong>Anhänge</strong><button type="button" onClick={() => toggleExtra('attachments')} aria-label="Anhänge entfernen">×</button></div>
                <input ref={form.mode === 'create' ? fileInputRef : editInvoiceFileInputRef} type="file" multiple hidden accept=".png,.jpg,.jpeg,.pdf,.doc,.docx" onChange={(event) => { void (form.mode === 'create' ? handleCreateFiles(event.target.files) : handleEditFiles(event.target.files)) }} />
                <button type="button" className="compact-booking-add-row" onClick={() => (form.mode === 'create' ? fileInputRef : editInvoiceFileInputRef).current?.click?.()}>+ Datei auswählen</button>
                {(form.mode === 'create' ? formFiles : editInvoiceFiles).length > 0 && <div className="compact-booking-files">{form.mode === 'create'
                  ? formFiles.map((file, index) => <span key={`${file.name}-${index}`}>{file.name}<button type="button" onClick={() => onRemovePendingFile(index)} aria-label={`${file.name} entfernen`}>×</button></span>)
                  : editInvoiceFiles.map((file) => <span key={file.id}>{file.fileName}<button type="button" onClick={() => void onDeleteEditFile(file.id)} aria-label={`${file.fileName} entfernen`}>×</button></span>)}</div>}
              </div>}
            </BookingOptionalArea>
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
      </BookingPopupFrame>
    </>
  )
}
