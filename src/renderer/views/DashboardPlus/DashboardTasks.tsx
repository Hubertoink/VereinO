import React, { useEffect, useRef, useState } from 'react'
import { IconArrowUpRight, IconBuildingBank, IconUsers, IconReceipt2, IconRepeat, IconCheck, IconChevronDown, IconSettings, IconAlertTriangle, IconClock, IconWallet, IconFileDescription, IconShieldCheck, IconTarget, IconInbox } from '@tabler/icons-react'
import type { DashboardTasks as TaskData, DashboardTaskGroup, DashboardTaskKind, DashboardTaskTarget } from '../../../../shared/dashboardTasks'
import { addDataChangedListener, dispatchDataChanged } from '../../utils/refresh'
import FilterDropdown from '../../components/dropdowns/FilterDropdown'

const money = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })
const mainKinds: DashboardTaskKind[] = ['bank', 'members', 'invoices', 'recurring']
const icons = { bank: IconBuildingBank, members: IconUsers, invoices: IconReceipt2, receivables: IconReceipt2, recurring: IconRepeat, reimbursements: IconWallet, advances: IconWallet, submissions: IconInbox, drafts: IconFileDescription, budgets: IconTarget, bindings: IconTarget, backup: IconShieldCheck, ai: IconFileDescription }
const labels = { urgent: 'Jetzt erledigen', soon: 'Demnächst prüfen', open: 'Offen', clear: 'Alles erledigt' }
const rank = { urgent: 0, soon: 1, open: 2, clear: 3 }
type Draft = { id: string; title: string }

export default function DashboardTasks({ today, generalProfile, drafts = [], onOpenDraft, onNavigate }: {
  today: string; generalProfile: boolean; drafts?: Draft[]; onOpenDraft?: (id: string) => void; onNavigate: (target: DashboardTaskTarget) => void
}) {
  const [data, setData] = useState<TaskData | null>(null)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const [panel, setPanel] = useState<DashboardTaskKind | 'reminders' | 'clear' | null>(null)
  const [reminders, setReminders] = useState<Record<number, number>>({})
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState('')
  const organizationRevision = useRef(0)
  useEffect(() => () => { organizationRevision.current++ }, [])
  useEffect(() => addDataChangedListener(['vouchers', 'members', 'invoices', 'reimbursements', 'submissions', 'bank-imports', 'recurring-bookings', 'budgets', 'earmarks', 'settings', 'organizations'], () => setRevision(value => value + 1)), [])
  useEffect(() => {
    let alive = true
    setData(null); setError(''); setActionError('')
    window.api.app.dashboardTasks({ today }).then(result => {
      if (alive) { setData(result); setReminders(Object.fromEntries(result.bankAccounts.map(account => [account.id, account.reminderDays]))) }
    }).catch(() => { if (alive) setError('Offene Aufgaben konnten nicht geladen werden.') })
    return () => { alive = false }
  }, [today, revision])
  useEffect(() => window.api.organizations.onSwitched(() => { organizationRevision.current++; setBusy(false); setPanel(null); setRevision(value => value + 1) }), [])
  const backup = async () => {
    const organization = organizationRevision.current
    setBusy(true); setActionError('')
    try {
      const result = await window.api.backup.make('dashboard')
      if (organization !== organizationRevision.current) return
      if (!result.ok) throw new Error(result.error || 'Sicherung fehlgeschlagen')
      setPanel(null)
      setRevision(value => value + 1)
    } catch (reason) { if (organization === organizationRevision.current) setActionError(reason instanceof Error ? reason.message : 'Sicherung fehlgeschlagen') }
    finally { if (organization === organizationRevision.current) setBusy(false) }
  }
  const saveReminders = async (event: React.FormEvent) => {
    const organization = organizationRevision.current
    event.preventDefault(); setBusy(true); setActionError('')
    try {
      for (const account of data?.bankAccounts || []) {
        if (organization !== organizationRevision.current) return
        const days = reminders[account.id]
        if (!Number.isInteger(days) || days < 0 || days > 365) throw new Error('Bitte 0 bis 365 Tage eingeben.')
        if (days === account.reminderDays) continue
        const result = await window.api.settings.set({ key: `dashboard.bankReminderDays.${account.id}`, value: days })
        if (organization !== organizationRevision.current) return
        if (!result.ok) throw new Error('Erinnerung konnte nicht gespeichert werden.')
      }
      setPanel(null); setRevision(value => value + 1); dispatchDataChanged(['settings'])
    } catch (reason) { if (organization === organizationRevision.current) setActionError(reason instanceof Error ? reason.message : 'Speichern fehlgeschlagen') }
    finally { if (organization === organizationRevision.current) setBusy(false) }
  }
  const changePanel = (kind: NonNullable<typeof panel>, isOpen: boolean) => { setPanel(isOpen ? kind : null); setActionError('') }
  const draftGroup: DashboardTaskGroup = { kind: 'drafts', title: 'Offene Entwürfe', value: `${drafts.length} ${drafts.length === 1 ? 'Entwurf' : 'Entwürfe'}`, detail: 'Buchungen und Belege fertigstellen', count: drafts.length, level: drafts.length ? 'open' : 'clear', target: { kind: 'drafts' }, items: [] }
  const groups = [...(data?.groups || []), draftGroup].filter(group => !generalProfile || !['members', 'bindings'].includes(group.kind))
  const open = groups.filter(group => group.level !== 'clear')
  const clear = groups.filter(group => group.level === 'clear')
  const navigate = (target: DashboardTaskTarget) => {
    if (target.kind === 'backup') void backup()
    else { setPanel(null); onNavigate(target) }
  }
  const details = (group: DashboardTaskGroup) => <div className="dp-task-details">
    {group.kind === 'drafts' ? <ul>{drafts.slice(0, 10).map(draft => <li key={draft.id}><button onClick={() => { setPanel(null); onOpenDraft?.(draft.id) }}>{draft.title}<IconArrowUpRight size={16} /></button></li>)}</ul> : <ul>{group.items.map(item => <li key={item.id}><button onClick={() => navigate(item.target)} disabled={busy}><span className={`dp-task-indicator dp-task-indicator--${item.level}`} /><span><strong>{item.title}</strong><small>{item.detail}</small></span>{item.amount != null && <b>{money.format(item.amount)}</b>}<IconArrowUpRight size={16} /></button></li>)}</ul>}
    {group.kind === 'bank' && <div className="dp-task-account-status">{data?.bankAccounts.map(account => <p key={account.id}><strong>{account.name}</strong><span>{account.lastImportAt ? `Letzter Import mit neuen Umsätzen: ${account.lastImportAt.slice(0, 10).split('-').reverse().join('.')}` : 'Noch kein Import mit neuen Umsätzen'} · {account.lastBookingDate ? `Umsätze bis ${account.lastBookingDate.split('-').reverse().join('.')}` : 'Noch keine Bankumsätze'}</span></p>)}</div>}
    {group.kind !== 'drafts' && <button type="button" className="btn" disabled={busy} onClick={() => navigate(group.target)}>{group.kind === 'backup' ? busy ? 'Sicherung läuft …' : 'Jetzt sichern' : 'In der passenden Ansicht öffnen'}<IconArrowUpRight size={15} /></button>}
    {group.count > (group.kind === 'drafts' ? 10 : group.items.length) && <small>{group.count} Vorgänge insgesamt · die ersten {group.kind === 'drafts' ? 10 : group.items.length} werden angezeigt</small>}
    {actionError && <p role="alert">{actionError}</p>}
  </div>
  const tile = (group: DashboardTaskGroup) => {
    const Icon = icons[group.kind]
    return <article key={group.kind} className={`dp-task dp-task--${group.level}${panel === group.kind ? ' dp-task--expanded' : ''}`}><span className="dp-task-label"><Icon size={19} />{group.title}</span><strong>{group.value}</strong><span className="dp-task-description">{group.detail}</span><div className="dp-task-status"><FilterDropdown title={group.title} width={440} panelClassName="dp-task-popover" open={panel === group.kind} onOpenChange={isOpen => changePanel(group.kind, isOpen)} trigger={<>{group.level === 'urgent' ? <IconAlertTriangle size={14} /> : <IconClock size={14} />}{labels[group.level]}<IconChevronDown size={14} /></>}>{details(group)}</FilterDropdown></div></article>
  }
  return <section className="dp-tasks" aria-labelledby="dp-tasks-heading" aria-busy={!data && !error}>
    <header className="dp-tasks-heading"><div><h2 id="dp-tasks-heading">Was zu tun ist</h2><span>Aktueller Stand · {today.split('-').reverse().join('.')} · unabhängig vom Diagrammzeitraum</span></div>{data && <div className="dp-task-tools">
      <FilterDropdown title="Erinnerungen" width={400} alignRight panelClassName="dp-task-popover" open={panel === 'reminders'} onOpenChange={isOpen => changePanel('reminders', isOpen)} trigger={<><IconSettings size={15} />Erinnerungen</>}>
        <form className="dp-task-reminders" onSubmit={saveReminders}><h3>Bankimport-Erinnerungen</h3><p>Erinnerung nach dieser Anzahl Tagen seit dem letzten Import mit neuen Umsätzen. 0 schaltet sie aus; offene Bankbelege bleiben sichtbar.</p>{data.bankAccounts.length ? data.bankAccounts.map(account => <label key={account.id}><span>{account.name}</span><input className="input" type="number" min="0" max="365" step="1" required value={reminders[account.id] ?? 14} onChange={event => setReminders(current => ({ ...current, [account.id]: Number(event.target.value) }))} disabled={busy} /><span>Tage</span></label>) : <p>Keine aktiven Konten für Bankimporte vorhanden.</p>}<button type="submit" className="btn" disabled={busy || !data.bankAccounts.length}>{busy ? 'Wird gespeichert …' : 'Speichern'}</button>{actionError && <p role="alert">{actionError}</p>}</form>
      </FilterDropdown>
      <FilterDropdown title="Nichts offen" buttonTitle={`${clear.length} Bereiche ohne offene Aufgaben`} width={340} alignRight panelClassName="dp-task-popover" open={panel === 'clear'} onOpenChange={isOpen => changePanel('clear', isOpen)} trigger={<IconCheck className="dp-task-clear-icon" size={19} />}>
        {clear.length ? <ul className="dp-task-clear-list">{clear.map(group => <li key={group.kind}><IconCheck size={15} /><span>{group.title}<small>{['bank', 'backup'].includes(group.kind) ? group.value : 'Nichts offen'}</small></span></li>)}</ul> : <p>In allen Bereichen gibt es noch offene Aufgaben.</p>}
      </FilterDropdown>
    </div>}</header>
    {error ? <div role="alert">{error} <button className="btn" onClick={() => setRevision(value => value + 1)}>Erneut versuchen</button></div> : !data ? <p role="status">Offene Aufgaben werden geladen …</p> : <>
      {!open.length && <p className="dp-tasks-clear"><IconCheck size={18} />Alles erledigt – aktuell gibt es keine offenen Aufgaben.</p>}
      {open.some(group => mainKinds.includes(group.kind)) && <div className="dp-task-grid">{open.filter(group => mainKinds.includes(group.kind)).sort((a, b) => rank[a.level] - rank[b.level]).map(tile)}</div>}
      {open.some(group => !mainKinds.includes(group.kind)) && <div className="dp-task-extra" aria-label="Weitere offene Aufgaben">{open.filter(group => !mainKinds.includes(group.kind)).sort((a, b) => rank[a.level] - rank[b.level]).map(tile)}</div>}
    </>}
  </section>
}
