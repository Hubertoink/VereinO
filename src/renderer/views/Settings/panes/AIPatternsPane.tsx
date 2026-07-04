import React from 'react'
import {
  AI_PATTERNS_CHANGED_EVENT,
  deleteBookingAIPattern,
  isBookingAIPatternsEnabled,
  listBookingAIPatternRows,
  setBookingAIPatternEnabled,
  setBookingAIPatternsEnabled,
  type BookingAIPatternRow
} from '../../../utils/bookingAiPatterns'
import type { PaymentAccount, TagDef } from '../types'

type Props = {
  tagDefs: TagDef[]
  paymentAccounts: PaymentAccount[]
  notify: (type: 'success' | 'error' | 'info', text: string, ms?: number, action?: { label: string; onClick: () => void }) => void
}

type Lookup = {
  budgets: Map<number, { label: string; color?: string | null }>
  earmarks: Map<number, { label: string; color?: string | null }>
}

export function AIPatternsPane({ tagDefs, paymentAccounts, notify }: Props) {
  const [rows, setRows] = React.useState<BookingAIPatternRow[]>(() => listBookingAIPatternRows())
  const [enabled, setEnabled] = React.useState(() => isBookingAIPatternsEnabled())
  const [lookup, setLookup] = React.useState<Lookup>(() => ({ budgets: new Map(), earmarks: new Map() }))

  const refresh = React.useCallback(() => {
    setRows(listBookingAIPatternRows())
    setEnabled(isBookingAIPatternsEnabled())
  }, [])

  React.useEffect(() => {
    refresh()
    const onChanged = () => refresh()
    window.addEventListener(AI_PATTERNS_CHANGED_EVENT, onChanged)
    window.addEventListener('storage', onChanged)
    return () => {
      window.removeEventListener(AI_PATTERNS_CHANGED_EVENT, onChanged)
      window.removeEventListener('storage', onChanged)
    }
  }, [refresh])

  React.useEffect(() => {
    let cancelled = false
    async function loadLookups() {
      try {
        const [budgetsRes, earmarksRes] = await Promise.all([
          window.api?.budgets?.list?.({ includeArchived: true } as any),
          window.api?.bindings?.list?.({} as any),
        ])
        if (cancelled) return
        const budgetMap = new Map<number, { label: string; color?: string | null }>()
        for (const budget of ((budgetsRes as any)?.rows || [])) {
          const label = budget.label || budget.name || budget.projectName || budget.categoryName || `Budget #${budget.id}`
          budgetMap.set(Number(budget.id), { label, color: budget.color })
        }
        const earmarkMap = new Map<number, { label: string; color?: string | null }>()
        for (const earmark of ((earmarksRes as any)?.rows || [])) {
          const label = `${earmark.code ? `${earmark.code} ` : ''}${earmark.name || `Zweckbindung #${earmark.id}`}`.trim()
          earmarkMap.set(Number(earmark.id), { label, color: earmark.color })
        }
        setLookup({ budgets: budgetMap, earmarks: earmarkMap })
      } catch {
        // The table remains usable with fallback labels.
      }
    }
    void loadLookups()
    return () => { cancelled = true }
  }, [])

  const tagByName = React.useMemo(() => new Map(tagDefs.map((tag) => [tag.name.toLowerCase(), tag])), [tagDefs])
  const accountById = React.useMemo(() => new Map((paymentAccounts || []).map((account) => [account.id, account])), [paymentAccounts])
  const rules = rows.filter((row) => row.kind === 'rule')
  const learned = rows.filter((row) => row.kind === 'learned')

  function toggleGlobal() {
    const next = !enabled
    setBookingAIPatternsEnabled(next)
    notify('success', next ? 'Mustererkennung aktiviert' : 'Mustererkennung ausgeschaltet')
  }

  function toggle(row: BookingAIPatternRow) {
    setBookingAIPatternEnabled(row.key, !row.enabled)
    notify('success', !row.enabled ? 'KI-Muster aktiviert' : 'KI-Muster deaktiviert')
  }

  function remove(row: BookingAIPatternRow) {
    deleteBookingAIPattern(row.key)
    notify('success', 'Gelerntes Muster entfernt')
  }

  const chipStyle = (color?: string | null) => color ? { borderColor: color, background: `${color}24`, color } : undefined

  const renderChips = (row: BookingAIPatternRow) => (
    <div className="ai-pattern-row__chips">
      {row.type && <span className={`ai-pattern-chip ${row.type === 'IN' ? 'ai-pattern-chip--in' : row.type === 'OUT' ? 'ai-pattern-chip--out' : ''}`}>{row.type}</span>}
      {row.sphere && <span className="ai-pattern-chip ai-pattern-chip--sphere">{row.sphere}</span>}
      {row.paymentAccountId && (() => {
        const account = accountById.get(Number(row.paymentAccountId))
        return <span className="ai-pattern-chip" style={chipStyle(account?.color)}>Konto: {account?.name || `#${row.paymentAccountId}`}</span>
      })()}
      {row.transferFromAccountId && (() => {
        const account = accountById.get(Number(row.transferFromAccountId))
        return <span className="ai-pattern-chip" style={chipStyle(account?.color)}>Von: {account?.name || `#${row.transferFromAccountId}`}</span>
      })()}
      {row.transferToAccountId && (() => {
        const account = accountById.get(Number(row.transferToAccountId))
        return <span className="ai-pattern-chip" style={chipStyle(account?.color)}>Nach: {account?.name || `#${row.transferToAccountId}`}</span>
      })()}
      {(row.tags || []).map((tag) => {
        const tagDef = tagByName.get(tag.toLowerCase())
        return <span key={tag} className="ai-pattern-chip" style={chipStyle(tagDef?.color)}>{tag}</span>
      })}
      {(row.budgets || []).map((budget) => {
        const info = lookup.budgets.get(budget.id)
        return <span key={`budget-${budget.id}`} className="ai-pattern-chip" style={chipStyle(info?.color)}>{info?.label || `Budget #${budget.id}`}</span>
      })}
      {(row.earmarks || []).map((earmark) => {
        const info = lookup.earmarks.get(earmark.id)
        return <span key={`earmark-${earmark.id}`} className="ai-pattern-chip" style={chipStyle(info?.color)}>{info?.label || `Zweckbindung #${earmark.id}`}</span>
      })}
    </div>
  )

  const formatDate = (value?: number) => {
    if (!value) return '-'
    try {
      return new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' }).format(new Date(value))
    } catch {
      return '-'
    }
  }

  const renderTable = (items: BookingAIPatternRow[], kind: 'rule' | 'learned') => items.length ? (
    <div className="ai-pattern-table-wrap">
      <table className="ai-pattern-table">
        <thead>
          <tr>
            <th>Status</th>
            <th>Muster</th>
            <th>Übernahme</th>
            <th>{kind === 'learned' ? 'Gelernt' : 'Nutzung'}</th>
            <th>Aktionen</th>
          </tr>
        </thead>
        <tbody>
          {items.map((row) => (
            <tr key={row.key} className={row.enabled ? '' : 'is-disabled'}>
              <td>
                <label className="switch" title={row.enabled ? 'Muster ausschalten' : 'Muster einschalten'}>
                  <input type="checkbox" checked={row.enabled} onChange={() => toggle(row)} disabled={!enabled} />
                  <span />
                </label>
              </td>
              <td>
                <strong>{row.title}</strong>
                <span>{row.kind === 'rule' ? 'Eingebaute Regel' : row.key}</span>
              </td>
              <td>{renderChips(row)}</td>
              <td>
                <strong>{row.accepted}</strong>
                <span>{kind === 'learned' ? `zuletzt ${formatDate(row.lastUsedAt)}` : 'Übernahmen'}</span>
              </td>
              <td>
                {row.kind === 'learned' ? (
                  <button type="button" className="btn ghost" onClick={() => remove(row)} title="Gelerntes Muster entfernen">✕</button>
                ) : (
                  <span className="helper">-</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <div className="card ai-pattern-empty">Noch keine gelernten Muster vorhanden.</div>
  )

  return (
    <div className="settings-pane ai-pattern-pane">
      <div className="card settings-pane-card ai-pattern-overview">
        <div>
          <div className="settings-title">
            <span aria-hidden="true">✦</span> <strong>KI-Muster</strong>
          </div>
          <div className="settings-sub">
            Steuere, welche lokalen Buchungshilfen im Buchungsmodal Vorschläge machen. Gelernte Muster entstehen beim Speichern sauber zugeordneter Buchungen.
          </div>
        </div>
        <label className={`ai-pattern-global-toggle ${enabled ? 'is-on' : 'is-off'}`} htmlFor="ai-patterns-enabled">
          <span className="ai-pattern-global-toggle__copy">
            <strong>Mustererkennung</strong>
          </span>
          <input
            id="ai-patterns-enabled"
            type="checkbox"
            role="switch"
            checked={enabled}
            onChange={toggleGlobal}
          />
          <span className="ai-pattern-global-toggle__control" aria-hidden="true">
            <span className="ai-pattern-global-toggle__knob" />
          </span>
        </label>
      </div>

      <div className="card settings-pane-card">
        <div className="settings-title"><strong>Regeln</strong></div>
        {renderTable(rules, 'rule')}
      </div>

      <div className="card settings-pane-card">
        <div className="settings-title"><strong>Gelernte Muster</strong></div>
        {renderTable(learned, 'learned')}
      </div>
    </div>
  )
}
