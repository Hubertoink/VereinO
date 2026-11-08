import React, { useEffect, useId, useState } from 'react'
import { IconChevronDown, IconChevronRight } from '@tabler/icons-react'
import { addDataChangedListener } from '../../utils/refresh'

type Account = { id: number; name: string; balance: number; isActive: number; color?: string | null }
const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })
const localToday = () => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

export function SidebarAccounts({ selectedId, onSelect }: { selectedId?: number | null; onSelect: (id: number) => void }) {
  const [expanded, setExpanded] = useState(() => {
    try { return localStorage.getItem('ui.sidebarAccountsExpanded') !== 'false' } catch { return true }
  })
  const [showAll, setShowAll] = useState(false)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [retry, setRetry] = useState(0)
  const listId = useId()
  useEffect(() => {
    try { localStorage.setItem('ui.sidebarAccountsExpanded', String(expanded)) } catch { /* Optional preference. */ }
  }, [expanded])
  useEffect(() => {
    if (!expanded) return
    let disposed = false
    let request = 0
    const load = async () => {
      const current = ++request
      setStatus('loading')
      try {
        const result = await window.api.reports.cashBalance({ to: localToday() })
        if (disposed || current !== request) return
        setAccounts((result.accounts || []).filter(account => account.id > 0))
        setStatus('ready')
      } catch {
        if (!disposed && current === request) { setAccounts([]); setStatus('error') }
      }
    }
    const switchOrganization = () => { setAccounts([]); setShowAll(false); void load() }
    const offSwitch = window.api.organizations.onSwitched(switchOrganization)
    const offChange = addDataChangedListener(['vouchers', 'settings', 'organizations'], () => { void load() })
    window.addEventListener('focus', load)
    let midnightTimer: ReturnType<typeof setTimeout>
    const scheduleMidnight = () => {
      const now = new Date()
      const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
      midnightTimer = setTimeout(() => { void load(); scheduleMidnight() }, tomorrow.getTime() - now.getTime() + 100)
    }
    scheduleMidnight()
    void load()
    return () => { disposed = true; offSwitch?.(); offChange(); window.removeEventListener('focus', load); clearTimeout(midnightTimer) }
  }, [expanded, retry])
  const visible = showAll ? accounts : accounts.slice(0, 3)
  return <div className="sidebar-accounts">
    <button type="button" className="sidebar-accounts-toggle" aria-expanded={expanded} aria-controls={listId} onClick={() => setExpanded(value => !value)}>
      <span>Zahlkonten</span>{expanded ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
    </button>
    {expanded && <div id={listId} className="sidebar-accounts-content">
      <p className="sidebar-accounts-caption">Bestand laut Buchungen · Stand heute</p>
      {status === 'loading' && <p className="sidebar-accounts-message" role="status">Bestände werden geladen …</p>}
      {status === 'error' && <div className="sidebar-accounts-message" role="status">Bestände nicht verfügbar.<button type="button" className="sidebar-accounts-more" onClick={() => setRetry(value => value + 1)}>Erneut laden</button></div>}
      {status === 'ready' && !accounts.length && <p className="sidebar-accounts-message">Noch keine Zahlkonten angelegt.</p>}
      {status === 'ready' && visible.map(account => <button key={account.id} type="button" className={`sidebar-account${selectedId === account.id ? ' is-selected' : ''}`} aria-pressed={selectedId === account.id} onClick={() => onSelect(account.id)} title={`${account.name}${account.isActive === 0 ? ' (inaktiv)' : ''}: ${euro.format(account.balance)} – Buchungen anzeigen`}>
        <span className="sidebar-account-name"><span className="sidebar-account-dot" style={{ backgroundColor: account.color || 'var(--text-dim)' }} />{account.name}{account.isActive === 0 && <small> (inaktiv)</small>}</span>
        <span className={`sidebar-account-balance${account.balance < 0 ? ' is-negative' : ''}`}>{euro.format(account.balance)}</span>
      </button>)}
      {status === 'ready' && accounts.length > 3 && <button type="button" className="sidebar-accounts-more" aria-expanded={showAll} onClick={() => setShowAll(value => !value)}>{showAll ? 'Weniger anzeigen' : `Alle Zahlkonten (${accounts.length}) …`}</button>}
    </div>}
  </div>
}
