import React, { useCallback, useEffect, useState } from 'react'
import type { TAiKnowledgeRulesListOutput } from '../../../../electron/main/ipc/schemas'
import { IconTrash } from '../../utils/icons'

type RuleRow = TAiKnowledgeRulesListOutput['rows'][number]
type RuleScope = RuleRow['scope']

type Props = {
  notify: (type: 'success' | 'error' | 'info', text: string) => void
  onClose: () => void
}

const EMPTY_RULE = {
  id: undefined as number | undefined,
  name: '',
  scope: 'ALL' as RuleScope,
  instruction: '',
  enabled: true
}

function scopeLabel(scope: RuleScope) {
  if (scope === 'BOOKINGS') return 'Buchungen & Belege'
  if (scope === 'INVOICES') return 'Rechnungen'
  return 'Überall'
}

export function AiRulesCatalog({ notify, onClose }: Props) {
  const [rules, setRules] = useState<RuleRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [showEditor, setShowEditor] = useState(false)
  const [form, setForm] = useState(EMPTY_RULE)

  const loadRules = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const rulesApi = (window.api?.ai as any)?.rules
      if (!rulesApi?.list) {
        setRules([])
        setLoadError('Die laufende App kennt die neue KI-Regel-API noch nicht. Bitte die App einmal vollständig neu starten.')
        return
      }
      const result = await rulesApi.list({ enabledOnly: false, limit: 200 })
      setRules(result.rows || [])
    } catch (error: any) {
      const message = String(error?.message || '')
      setLoadError(/handler|channel|undefined/i.test(message)
        ? 'Die laufende App kennt die neue KI-Regel-API noch nicht. Bitte die App einmal vollständig neu starten.'
        : message || 'KI-Regeln konnten nicht geladen werden.')
    } finally {
      setLoading(false)
    }
  }, [notify])

  useEffect(() => {
    void loadRules()
  }, [loadRules])

  const openNewRule = () => {
    setForm(EMPTY_RULE)
    setShowEditor(true)
  }

  const openRule = (rule: RuleRow) => {
    setForm({
      id: rule.id,
      name: rule.name,
      scope: rule.scope,
      instruction: rule.instruction,
      enabled: rule.enabled !== 0
    })
    setShowEditor(true)
  }

  const saveRule = async () => {
    const name = form.name.trim()
    const instruction = form.instruction.trim()
    if (!name || !instruction) {
      notify('error', 'Bitte Name und Regeltext ausfüllen.')
      return
    }
    setSaving(true)
    try {
      const rulesApi = (window.api?.ai as any)?.rules
      if (!rulesApi?.upsert) throw new Error('Bitte die App neu starten, damit die KI-Regel-API geladen wird.')
      await rulesApi.upsert({
        id: form.id,
        name,
        scope: form.scope,
        instruction,
        enabled: form.enabled
      })
      await loadRules()
      setShowEditor(false)
      setForm(EMPTY_RULE)
      notify('success', form.id ? 'KI-Regel aktualisiert' : 'KI-Regel angelegt')
    } catch (error: any) {
      notify('error', error?.message || 'KI-Regel konnte nicht gespeichert werden.')
    } finally {
      setSaving(false)
    }
  }

  const toggleRule = async (rule: RuleRow) => {
    try {
      const rulesApi = (window.api?.ai as any)?.rules
      if (!rulesApi?.upsert) throw new Error('Bitte die App neu starten, damit die KI-Regel-API geladen wird.')
      await rulesApi.upsert({
        id: rule.id,
        name: rule.name,
        scope: rule.scope,
        instruction: rule.instruction,
        enabled: rule.enabled === 0
      })
      await loadRules()
    } catch (error: any) {
      notify('error', error?.message || 'KI-Regel konnte nicht geändert werden.')
    }
  }

  const deleteRule = async (rule: RuleRow) => {
    if (!window.confirm(`KI-Regel „${rule.name}“ wirklich löschen?`)) return
    try {
      const rulesApi = (window.api?.ai as any)?.rules
      if (!rulesApi?.delete) throw new Error('Bitte die App neu starten, damit die KI-Regel-API geladen wird.')
      const result = await rulesApi.delete({ id: rule.id })
      if (!result.ok) throw new Error('KI-Regel wurde nicht gefunden.')
      if (form.id === rule.id) {
        setShowEditor(false)
        setForm(EMPTY_RULE)
      }
      await loadRules()
      notify('success', 'KI-Regel gelöscht')
    } catch (error: any) {
      notify('error', error?.message || 'KI-Regel konnte nicht gelöscht werden.')
    }
  }

  return (
    <section className="card ai-rules-drawer" role="dialog" aria-label="KI-Regelkatalog">
      <header className="ai-rules-head">
        <div>
          <strong>✦ KI-Regelkatalog</strong>
          <span>Gilt organisationsweit für alle passenden KI-Analysen und Agentenaktionen.</span>
        </div>
        <button className="btn ghost ai-rules-close" type="button" onClick={onClose} aria-label="Schließen">
          ×
        </button>
      </header>

      <div className="ai-rules-toolbar">
        <span>{rules.filter((rule) => rule.enabled !== 0).length} aktiv · {rules.length} gesamt</span>
        <button className="btn primary" type="button" onClick={openNewRule}>
          + Neue Regel
        </button>
      </div>

      {showEditor && (
        <section className="ai-rule-editor" aria-label={form.id ? 'KI-Regel bearbeiten' : 'Neue KI-Regel'}>
          <div className="ai-section-head">
            <strong>{form.id ? 'Regel bearbeiten' : 'Neue Regel'}</strong>
            <button className="btn ghost" type="button" onClick={() => setShowEditor(false)} aria-label="Editor schließen">
              ×
            </button>
          </div>
          <div className="ai-rule-form-grid">
            <label className="field">
              <span>Name</span>
              <input
                className="input"
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                placeholder="z. B. Große Rechnungen markieren"
                autoFocus
              />
            </label>
            <label className="field">
              <span>Geltungsbereich</span>
              <select
                className="input"
                value={form.scope}
                onChange={(event) => setForm((current) => ({ ...current, scope: event.target.value as RuleScope }))}
              >
                <option value="ALL">Überall</option>
                <option value="BOOKINGS">Buchungen & Belege</option>
                <option value="INVOICES">Rechnungen</option>
              </select>
            </label>
          </div>
          <label className="field ai-rule-instruction">
            <span>Regel</span>
            <textarea
              className="input"
              rows={4}
              value={form.instruction}
              onChange={(event) => setForm((current) => ({ ...current, instruction: event.target.value }))}
              placeholder="Wenn der Bruttobetrag über 500 € liegt, füge den Tag „Freigabe“ hinzu."
            />
          </label>
          <div className="ai-rule-editor-footer">
            <label className="ai-rule-enabled">
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(event) => setForm((current) => ({ ...current, enabled: event.target.checked }))}
              />
              Direkt aktivieren
            </label>
            <div>
              <button className="btn" type="button" onClick={() => setShowEditor(false)} disabled={saving}>Abbrechen</button>
              <button className="btn primary" type="button" onClick={() => void saveRule()} disabled={saving}>
                {saving ? 'Speichert…' : 'Speichern'}
              </button>
            </div>
          </div>
        </section>
      )}

      <div className="ai-rule-list">
      {loading ? (
          <div className="ai-agent-empty">Regeln werden geladen…</div>
        ) : loadError ? (
          <div className="ai-rules-empty ai-rules-empty--error">
            <strong>KI-Regeln momentan nicht verfügbar</strong>
            <span>{loadError}</span>
          </div>
        ) : rules.length ? (
          rules.map((rule) => (
            <article key={rule.id} className={`ai-rule-row ${rule.enabled === 0 ? 'is-disabled' : ''}`}>
              <button className="ai-rule-row-main" type="button" onClick={() => openRule(rule)}>
                <span className="ai-rule-row-title">
                  <strong>{rule.name}</strong>
                  <em>{scopeLabel(rule.scope)}</em>
                </span>
                <p>{rule.instruction}</p>
              </button>
              <div className="ai-rule-row-actions">
                <button
                  className={`ai-rule-switch ${rule.enabled !== 0 ? 'is-active' : ''}`}
                  type="button"
                  role="switch"
                  aria-checked={rule.enabled !== 0}
                  onClick={() => void toggleRule(rule)}
                  title={rule.enabled !== 0 ? 'Deaktivieren' : 'Aktivieren'}
                >
                  <span />
                </button>
                <button className="btn ghost" type="button" onClick={() => openRule(rule)} aria-label={`${rule.name} bearbeiten`} title="Bearbeiten">✎</button>
                <button className="btn ghost btn-trash" type="button" onClick={() => void deleteRule(rule)} aria-label={`${rule.name} löschen`} title="Löschen">
                  <IconTrash size={16} />
                </button>
              </div>
            </article>
          ))
        ) : (
          <div className="ai-rules-empty">
            <strong>Noch keine KI-Regeln</strong>
            <span>Lege Regeln für Händler, Beträge, Tags, Budgets oder Kategorien an.</span>
            <button className="btn primary" type="button" onClick={openNewRule}>Erste Regel anlegen</button>
          </div>
        )}
      </div>
    </section>
  )
}
