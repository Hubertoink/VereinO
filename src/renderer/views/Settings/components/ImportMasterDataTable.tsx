import { ACCOUNT_KIND_LABELS, IMPORT_MASTER_SHEETS, type ImportMasterRow } from '../../../../../shared/importMasterData'

export function ImportMasterDataTable({ rows, general, busy, dirty, onChange, onValidate, onCreate }: {
  rows: ImportMasterRow[]
  general: boolean
  busy: boolean
  dirty: boolean
  onChange: (id: string, field: keyof ImportMasterRow, value: string) => void
  onValidate: () => void
  onCreate: () => void
}) {
  const newCount = rows.filter(r => r.status === 'new').length
  const errorCount = rows.filter(r => r.status === 'error').length
  return <div className="card import-missing-card" style={{ marginTop: 10, padding: 12 }}>
    <strong>Stammdaten prüfen und zuordnen</strong>
    <p className="helper">{rows.length} Einträge gelesen: {rows.filter(r => r.status === 'existing').length} zugeordnet, {newCount} neu, {errorCount} mit Änderungsbedarf. Bestehende Stammdaten werden nicht überschrieben.</p>
    <p className="helper import-master-guidance">Unbekannte Kontotypen bitte auswählen. Budgets benötigen Jahr und Planbetrag (auch 0 ist möglich). Änderungen anschließend erneut prüfen.</p>
    <div style={{ overflowX: 'auto', maxHeight: 360 }}>
      <table className="import-draft-table import-master-table">
        <thead><tr><th>Quelle</th><th>Stammdaten</th><th>Name</th><th>Angaben / Zuordnung</th><th>Prüfung</th></tr></thead>
        <tbody>{rows.map(row => <tr key={row.id} className={row.status === 'error' ? 'import-row-error' : ''}>
          <td>{row.sourceSheet}, Zeile {row.sourceRow}</td>
          <td>{IMPORT_MASTER_SHEETS[row.entity]}</td>
          <td><input aria-label={`Name ${row.reference}`} value={row.name} disabled={busy || row.status === 'existing'} onChange={e => onChange(row.id, 'name', e.target.value)} /><div className="helper">Referenz: {row.reference}</div></td>
          <td>
            {row.entity === 'paymentAccounts' && <select aria-label={`Kontotyp ${row.name}`} value={row.kind} disabled={busy || row.status === 'existing'} onChange={e => onChange(row.id, 'kind', e.target.value)}>
              <option value="">Kontotyp zuordnen…</option>
              {row.kind && !(row.kind in ACCOUNT_KIND_LABELS) && <option value={row.kind}>Unbekannt: {row.kind}</option>}
              {Object.entries(ACCOUNT_KIND_LABELS).map(([kind, label]) => <option key={kind} value={kind}>{label}</option>)}
            </select>}
            {row.entity === 'budgets' && <div className="import-master-budget-fields">
              <input aria-label={`Budgetjahr ${row.name}`} placeholder="Jahr" value={row.year} disabled={busy || row.status === 'existing'} onChange={e => onChange(row.id, 'year', e.target.value)} />
              <input aria-label={`Planbetrag ${row.name}`} placeholder="Planbetrag" value={row.amountPlanned} disabled={busy || row.status === 'existing'} onChange={e => onChange(row.id, 'amountPlanned', e.target.value)} />
              {general ? <input aria-label={`Budget-Kategorie ${row.name}`} placeholder="Kategorie (optional)" value={row.category} disabled={busy || row.status === 'existing'} onChange={e => onChange(row.id, 'category', e.target.value)} /> :
                <select aria-label={`Budget-Sphäre ${row.name}`} value={row.sphere} disabled={busy || row.status === 'existing'} onChange={e => onChange(row.id, 'sphere', e.target.value)}><option value="">Sphäre wählen…</option>{['IDEELL', 'ZWECK', 'VERMOEGEN', 'WGB'].map(s => <option key={s}>{s}</option>)}</select>}
            </div>}
            {row.entity === 'earmarks' && <input aria-label={`Code ${row.name}`} placeholder="Code" value={row.code} disabled={busy || row.status === 'existing'} onChange={e => onChange(row.id, 'code', e.target.value)} />}
          </td>
          <td>{dirty ? 'Erneute Prüfung erforderlich' : row.status === 'existing' ? 'Zugeordnet' : row.status === 'new' ? 'Geprüft · wird neu angelegt' : row.issues.join(' ')}</td>

        </tr>)}</tbody>
      </table>
    </div>
    <div className="import-master-actions" style={{ display: 'flex', gap: 8, marginTop: 10 }}>
      <button className="btn" disabled={busy} onClick={onValidate}>Stammdaten & Buchungen erneut prüfen</button>
      <button className="btn" disabled={busy || dirty || errorCount > 0 || newCount === 0} onClick={onCreate}>Geprüfte Stammdaten anlegen ({newCount})</button>
    </div>
  </div>
}
