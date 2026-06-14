import React, { useEffect, useMemo, useState } from 'react'

type ActivityReportDraft = {
  fiscalYear: number
  activities: string
  purposeImpact: string
  targetGroups: string
  volunteerWork: string
  highlights: string
  notes: string
  updatedAt?: string | null
  missingFields?: string[]
}

type BudgetInfo = {
  id: number
  year: number
  sphere: 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'
  earmarkId: number | null
  amountPlanned: number
  name?: string | null
  categoryName?: string | null
  projectName?: string | null
  startDate?: string | null
  endDate?: string | null
  color?: string | null
  isArchived?: number | null
}

type BindingInfo = {
  id: number
  code: string
  name: string
  description?: string | null
  startDate?: string | null
  endDate?: string | null
  isActive: number
  color?: string | null
  budget?: number | null
}

const REPORT_FIELDS: Array<{ key: keyof Pick<ActivityReportDraft, 'activities' | 'purposeImpact' | 'targetGroups' | 'volunteerWork' | 'highlights' | 'notes'>; label: string; placeholder: string; required?: boolean }> = [
  { key: 'activities', label: 'Aktivitäten/Projekte', placeholder: 'Welche Aktivitäten, Angebote oder Projekte wurden im Geschäftsjahr durchgeführt?', required: true },
  { key: 'purposeImpact', label: 'Förderung der gemeinnützigen Zwecke', placeholder: 'Wie haben diese Aktivitäten eure Satzungszwecke bzw. gemeinnützigen Zwecke gefördert?', required: true },
  { key: 'targetGroups', label: 'Erreichte Zielgruppen', placeholder: 'Welche Personen, Gruppen oder Öffentlichkeit wurden erreicht?', required: true },
  { key: 'volunteerWork', label: 'Ehrenamtliche Arbeit', placeholder: 'Umfang der ehrenamtlichen Arbeit, z. B. Personen, Stunden, Aufgabenbereiche.', required: true },
  { key: 'highlights', label: 'Besondere Ereignisse, Kooperationen, Förderungen', placeholder: 'Besondere Ereignisse, Partnerschaften, Zuschüsse oder Förderungen.', required: true },
  { key: 'notes', label: 'Ergänzende Angaben', placeholder: 'Optionale Ergänzungen für das Finanzamt.' }
]

function emptyReport(fiscalYear: number): ActivityReportDraft {
  return { fiscalYear, activities: '', purposeImpact: '', targetGroups: '', volunteerWork: '', highlights: '', notes: '', missingFields: [] }
}

function budgetLabel(budget: BudgetInfo) {
  if (budget.name?.trim()) return budget.name.trim()
  if (budget.categoryName?.trim()) return budget.categoryName.trim()
  if (budget.projectName?.trim()) return budget.projectName.trim()
  return `Budget #${budget.id}`
}

function formatDate(value?: string | null) {
  if (!value) return ''
  const parts = value.split('-')
  if (parts.length !== 3) return value
  return `${parts[2]}.${parts[1]}.${parts[0]}`
}

function euro(value?: number | null) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(Number(value || 0))
}

export default function ActivityReportEditorModal({ open, onClose, fiscalYear, setFiscalYear, yearsAvail, budgets, notify }: {
  open: boolean
  onClose: () => void
  fiscalYear: number
  setFiscalYear: (year: number) => void
  yearsAvail: number[]
  budgets: BudgetInfo[]
  notify?: (type: 'success' | 'error' | 'info', text: string, ms?: number) => void
}) {
  const [report, setReport] = useState<ActivityReportDraft>(() => emptyReport(fiscalYear))
  const [bindings, setBindings] = useState<BindingInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')

  const years = useMemo(() => {
    const currentYear = new Date().getFullYear()
    const set = new Set([currentYear, fiscalYear, ...yearsAvail])
    return Array.from(set).sort((a, b) => b - a)
  }, [fiscalYear, yearsAvail])

  const yearBudgets = useMemo(() => {
    return (budgets || [])
      .filter((budget) => budget.year === fiscalYear && !budget.isArchived)
      .sort((a, b) => budgetLabel(a).localeCompare(budgetLabel(b), 'de'))
  }, [budgets, fiscalYear])

  const activeBindings = useMemo(() => {
    return (bindings || [])
      .filter((binding) => binding.isActive)
      .sort((a, b) => a.code.localeCompare(b.code, 'de'))
  }, [bindings])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    async function load() {
      setLoading(true)
      setError('')
      setStatus('')
      try {
        const [reportRes, bindingsRes] = await Promise.all([
          window.api?.activityReports?.get?.({ fiscalYear }),
          window.api?.bindings?.list?.({})
        ])
        if (!cancelled) {
          setReport(reportRes || emptyReport(fiscalYear))
          setBindings((bindingsRes?.rows || []) as BindingInfo[])
        }
      } catch (e: any) {
        if (!cancelled) {
          setReport(emptyReport(fiscalYear))
          setError('Tätigkeitsbericht konnte nicht geladen werden: ' + (e?.message || String(e)))
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [open, fiscalYear])

  function updateField(key: keyof Pick<ActivityReportDraft, 'activities' | 'purposeImpact' | 'targetGroups' | 'volunteerWork' | 'highlights' | 'notes'>, value: string) {
    setReport((prev) => ({ ...prev, [key]: value, missingFields: [] }))
    setError('')
    setStatus('')
  }

  async function save() {
    setSaving(true)
    setError('')
    try {
      const payload = { ...report, fiscalYear }
      const saved = await window.api?.activityReports?.save?.(payload)
      setReport(saved || payload)
      setStatus('Gespeichert')
      notify?.('success', `Tätigkeitsbericht ${fiscalYear} gespeichert`, 3000)
    } catch (e: any) {
      setError('Tätigkeitsbericht konnte nicht gespeichert werden: ' + (e?.message || String(e)))
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal" onClick={(event) => event.stopPropagation()} style={{ maxWidth: 1040, width: '96vw', maxHeight: '92vh', overflow: 'auto' }}>
        <header className="flex justify-between items-center mb-16">
          <div>
            <h2 style={{ margin: 0 }}>Tätigkeitsbericht</h2>
            <p className="helper" style={{ marginTop: 4 }}>Jahresbericht für die Finanzamtprüfung vorbereiten und speichern.</p>
          </div>
          <button className="btn ghost" onClick={onClose} aria-label="Schließen" type="button">×</button>
        </header>

        <div className="grid gap-12" style={{ gridTemplateColumns: 'minmax(0, 2fr) minmax(280px, 1fr)' }}>
          <section className="grid gap-12">
            <div className="field">
              <label>Geschäftsjahr</label>
              <select className="input" value={fiscalYear} onChange={(event) => setFiscalYear(Number(event.target.value))}>
                {years.map((year) => <option key={year} value={year}>{year}</option>)}
              </select>
              <div className="helper">Der Bericht wird pro Geschäftsjahr gespeichert.</div>
            </div>

            {loading ? (
              <div className="helper">Tätigkeitsbericht wird geladen …</div>
            ) : (
              REPORT_FIELDS.map((field) => {
                const missing = (report.missingFields || []).includes(field.label)
                return (
                  <label key={field.key} className="field">
                    <span>{field.label}{field.required ? ' *' : ''}</span>
                    <textarea
                      className="input"
                      value={String(report[field.key] || '')}
                      onChange={(event) => updateField(field.key, event.target.value)}
                      placeholder={field.placeholder}
                      style={{ minHeight: field.key === 'notes' ? 74 : 102, resize: 'vertical', borderColor: missing ? 'var(--danger)' : undefined }}
                    />
                  </label>
                )
              })
            )}

            {(report.missingFields || []).length > 0 && (
              <div className="helper" style={{ color: 'var(--danger)' }}>Noch offen: {(report.missingFields || []).join(', ')}</div>
            )}
            {error && <div className="helper" style={{ color: 'var(--danger)' }}>{error}</div>}
            {status && <div className="helper" style={{ color: 'var(--success)' }}>{status}</div>}

            <div className="flex justify-between items-center gap-8">
              <div className="helper">Zuletzt gespeichert: {report.updatedAt ? formatDate(report.updatedAt.slice(0, 10)) : 'noch nicht gespeichert'}</div>
              <button className="btn primary" onClick={save} disabled={saving || loading} type="button">
                {saving ? 'Speichert …' : 'Speichern'}
              </button>
            </div>
          </section>

          <aside className="grid gap-12" style={{ alignContent: 'start' }}>
            <details className="card" open style={{ padding: 12 }}>
              <summary><strong>Budgets {fiscalYear}</strong></summary>
              <div className="helper" style={{ marginTop: 8 }}>Anhaltspunkte für Aktivitäten, Projekte und Förderzwecke.</div>
              <div className="grid gap-8" style={{ marginTop: 10 }}>
                {yearBudgets.length ? yearBudgets.map((budget) => (
                  <div key={budget.id} className="chip" style={{ justifyContent: 'space-between', gap: 8 }}>
                    <span>{budgetLabel(budget)} · {budget.sphere}</span>
                    <strong>{euro(budget.amountPlanned)}</strong>
                  </div>
                )) : <div className="helper">Keine Budgets für dieses Jahr gefunden.</div>}
              </div>
            </details>

            <details className="card" style={{ padding: 12 }}>
              <summary><strong>Zweckbindungen</strong></summary>
              <div className="helper" style={{ marginTop: 8 }}>Hilfreich für Zweckbezug, Förderbereiche und Projektbeschreibungen.</div>
              <div className="grid gap-8" style={{ marginTop: 10 }}>
                {activeBindings.length ? activeBindings.map((binding) => (
                  <div key={binding.id} className="card" style={{ padding: 10 }}>
                    <div className="flex justify-between gap-8">
                      <strong>{binding.code}</strong>
                      {binding.budget != null && <span className="helper">{euro(binding.budget)}</span>}
                    </div>
                    <div>{binding.name}</div>
                    {binding.description && <div className="helper" style={{ marginTop: 4 }}>{binding.description}</div>}
                    {(binding.startDate || binding.endDate) && (
                      <div className="helper" style={{ marginTop: 4 }}>{formatDate(binding.startDate)} – {formatDate(binding.endDate)}</div>
                    )}
                  </div>
                )) : <div className="helper">Keine aktiven Zweckbindungen gefunden.</div>}
              </div>
            </details>

            <details className="card" style={{ padding: 12 }}>
              <summary><strong>Finanzamt-Check</strong></summary>
              <ul className="helper" style={{ margin: '8px 0 0 18px' }}>
                <li>Aktivitäten konkret benennen.</li>
                <li>Immer erklären, wie die Zwecke gefördert wurden.</li>
                <li>Zielgruppen und Ehrenamt nicht leer lassen.</li>
                <li>Kooperationen, Förderungen und besondere Ereignisse aufführen.</li>
              </ul>
            </details>
          </aside>
        </div>
      </div>
    </div>
  )
}
