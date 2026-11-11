import React, { useEffect, useState } from 'react'
import { addDataChangedListener } from '../../utils/refresh'

const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })

export function SidebarMembershipFees({ onSelect }: { onSelect: () => void }) {
  const [summary, setSummary] = useState<{ dueMembers: number; dueAmount: number } | null>(null)
  const [failed, setFailed] = useState(false)
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    let disposed = false
    let request = 0
    const load = async () => {
      const current = ++request
      try {
        const result = await window.api.members.list({ contributionFilter: 'DUE', includeSummary: true, limit: 1, offset: 0 })
        if (!result.summary) throw new Error('Missing contribution summary')
        if (!disposed && current === request) { setSummary(result.summary); setFailed(false) }
      } catch {
        if (!disposed && current === request) { setSummary(null); setFailed(true) }
      }
    }
    const offChange = addDataChangedListener(['members', 'vouchers', 'settings'], () => { void load() })
    const offSwitch = window.api.organizations.onSwitched(() => { setSummary(null); setFailed(false); void load() })
    window.addEventListener('focus', load)
    let midnightTimer: ReturnType<typeof setTimeout>
    const scheduleMidnight = () => {
      const now = new Date()
      const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
      midnightTimer = setTimeout(() => { void load(); scheduleMidnight() }, tomorrow.getTime() - now.getTime() + 100)
    }
    scheduleMidnight()
    void load()
    return () => { disposed = true; offChange(); offSwitch?.(); window.removeEventListener('focus', load); clearTimeout(midnightTimer) }
  }, [retry])
  return <div className="sidebar-recent-assignments sidebar-membership-fees" role="group" aria-label="Überfällige Beiträge">
    <p className="sidebar-section-caption">Überfällige Beiträge</p>
    {failed ? <div className="sidebar-accounts-message" role="status">Beiträge nicht verfügbar.<button type="button" className="sidebar-accounts-more" onClick={() => setRetry(value => value + 1)}>Erneut laden</button></div>
      : !summary ? <p className="sidebar-accounts-message" role="status">Beiträge werden geladen …</p>
      : summary.dueMembers > 0 ? <button type="button" className="sidebar-recent-assignment" title="Mitglieder mit überfälligen Beiträgen anzeigen" onClick={onSelect}>
        <span className="sidebar-assignment-heading"><span className="sidebar-assignment-name">{summary.dueMembers} {summary.dueMembers === 1 ? 'Mitglied' : 'Mitglieder'}</span><span className="sidebar-assignment-balance is-negative">{euro.format(summary.dueAmount)}</span></span>
      </button> : <p className="sidebar-accounts-message">Keine überfälligen Beiträge.</p>}
  </div>
}
