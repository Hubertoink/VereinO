import { useState } from 'react'
import { IconAlertTriangle, IconArrowsJoin, IconBuildingBank, IconCategory, IconCheck, IconLock, IconPigMoney, IconShieldCheck, IconTag, IconTrash } from '@tabler/icons-react'
import type { AiImportRow } from '../../../../../../shared/aiImport'
import { ACCOUNT_KIND_LABELS, IMPORT_MASTER_SHEETS, type ImportMasterRow } from '../../../../../../shared/importMasterData'
import { masterUsage, SPHERES } from './model'

const entities = ['paymentAccounts', 'categories', 'tags', 'budgets', 'earmarks'] as const
const entityIcons = { paymentAccounts: IconBuildingBank, categories: IconCategory, tags: IconTag, budgets: IconPigMoney, earmarks: IconLock }
const entityHints = {
  paymentAccounts: 'Neue Konten benötigen einen Kontotyp.',
  categories: 'Neue Kategorien werden ohne Symbol angelegt und lassen sich später anpassen.',
  tags: 'Ähnliche Vorschläge lassen sich zu einem Tag zusammenführen.',
  budgets: 'Budgets benötigen Jahr und Planbetrag (auch 0 ist möglich).',
  earmarks: 'Zweckbindungen benötigen einen eindeutigen Code.'
}

export function AiImportMasterReview({ masters, rows, general, editable, dirty, accepted, onChange, onRemove, onMergeTag, onValidate, onAccept }: {
  masters: readonly ImportMasterRow[]
  rows: readonly AiImportRow[]
  general: boolean
  editable: boolean
  dirty: boolean
  accepted: boolean
  onChange: (id: string, field: keyof ImportMasterRow, value: string) => void
  onRemove: (master: ImportMasterRow) => void
  onMergeTag: (master: ImportMasterRow, target: string) => void
  onValidate: () => void
  onAccept: () => void
}) {
  const [mergeTarget, setMergeTarget] = useState('')
  const newCount = masters.filter(m => m.status === 'new').length
  const errorCount = masters.filter(m => m.status === 'error').length
  const existingCount = masters.filter(m => m.status === 'existing').length
  const selectedRows = rows.filter(r => r.selected)

  if (!masters.length) return <div className="ai-import-empty-state"><IconCheck size={28} aria-hidden="true" /><strong>Keine Stammdaten betroffen</strong><span>Alle Buchungen verwenden vorhandene Konten und Zuordnungen.</span></div>

  const approvalTone = errorCount ? 'is-danger' : accepted ? 'is-success' : newCount ? 'is-warning' : 'is-success'
  return <div className="ai-import-masters">
    <div className={`ai-import-approval ${approvalTone}`}>
      <span className="ai-import-approval__icon">{errorCount ? <IconAlertTriangle size={20} aria-hidden="true" /> : <IconShieldCheck size={20} aria-hidden="true" />}</span>
      <div>
        <strong>{errorCount ? `${errorCount} ${errorCount === 1 ? 'Eintrag benötigt' : 'Einträge benötigen'} eine Korrektur` : accepted ? 'Neue Stammdaten freigegeben' : newCount ? `${newCount} neue Stammdaten zur Freigabe` : 'Alle Stammdaten zugeordnet'}</strong>
        <span>{existingCount} vorhanden · {newCount} neu · {errorCount} mit Änderungsbedarf. {accepted ? 'Sie werden bei der Übernahme angelegt.' : 'Bestehende Stammdaten werden nicht überschrieben.'}{dirty ? ' Änderungen bitte erneut prüfen.' : ''}</span>
      </div>
      <div className="ai-import-approval__actions">
        <button type="button" className="btn" disabled={!editable} onClick={onValidate}>Stammdaten & Buchungen erneut prüfen</button>
        {newCount > 0 && !accepted && <button type="button" className="btn primary" disabled={!editable || dirty || errorCount > 0} onClick={onAccept}>Neue Stammdaten freigeben ({newCount})</button>}
      </div>
    </div>

    {entities.filter(entity => masters.some(m => m.entity === entity)).map(entity => {
      const items = masters.filter(m => m.entity === entity)
      const pending = items.filter(m => m.status !== 'existing')
      const existing = items.filter(m => m.status === 'existing')
      const Icon = entityIcons[entity]
      return <section className="ai-import-master-group" key={entity} aria-labelledby={`ai-import-master-${entity}`}>
        <header><span className="ai-import-master-group__icon"><Icon size={18} aria-hidden="true" /></span><div><h4 id={`ai-import-master-${entity}`}>{IMPORT_MASTER_SHEETS[entity]}</h4><p>{entityHints[entity]}</p></div><span className="ai-import-count">{items.length}</span></header>
        {pending.length > 0 && <ul className="ai-import-master-list">{pending.map(m => {
          const usage = masterUsage(m, selectedRows)
          const locked = !editable
          return <li key={m.id} className={`is-${m.status}`}>
            <span className={`ai-import-pill is-${m.status === 'error' ? 'error' : 'new'}`}>{m.status === 'error' ? 'Korrigieren' : 'Neu'}</span>
            <input className="input ai-import-master-name" aria-label={`Name ${m.reference}`} value={m.name} disabled={locked} onChange={e => onChange(m.id, 'name', e.target.value)} />
            {entity === 'paymentAccounts' && <select className="input" aria-label={`Kontotyp ${m.name}`} value={m.kind} disabled={locked} onChange={e => onChange(m.id, 'kind', e.target.value)}>
              <option value="">Kontotyp wählen …</option>
              {m.kind && !(m.kind in ACCOUNT_KIND_LABELS) && <option value={m.kind}>Unbekannt: {m.kind}</option>}
              {Object.entries(ACCOUNT_KIND_LABELS).map(([kind, label]) => <option key={kind} value={kind}>{label}</option>)}
            </select>}
            {entity === 'budgets' && <>
              <input className="input ai-import-master-short" aria-label={`Budgetjahr ${m.name}`} placeholder="Jahr" value={m.year} disabled={locked} onChange={e => onChange(m.id, 'year', e.target.value)} />
              <input className="input ai-import-master-short" aria-label={`Planbetrag ${m.name}`} placeholder="Planbetrag" value={m.amountPlanned} disabled={locked} onChange={e => onChange(m.id, 'amountPlanned', e.target.value)} />
              {general ? <input className="input" aria-label={`Budget-Kategorie ${m.name}`} placeholder="Kategorie (optional)" value={m.category} disabled={locked} onChange={e => onChange(m.id, 'category', e.target.value)} />
                : <select className="input" aria-label={`Budget-Sphäre ${m.name}`} value={m.sphere} disabled={locked} onChange={e => onChange(m.id, 'sphere', e.target.value)}><option value="">Sphäre wählen …</option>{SPHERES.map(s => <option key={s}>{s}</option>)}</select>}
            </>}
            {entity === 'earmarks' && <input className="input ai-import-master-short" aria-label={`Code ${m.name}`} placeholder="Code" value={m.code} disabled={locked} onChange={e => onChange(m.id, 'code', e.target.value)} />}
            <span className="ai-import-usage">{usage} {usage === 1 ? 'Buchung' : 'Buchungen'}</span>
            <button type="button" className="btn ghost icon btn-trash" disabled={locked} title={`${m.name} entfernen`} aria-label={`${m.name} entfernen`} onClick={() => onRemove(m)}><IconTrash size={16} aria-hidden="true" /></button>
            {(m.issues.length > 0 || m.reference !== m.name) && <small className={m.status === 'error' ? 'ai-import-problem' : 'ai-import-muted'}>{[m.reference !== m.name && `Aus Quelle: ${m.reference}`, ...m.issues].filter(Boolean).join(' · ')}</small>}
          </li>
        })}</ul>}
        {existing.length > 0 && <div className="ai-import-existing"><span>Bereits vorhanden</span>{existing.map(m => <span key={m.id} className="ai-import-chip" title={`${masterUsage(m, selectedRows)} Buchungen`}><IconCheck size={12} aria-hidden="true" />{m.name}</span>)}</div>}
        {entity === 'tags' && pending.length > 0 && <details className="ai-import-disclosure"><summary><IconArrowsJoin size={14} aria-hidden="true" /> Tag-Vorschläge zusammenführen</summary>
          <div className="ai-import-merge">
            <label className="ai-import-field">Ziel-Tag (vorhandener oder neuer Name)<input className="input" disabled={!editable} value={mergeTarget} onChange={e => setMergeTarget(e.target.value)} /></label>
            <div className="ai-import-merge__buttons">{pending.map(m => <button type="button" className="btn" key={m.id} disabled={!editable || !mergeTarget.trim() || /[;,]/.test(mergeTarget)} onClick={() => onMergeTag(m, mergeTarget)}>„{m.name}“ zusammenführen</button>)}</div>
            <p className="ai-import-muted">Die Zuordnungen aller Zeilen werden ersetzt. Bestehende Tags in VereinO werden dabei nicht umbenannt.</p>
          </div>
        </details>}
      </section>
    })}
  </div>
}
