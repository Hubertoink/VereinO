import React from 'react'
import type { TParty, TPartyRole } from '../../../../../electron/main/ipc/schemas'
import { PartyEditorModal } from '../../../components/common/PartySelector'
import { PARTY_ROLE_LABELS } from '../../../components/common/partyLabels'
import { dispatchDataChanged } from '../../../utils/refresh'

type Props = {
  notify: (type: 'success' | 'error' | 'info', text: string) => void
}

export function PartiesPane({ notify }: Props) {
  const [parties, setParties] = React.useState<TParty[]>([])
  const [query, setQuery] = React.useState('')
  const [role, setRole] = React.useState<TPartyRole | ''>('')
  const [showArchived, setShowArchived] = React.useState(false)
  const [draft, setDraft] = React.useState<Partial<TParty> | null>(null)
  const [busy, setBusy] = React.useState(false)

  const load = React.useCallback(async () => {
    setBusy(true)
    try {
      const result = await window.api.parties.list({
        q: query.trim() || undefined,
        role: role || undefined,
        activeOnly: !showArchived,
        limit: 500
      })
      setParties(result.rows)
    } catch (e: any) {
      notify('error', e?.message || String(e))
    } finally {
      setBusy(false)
    }
  }, [notify, query, role, showArchived])

  React.useEffect(() => { void load() }, [load])

  const toggleArchive = async (party: TParty) => {
    try {
      const activate = party.isActive === 0
      await window.api.parties.archive({ id: party.id, isActive: activate })
      notify('success', activate ? 'Geschäftspartner reaktiviert' : 'Geschäftspartner archiviert')
      dispatchDataChanged(['parties'])
      await load()
    } catch (e: any) {
      notify('error', e?.message || String(e))
    }
  }

  return (
    <div className="parties-pane">
      <div className="settings-pane-heading">
        <div>
          <div className="settings-pane-title-row"><strong>Geschäftspartner</strong><span className="chip">{parties.length}</span></div>
          <div className="helper">Zentrale Lieferanten- und Kundenkartei für Buchungen, Forderungen, Verbindlichkeiten und Rechnungen.</div>
        </div>
        <button type="button" className="btn primary" onClick={() => setDraft({ role: 'BOTH', isActive: 1 })}>+ Neuer Geschäftspartner</button>
      </div>

      <div className="card parties-toolbar">
        <input className="input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name, Ort, E-Mail oder IBAN suchen …" />
        <select className="input" value={role} onChange={(e) => setRole(e.target.value as TPartyRole | '')}>
          <option value="">Alle Rollen</option>
          {Object.entries(PARTY_ROLE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <label className="parties-toolbar__check"><input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Archivierte anzeigen</label>
      </div>

      {!!parties.length && (
        <div className="card parties-table-wrap">
          <table className="table parties-table">
            <thead>
              <tr>
                <th>Geschäftspartner</th>
                <th>Rolle</th>
                <th>Ort</th>
                <th>Kontakt</th>
                <th className="parties-table__usage">Verwendungen</th>
                <th>Zuletzt verwendet</th>
                <th className="parties-table__actions">Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {parties.map((party) => {
                const usage = party.voucherCount + party.invoiceCount + party.submissionCount
                const address = [party.postalCode, party.city].filter(Boolean).join(' ')
                const contact = [party.email, party.phone].filter(Boolean)
                return (
                  <tr key={party.id} className={party.isActive === 0 ? 'is-archived' : undefined}>
                    <td>
                      <strong>{party.name}</strong>
                      {party.legalName && party.legalName !== party.name && <span>{party.legalName}</span>}
                      {party.isActive === 0 && <span className="chip">Archiviert</span>}
                    </td>
                    <td><span className="chip">{PARTY_ROLE_LABELS[party.role]}</span></td>
                    <td>{address || <span className="helper">–</span>}</td>
                    <td>{contact.length ? contact.map((item) => <span key={item}>{item}</span>) : <span className="helper">–</span>}</td>
                    <td className="parties-table__usage">{usage}</td>
                    <td>{party.lastUsedAt || <span className="helper">–</span>}</td>
                    <td className="parties-table__actions">
                      <div className="parties-table__action-buttons">
                        <button
                          type="button"
                          className="btn"
                          onClick={() => void toggleArchive(party)}
                          aria-label={party.isActive === 0 ? 'Geschäftspartner reaktivieren' : 'Geschäftspartner archivieren'}
                          title={party.isActive === 0 ? 'Reaktivieren' : 'Archivieren'}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            {party.isActive === 0
                              ? <><polyline points="17 11 12 6 7 11" /><polyline points="17 18 12 13 7 18" /></>
                              : <><polyline points="7 13 12 18 17 13" /><polyline points="7 6 12 11 17 6" /></>}
                          </svg>
                        </button>
                        <button type="button" className="btn btn-edit" onClick={() => setDraft(party)} aria-label="Geschäftspartner bearbeiten" title="Bearbeiten">✎</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {!busy && !parties.length && <div className="card parties-empty">Noch keine passenden Geschäftspartner vorhanden.</div>}
      {busy && <div className="helper">Lade Geschäftspartner…</div>}

      {draft && <PartyEditorModal initial={draft} onClose={() => setDraft(null)} onSaved={async () => { const wasEditing = Boolean(draft.id); setDraft(null); notify('success', wasEditing ? 'Geschäftspartner aktualisiert' : 'Geschäftspartner angelegt'); await load() }} />}
    </div>
  )
}
