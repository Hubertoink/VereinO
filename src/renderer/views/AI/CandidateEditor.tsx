import { useEffect, useRef, useState } from 'react'
import TagsEditor from '../../components/TagsEditor'
import DatePickerButton from '../../components/common/DatePickerButton'
import type {
  TAiBookingCandidate,
  TAiJobsGetOutput,
  TTagsListOutput
} from '../../../../electron/main/ipc/schemas'
import { PdfReviewPreview } from './PdfReviewPreview'
import {
  candidateSourceLabel,
  candidateSourceStateLabel,
  isCandidateApproved,
  paymentMethodForAccount,
  type PaymentAccountOption
} from './aiBooking'
import { warningClassName } from './aiText'

type TagRow = TTagsListOutput['rows'][number]
const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })

type Props = {
  job: TAiJobsGetOutput
  candidate: TAiBookingCandidate
  candidateIndex: number
  onChange: (candidate: TAiBookingCandidate) => void
  onApprove: () => void
  onOpenDraft: () => void
  paymentAccounts: PaymentAccountOption[]
  busy: boolean
}

/** Vollständiger Editor eines Beleganalyse-Kandidaten inklusive Quellvorschau. */
export function CandidateEditor({
  job,
  candidate,
  candidateIndex,
  onChange,
  onApprove,
  onOpenDraft,
  paymentAccounts,
  busy
}: Props) {
  const dateInputRef = useRef<HTMLInputElement | null>(null)
  const [classificationState, setClassificationState] = useState<{
    profile: 'NONPROFIT' | 'GENERAL'
    values: Array<{ id: number; name: string; color: string | null; icon: string | null }>
  } | null>(null)
  const [tagDefinitions, setTagDefinitions] = useState<TagRow[]>([])
  const [assignmentLabels, setAssignmentLabels] = useState<{
    budgets: Array<{ id: number; label: string; color?: string | null }>
    earmarks: Array<{ id: number; label: string; color?: string | null }>
  }>({ budgets: [], earmarks: [] })

  useEffect(() => {
    let active = true
    window.api.classifications.primary.list().then((result) => {
      if (active) setClassificationState({ profile: result.profile, values: result.values })
    }).catch(() => undefined)
    return () => { active = false }
  }, [])

  useEffect(() => {
    let active = true
    Promise.all([
      window.api.tags.list({ includeUsage: true }),
      window.api.budgets.list({ includeArchived: true }),
      window.api.bindings.list({ activeOnly: false })
    ]).then(([tags, budgets, bindings]) => {
      if (!active) return
      setTagDefinitions(tags.rows || [])
      setAssignmentLabels({
        budgets: (budgets.rows || []).map((budget: any) => ({
          id: budget.id,
          label: budget.categoryName || budget.projectName || budget.name || budget.label || `Budget #${budget.id}`,
          color: budget.color || null
        })),
        earmarks: (bindings.rows || []).map((binding: any) => ({
          id: binding.id,
          label: binding.code ? `${binding.code} · ${binding.name}` : binding.name || `Zweckbindung #${binding.id}`,
          color: binding.color || null
        }))
      })
    }).catch(() => undefined)
    return () => { active = false }
  }, [])

  const sourceFile = candidate.source?.fileName
    ? job.files.find((file) => file.fileName === candidate.source?.fileName) || job.files?.[0]
    : job.files?.[0]
  const previewSrc = sourceFile?.dataBase64
    ? `data:${sourceFile.mimeType || 'application/octet-stream'};base64,${sourceFile.dataBase64}`
    : ''
  const isImage = String(sourceFile?.mimeType || '').startsWith('image/')
  const isPdf =
    String(sourceFile?.mimeType || '').toLowerCase() === 'application/pdf' ||
    sourceFile?.fileName.toLowerCase().endsWith('.pdf')
  const activePaymentAccounts = paymentAccounts.filter((account) => account.isActive !== 0)
  const accountById = new Map(activePaymentAccounts.map((account) => [account.id, account]))
  const isApproved = isCandidateApproved(candidate, job)
  const sourceLabel = candidateSourceLabel(candidate)

  const update = <K extends keyof TAiBookingCandidate>(key: K, value: TAiBookingCandidate[K]) => {
    onChange({ ...candidate, [key]: value })
  }

  const updatePaymentAccount = (value: string) => {
    const nextId = value ? Number(value) : null
    const account = nextId ? accountById.get(nextId) : undefined
    onChange({
      ...candidate,
      paymentAccountId: nextId || null,
      paymentMethod: account ? paymentMethodForAccount(account.kind) || null : null
    })
  }

  return (
    <div className={`ai-review-grid ${isPdf ? 'ai-review-grid--pdf' : ''}`}>
      <section className={`ai-preview-panel ${isPdf ? 'ai-preview-panel--pdf' : ''}`}>
        <div className="ai-section-head">
          <strong>{isPdf ? 'PDF-Beleg' : 'Quelle'}</strong>
          <span>{sourceLabel ? 'Aktive Quelle' : `${job.files.length} Datei(en)`}</span>
        </div>
        {sourceLabel ? <p className="helper ai-source-callout">Dieser Vorschlag stammt aus <strong>{sourceLabel}</strong>.</p> : null}
        {isPdf && sourceFile?.dataBase64 ? (
          <PdfReviewPreview fileName={sourceFile.fileName} dataBase64={sourceFile.dataBase64} initialPage={candidate.source?.pageNumber || 1} />
        ) : isImage && previewSrc ? (
          <img className="ai-file-preview" src={previewSrc} alt={sourceFile?.fileName || 'Beleg'} />
        ) : (
          <div className="ai-file-list">
            {job.files.map((file) => <div key={file.id} className={`ai-file-row ${file.fileName === candidate.source?.fileName ? 'is-source' : ''}`}>
              <strong>{file.fileName}{file.fileName === candidate.source?.fileName ? <span className="ai-file-source-badge">Aktive Quelle</span> : null}</strong>
              <span>{file.mimeType || 'Datei'} · {Math.round(file.size / 1024)} KB</span>
            </div>)}
          </div>
        )}
      </section>

      <section className="ai-candidate-panel ai-booking-review-form">
        <div className="ai-section-head">
          <div><strong>Buchungsentwurf</strong><span>Vorschlag {candidateIndex + 1}</span></div>
          <span>{candidateSourceStateLabel(candidate, job)}</span>
        </div>
        <div className="ai-review-kind">
          <span>Buchungsart</span>
          <div className="booking-kind-switch" role="group" aria-label="Buchungsart wählen">
            {([['IN', 'Einnahme'], ['OUT', 'Ausgabe']] as const).map(([type, label]) => (
              <button key={type} type="button" className={`btn booking-kind-switch__button ${candidate.type === type ? 'btn-toggle-active' : ''} ${type === 'IN' ? 'btn-type-in' : 'btn-type-out'}`} disabled={isApproved} aria-pressed={candidate.type === type} onClick={() => update('type', type)}>{label}</button>
            ))}
          </div>
        </div>
        <div className="ai-form-grid">
          <label className="field">
            <span>Datum</span>
            <span className="booking-date-input-wrap">
              <input ref={dateInputRef} className="input" type="date" disabled={isApproved} value={candidate.date || ''} onChange={(event) => update('date', event.target.value)} />
              {!isApproved && <DatePickerButton inputRef={dateInputRef} ariaLabel="Kalender zur Datumsauswahl öffnen" />}
            </span>
          </label>
          <label className="field">
            <span>{classificationState?.profile === 'GENERAL' ? 'Kategorie' : 'Sphäre'}</span>
            {classificationState?.profile === 'GENERAL' ? <select className="input" disabled={isApproved} value={String(candidate.primaryClassificationValueId ?? '')} onChange={(event) => update('primaryClassificationValueId', (event.target.value ? Number(event.target.value) : null) as TAiBookingCandidate['primaryClassificationValueId'])}>
              <option value="">Kategorie wählen</option>
              {classificationState.values.map((category) => <option key={category.id} value={category.id}>{category.icon ? `${category.icon} ` : ''}{category.name}</option>)}
            </select> : <select className="input" disabled={isApproved} value={candidate.sphere} onChange={(event) => update('sphere', event.target.value as TAiBookingCandidate['sphere'])}>
              <option value="IDEELL">IDEELL</option><option value="ZWECK">ZWECK</option><option value="VERMOEGEN">VERMÖGEN</option><option value="WGB">WGB</option>
            </select>}
          </label>
          <label className="field"><span>Betrag</span><input className="input" type="number" step="0.01" min="0" disabled={isApproved} value={candidate.grossAmount || 0} onChange={(event) => update('grossAmount', Number(event.target.value || 0))} /></label>
          <label className="field"><span>MwSt %</span><input className="input" type="number" step="0.01" min="0" disabled={isApproved} value={candidate.vatRate || 0} onChange={(event) => update('vatRate', Number(event.target.value || 0))} /></label>
          <label className="field ai-field-wide">
            <span>Zahlungskonto</span>
            <select className="input" disabled={isApproved} value={candidate.paymentAccountId ? String(candidate.paymentAccountId) : ''} style={{ color: accountById.get(Number(candidate.paymentAccountId || 0))?.color || undefined }} onChange={(event) => updatePaymentAccount(event.target.value)}>
              <option value="">Kein Konto ausgewählt</option>
              {activePaymentAccounts.map((account) => <option key={account.id} value={account.id}>{account.name} · {account.kind}</option>)}
            </select>
          </label>
          <label className="field ai-field-wide"><span>Beschreibung</span><input className="input" disabled={isApproved} value={candidate.description || ''} onChange={(event) => update('description', event.target.value)} /></label>
          <TagsEditor className="booking-tags-editor ai-review-tags-editor" label="Tags" value={candidate.tags || []} tagDefs={tagDefinitions} disabled={isApproved} onChange={(tags) => update('tags', tags)} />
        </div>

        {(candidate.budgets?.length || candidate.earmarks?.length) ? <div className="ai-review-assignments" aria-label="Zuordnungen">
          {candidate.budgets?.map((assignment) => {
            const budget = assignmentLabels.budgets.find((item) => item.id === assignment.id)
            return <span key={`budget-${assignment.id}`} className="ai-review-assignment ai-review-assignment--budget" style={budget?.color ? { borderColor: budget.color, color: budget.color } : undefined}><small>Budget</small>{budget?.label || `#${assignment.id}`}{assignment.amount ? ` · ${euro.format(assignment.amount)}` : ''}</span>
          })}
          {candidate.earmarks?.map((assignment) => {
            const earmark = assignmentLabels.earmarks.find((item) => item.id === assignment.id)
            return <span key={`earmark-${assignment.id}`} className="ai-review-assignment ai-review-assignment--earmark" style={earmark?.color ? { borderColor: earmark.color, color: earmark.color } : undefined}><small>Zweck</small>{earmark?.label || `#${assignment.id}`}{assignment.amount ? ` · ${euro.format(assignment.amount)}` : ''}</span>
          })}
        </div> : null}

        {candidate.warnings?.length || candidate.evidence?.length ? <div className="ai-review-notes">
          {candidate.warnings?.map((warning, index) => <p key={`w-${index}`} className={warningClassName(warning)}>{warning}</p>)}
          {candidate.evidence?.map((item, index) => <p key={`e-${index}`} className="ai-review-note-evidence">{item}</p>)}
        </div> : null}

        <footer className="ai-review-actions">
          <span className="ai-amount-preview">{candidate.type === 'OUT' ? '-' : '+'}{euro.format(Number(candidate.grossAmount || 0))}</span>
          <button className="btn" disabled={busy || isApproved} onClick={onOpenDraft}>{isApproved ? 'Bereits gebucht' : 'Buchungsentwurf'}</button>
          <button className="btn primary" disabled={busy || isApproved} onClick={onApprove}>{isApproved ? `Gebucht${candidate.review?.voucherNo ? ` · ${candidate.review.voucherNo}` : ''}` : busy ? 'Buche...' : 'Jetzt buchen'}</button>
        </footer>
      </section>
    </div>
  )
}
