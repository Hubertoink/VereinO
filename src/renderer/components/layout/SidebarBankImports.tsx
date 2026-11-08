import React, { useEffect, useState } from 'react'
import { bankImportReminder, bankReminderDays } from '../../../../shared/bankImportReminder'
import { addDataChangedListener } from '../../utils/refresh'

type Account = { id: number; name: string; color?: string | null; lastImportAt?: string | null; reminderDays: number }
export function SidebarBankImports({ onSelect }: { onSelect: (id: number) => void }) {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [failed, setFailed] = useState(false)
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    let disposed = false
    let request = 0
    const load = async () => {
      const current = ++request
      setFailed(false)
      try {
        const [status, available] = await Promise.all([window.api.bankTransactions.importStatus(), window.api.paymentAccounts.list({ activeOnly: true })])
        if (disposed || current !== request) return
        const rows = await Promise.all(available.rows.filter(account => account.kind !== 'CASH' && account.isActive !== 0).map(async account => {
          const setting = await window.api.settings.get({ key: `dashboard.bankReminderDays.${account.id}` })
          return { ...account, lastImportAt: status.accounts.find(row => row.id === account.id)?.lastImportAt ?? null, reminderDays: bankReminderDays(setting.value) }
        }))
        if (!disposed && current === request) { setAccounts(rows); setNow(new Date()) }
      } catch { if (!disposed && current === request) { setAccounts([]); setFailed(true) } }
    }
    const offChange = addDataChangedListener(['bank-imports', 'settings', 'organizations'], () => { void load() })
    const offSwitch = window.api.organizations.onSwitched(() => { setAccounts([]); void load() })
    window.addEventListener('focus', load)
    let timer: ReturnType<typeof setTimeout>
    const midnight = () => {
      const today = new Date()
      timer = setTimeout(() => { setNow(new Date()); midnight() }, new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).getTime() - today.getTime() + 100)
    }
    midnight(); void load()
    return () => { disposed = true; offChange(); offSwitch?.(); window.removeEventListener('focus', load); clearTimeout(timer) }
  }, [])
  if (failed) return <p className="sidebar-bank-import-error">Importstand nicht verfügbar.</p>
  if (!accounts.length) return null
  return <div className="sidebar-recent-assignments sidebar-bank-imports" role="group" aria-label="Letzte Bankimporte">
    {accounts.map(account => {
      const reminder = bankImportReminder(account.lastImportAt, account.reminderDays, now)
      const date = reminder.imported?.toLocaleDateString('de-DE')
      return <button key={account.id} type="button" className="sidebar-recent-assignment" onClick={() => onSelect(account.id)} title={`${account.name} · ${date ? `Letzter Import mit neuen Umsätzen: ${date}` : 'Noch kein Import mit neuen Umsätzen'} · ${reminder.label}${reminder.days ? ` · Intervall: ${reminder.days} Tage` : ''}`}>
        <span className="sidebar-assignment-name"><span className="sidebar-account-dot" style={{ backgroundColor: account.color || 'var(--text-dim)' }} />{account.name}</span>
        <span className="sidebar-bank-import-meta">
          <span className="sidebar-bank-import-date">{date ? `Import: ${date}` : 'Noch kein Import'}</span>
          <span className={`sidebar-bank-import-state sidebar-bank-import-state--${reminder.status}`}><span aria-hidden="true">●</span> {reminder.label}</span>
        </span>
      </button>
    })}
  </div>
}
