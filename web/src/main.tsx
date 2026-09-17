import '../../src/renderer/styles.css'
import './style.css'
import { lockedWebNavKeys, webNavKeys, type WebNavKey } from '../../shared/webNavigation'
import { useBookingTabs } from './useBookingTabs'
import DraftReview from './DraftReview'
import EntryAttachments from './EntryAttachments'
import OrganizationSwitcher from './OrganizationSwitcher'
import { setActiveOrganization } from './api'
import DesktopAI from './DesktopAI'
import { setBookingAIPatternScope } from '../../src/renderer/utils/bookingAiPatterns'
import { loadWebPreferences, loadWebTable, loadWebWorkflow, type WebPreferences, type WebTableSettings, type WebWorkflowSettings } from './settingsApi'
import DesktopBankImport from './DesktopBankImport'
import DesktopReceipts from './DesktopReceipts'
import DesktopRecurring from './DesktopRecurring'
import DesktopSettings from './DesktopSettings'
import React, { useCallback, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { api, ApiError, Entry, money, Role, roleNames, User } from './api'
import { TopNav } from '../../src/renderer/components/layout/TopNav'
import { SideNav } from '../../src/renderer/components/layout/SideNav'
import type { NavItem, NavKey } from '../../src/renderer/utils/navItems'
import { DesktopBudgets, DesktopEarmarks } from './PlanningModules'
import DesktopOverview from './DesktopOverview'
import DesktopMembers from './DesktopMembers'
import DesktopBookings from './DesktopBookings'
import BookingEditor from './BookingEditor'
import { ToastProvider } from '../../src/renderer/context/ToastContext'
import { useToast } from '../../src/renderer/context/useToast'
const appLogo = new URL('../../build/Icon.ico', import.meta.url).href

const states: Record<string, string> = {
  DRAFT: 'Entwurf',
  SUBMITTED: 'Zur Prüfung',
  RETURNED: 'Zur Korrektur',
  APPROVED: 'Übernommen'
}
const spheres = {
  IDEELL: 'Ideeller Bereich',
  ZWECK: 'Zweckbetrieb',
  VERMOEGEN: 'Vermögensverwaltung',
  WGB: 'Wirtschaftlicher Geschäftsbetrieb'
}
type Tab =
  | 'ai'
  | 'drafts'
  | 'bookings'
  | 'users'
  | 'account'
  | 'dashboard'
  | 'reports'
  | 'members'
  | 'budgets'
  | 'earmarks'
  | 'receipts'
  | 'bankimport'
  | 'recurring'
  | 'settings'
const pageTabs: Partial<Record<NavKey, Tab>> = {
  KI: 'ai',
  Dashboard: 'dashboard',
  Buchungen: 'bookings',
  Mitglieder: 'members',
  Budgets: 'budgets',
  Zweckbindungen: 'earmarks',
  Reports: 'reports',
  Einreichungen: 'drafts',
  Einstellungen: 'settings',
  Belege: 'receipts',
  Dauerbuchungen: 'recurring',
  Bankimport: 'bankimport'
}
function App() {
  const { notify } = useToast()
  const [user, setUser] = useState<User | null>(null),
    [setup, setSetup] = useState(false),
    [ready, setReady] = useState(false)
  const handleSessionExpired = useCallback(() => { setActiveOrganization(); setUser(null) }, [])
  const [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false)
  const [tab, setTab] = useState<Tab>('drafts'),
    [entries, setEntries] = useState<Entry[]>([]),
    [users, setUsers] = useState<User[]>([]),
    [draftSearch, setDraftSearch] = useState(''),
    [draftSort, setDraftSort] = useState<'date-desc' | 'date-asc' | 'amount-desc' | 'amount-asc'>('date-desc')
  const [visibleModules, setVisibleModules] = useState<readonly WebNavKey[]>(webNavKeys)
  useEffect(() => {
    setVisibleModules(webNavKeys)
    if (!user) return
    let active = true
    const apply = (keys: WebNavKey[]) => {
      if (!active) return
      const visible = [...new Set([...keys, ...lockedWebNavKeys])]
      setVisibleModules(visible)
      setTab(current => {
        const key = Object.entries(pageTabs).find(([, value]) => value === current)?.[0]
        return key && !visible.includes(key as WebNavKey) ? (user.role === 'USER' ? 'drafts' : 'bookings') : current
      })
    }
    const load = () => void api<{ visibleNavItems: WebNavKey[] }>('/settings/modules').then(result => apply(result.visibleNavItems || [...webNavKeys])).catch(cause => {
      if (active && cause instanceof ApiError && cause.status === 401) handleSessionExpired()
    })
    const changed = (event: Event) => {
      const value = (event as CustomEvent).detail
      if (value.organizationId === user.organizationId) apply(value.visibleNavItems)
    }
    load()
    window.addEventListener('focus', load)
    window.addEventListener('vereino-modules-changed', changed)
    return () => { active = false; window.removeEventListener('focus', load); window.removeEventListener('vereino-modules-changed', changed) }
  }, [user?.id, user?.organizationId, handleSessionExpired])
  const [organizationProfile, setOrganizationProfile] = useState<'GENERAL' | 'NONPROFIT' | null>(null)
  useEffect(() => {
    setOrganizationProfile(null)
    if (!user) return
    let active = true
    const load = () => void api<{ profile: 'GENERAL' | 'NONPROFIT' }>('/settings/profile')
      .then(result => {
        if (!active) return
        setOrganizationProfile(result.profile)
        if (result.profile === 'GENERAL') setTab(current => current === 'members' ? 'bookings' : current)
      }).catch(error => {
        if (!active) return
        if (error instanceof ApiError && error.status === 401) handleSessionExpired()
        else setError('Organisationsprofil konnte nicht geladen werden.')
      })
    load()
    window.addEventListener('web-profile-changed', load)
    return () => { active = false; window.removeEventListener('web-profile-changed', load) }
  }, [user?.id, handleSessionExpired])
  const [bookingJump, setBookingJump] = useState<{
    filters: React.ComponentProps<typeof DesktopBookings>['externalFilters']
    revision: number
  }>({ filters: {}, revision: 0 })
  const goToBookings = useCallback(
    (filters: React.ComponentProps<typeof DesktopBookings>['externalFilters'] = {}) => {
      setBookingJump((previous) => ({ filters, revision: previous.revision + 1 }))
      setTab('bookings')
    },
    []
  )
  const [draftAttachments, setDraftAttachments] = useState<Entry | null>(null)
  const [edit, setEdit] = useState<Entry | 'new' | null>(null),
    [review, setReview] = useState<Entry | null>(null),
    [reset, setReset] = useState<User | null>(null)
  const [navLayout, setNavLayout] = useState(
    () => localStorage.getItem('vereino-web-nav') || 'side'
  )
  const [compactHeader, setCompactHeader] = useState(
    () => window.matchMedia('(max-width: 1100px)').matches
  )
  useEffect(() => {
    const media = window.matchMedia('(max-width: 1100px)')
    const update = () => setCompactHeader(media.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  const isTopNav = navLayout === 'top' && !compactHeader
  const [dark, setDark] = useState(() => localStorage.getItem('vereino-theme') !== 'light')
  const [preferences, setPreferences] = useState<WebPreferences | null>(null)
  const [workflowSettings, setWorkflowSettings] = useState<WebWorkflowSettings | null>(null)
  const bookingWorkspace = useBookingTabs(user, workflowSettings)
  const [tableSettings, setTableSettings] = useState<WebTableSettings | null>(null)
  const applyPreferences = useCallback((next: WebPreferences) => {
    setPreferences(next)
    setDark(next.themeMode === 'dark')
    setNavLayout(next.navLayout === 'left' ? 'side' : 'top')
    document.documentElement.dataset.colorTheme = next.colorTheme
  }, [])
  useEffect(() => {
    let active = true
    setPreferences(null)
    if (!user) return
    loadWebPreferences()
      .then((next) => {
        if (active) applyPreferences(next)
      })
      .catch((cause) => {
        if (!active) return
        if (cause instanceof ApiError && cause.status === 401) handleSessionExpired()
        else
          setError(
            cause instanceof Error ? cause.message : 'Einstellungen konnten nicht geladen werden.'
          )
      })
    return () => {
      active = false
    }
  }, [user?.id, applyPreferences, handleSessionExpired])
  useEffect(() => {
    if (!user) { setWorkflowSettings(null); setTableSettings(null); return }
    let active = true
    Promise.all([loadWebWorkflow(), loadWebTable()]).then(([workflow, table]) => {
      if (active) { setWorkflowSettings(workflow); setTableSettings(table) }
    }).catch((cause) => { if (cause instanceof ApiError && cause.status === 401) handleSessionExpired() })
    const workflowChanged = (event: Event) => setWorkflowSettings((event as CustomEvent<WebWorkflowSettings>).detail)
    const tableChanged = (event: Event) => setTableSettings((event as CustomEvent<WebTableSettings>).detail)
    window.addEventListener('vereino-workflow-changed', workflowChanged)
    window.addEventListener('vereino-table-changed', tableChanged)
    return () => { active = false; window.removeEventListener('vereino-workflow-changed', workflowChanged); window.removeEventListener('vereino-table-changed', tableChanged) }
  }, [user?.id, handleSessionExpired])
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
    localStorage.setItem('vereino-theme', dark ? 'dark' : 'light')
  }, [dark])
  useEffect(() => {
    ;(async () => {
      try {
        const status = await api<{ setupRequired: boolean }>('/auth/status')
        setSetup(status.setupRequired)
        if (!status.setupRequired) {
          try {
            const current = (await api<{ user: User }>('/auth/me')).user
            setActiveOrganization(current.organizationId)
            setBookingAIPatternScope(`web:${current.organizationId}:${current.id}`)
            setUser(current)
            setTab(current.role === 'USER' ? 'drafts' : 'bookings')
          } catch (e) {
            if (!(e instanceof ApiError && e.status === 401)) throw e
          }
        }
      } catch (e) {
        setError(String((e as Error).message))
      } finally {
        setReady(true)
      }
    })()
  }, [])
  async function refresh() {
    if (!user || (tab !== 'drafts' && tab !== 'users')) return
    setLoading(true)
    try {
      if (tab === 'users') setUsers((await api<{ users: User[] }>('/users')).users)
      else setEntries((await api<Record<string, Entry[]>>(`/${tab}`))[tab])
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    setEntries([])
    setEdit(null)
    setReview(null)
    setDraftAttachments(null)
    setDraftSearch('')
    setDraftSort('date-desc')
    setError('')
    refresh().catch(handleError)
  }, [user, tab])
  function handleError(e: unknown) {
    setError(e instanceof Error ? e.message : 'Ein Fehler ist aufgetreten.')
    if (e instanceof ApiError && e.status === 401) setUser(null)
  }
  async function action(work: () => Promise<void>, message = '', toastSuccess = false) {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await work()
      if (message) {
        if (toastSuccess) notify('success', message)
        else setNotice(message)
      }
    } catch (e) {
      handleError(e)
      if (e instanceof ApiError && e.status === 409) {
        setEdit(null)
        setReview(null)
        await refresh().catch(handleError)
      }
    } finally {
      setBusy(false)
    }
  }
  async function login(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = Object.fromEntries(new FormData(event.currentTarget))
    await action(async () => {
      const result = await api<{ user: User }>(setup ? '/auth/setup' : '/auth/login', 'POST', data)
      setSetup(false)
      setActiveOrganization(result.user.organizationId)
      setBookingAIPatternScope(`web:${result.user.organizationId}:${result.user.id}`)
      setUser(result.user)
      setTab(result.user.role === 'USER' ? 'drafts' : 'bookings')
    })
  }
  const reviewer = user?.role === 'ADMIN' || user?.role === 'EDITOR'
  const visibleDrafts = entries
    .filter((entry) => {
      const query = draftSearch.trim().toLocaleLowerCase('de-DE')
      if (!query) return true
      return [entry.description, entry.counterparty || '', entry.createdByEmail || '', ...(entry.tags || [])]
        .join(' ')
        .toLocaleLowerCase('de-DE')
        .includes(query)
    })
    .slice()
    .sort((left, right) => {
      if (draftSort === 'amount-desc' || draftSort === 'amount-asc') {
        const delta = left.grossAmountCents - right.grossAmountCents
        return draftSort === 'amount-desc' ? -delta : delta
      }
      const delta = left.date.localeCompare(right.date) || left.id - right.id
      return draftSort === 'date-desc' ? -delta : delta
    })
  const navItems: NavItem[] = [
    ...(reviewer
      ? [
          { key: 'Dashboard' as const, label: 'Dashboard', group: 'overview' as const },
          { key: 'Buchungen' as const, label: 'Buchungen', group: 'transactions' as const },
          {
            key: 'Dauerbuchungen' as const,
            label: 'Dauerbuchungen',
            group: 'transactions' as const
          },
          { key: 'Bankimport' as const, label: 'Bankimport', group: 'transactions' as const },
          { key: 'Belege' as const, label: 'Belege', group: 'documents' as const },
          ...(organizationProfile === 'NONPROFIT' ? [{ key: 'Mitglieder' as const, label: 'Mitglieder', group: 'organization' as const }] : []),
          { key: 'Budgets' as const, label: 'Budgets', group: 'organization' as const },
          {
            key: 'Zweckbindungen' as const,
            label: 'Zweckbindungen',
            group: 'organization' as const
          },
          { key: 'Reports' as const, label: 'Berichte', group: 'documents' as const }
        ]
      : []),
    { key: 'KI', label: 'KI', group: 'documents' },
    { key: 'Einreichungen', label: 'Entwürfe', group: 'organization' },
    { key: 'Einstellungen', label: 'Einstellungen', group: 'system' }
  ]
  const navigationProps = {
    activePage: (Object.entries(pageTabs).find(([, value]) => value === tab)?.[0] ||
      'Einstellungen') as NavKey,
    onNavigate: (page: NavKey) => {
      if (page === 'Buchungen') goToBookings()
      else setTab(pageTabs[page] || 'account')
      setNotice('')
    },
    navIconColorMode: preferences?.navIconColorMode || 'color',
    items: navItems.filter(item => visibleModules.includes(item.key as WebNavKey)),
    pendingSubmissionsCount: entries.filter((entry) => entry.status === 'SUBMITTED').length
  }
  if (!ready)
    return (
      <main className="web-auth">
        <p role="status">VereinO wird geladen …</p>
      </main>
    )
  return (
    <div
      className={`web-app app-root-grid ${user && !isTopNav ? 'app-root-grid--side' : 'app-root-grid--top'}`}
    >
      <header
        className={`app-header ${isTopNav ? 'app-header-top' : 'app-header-left'} web-header`}
      >
        <div className="app-header__left inline-flex items-center gap-8">
          <img src={appLogo} alt="" width={20} height={20} style={{ borderRadius: 4 }} />
          {user ? <OrganizationSwitcher user={user} onSessionExpired={handleSessionExpired} /> : <strong>VereinO</strong>}
        </div>
        {user && isTopNav && (
          <div className="app-header__nav no-drag">
            <TopNav {...navigationProps} />
          </div>
        )}
        <div className="app-header__controls no-drag">
          {user && (
            <button
              className="btn ghost web-identity"
              onClick={() => setTab('account')}
              title={user.email}
            >
              {user.email} · {roleNames[user.role]}
            </button>
          )}

          {user && (
            <button
              className="btn ghost"
              disabled={busy}
              onClick={() =>
                action(async () => {
                  await api('/auth/logout', 'POST')
                  setUser(null)
                  setTab('drafts')
                })
              }
            >
              Abmelden
            </button>
          )}
        </div>
      </header>
      {!user ? (
        <main className="web-auth">
          <h1>{setup ? 'Willkommen bei VereinO.' : 'Bei VereinO anmelden'}</h1>
          <p className="muted">
            {setup
              ? 'Erstelle deine erste Organisation und das zugehörige Admin-Konto.'
              : 'Melde dich an, um Buchungen und Entwürfe im Team zu bearbeiten.'}
          </p>
          {error && (
            <div className="alert error" role="alert">
              {error}
            </div>
          )}
          {notice && (
            <div className="alert success" role="status">
              {notice}
            </div>
          )}
          <form onSubmit={login} className="card auth-form">
            {setup && (
              <>
                <label>
                  Name der Organisation
                  <input className="input" name="organizationName" required maxLength={200} />
                </label>
                <label>
                  Verwaltungsart
                  <select className="input" name="profile" defaultValue="NONPROFIT">
                    <option value="NONPROFIT">Vereinsverwaltung</option>
                    <option value="GENERAL">Allgemeine Budgetverwaltung</option>
                  </select>
                  <small>Die Organisationsart wird dauerhaft festgelegt. Weitere Organisationen kann später ein Admin erstellen.</small>
                </label>
                <label>
                  Einrichtungsschlüssel
                  <input
                    className="input"
                    name="setupToken"
                    type="password"
                    autoComplete="off"
                    required
                  />
                  <small>Aus der Serverkonfiguration deiner Installation.</small>
                </label>
              </>
            )}
            <label>
              E-Mail
              <input className="input" name="email" type="email" autoComplete="username" required />
            </label>
            <label>
              Passwort
              <input
                className="input"
                name="password"
                type="password"
                autoComplete={setup ? 'new-password' : 'current-password'}
                minLength={setup ? 12 : undefined}
                required
              />
              {setup && <small>Mindestens 12 Zeichen.</small>}
            </label>
            <button className="btn primary" disabled={busy}>
              {busy ? 'Bitte warten …' : setup ? 'Organisation einrichten' : 'Anmelden'}
            </button>
          </form>
        </main>
      ) : (
        <>
          {!isTopNav && (
            <aside className="app-sidebar">
              <SideNav {...navigationProps} collapsed />
            </aside>
          )}
          <main
            className={`app-main ${tab === 'bookings' ? 'app-main--bookings-plus' : 'web-content'}`}
          >
            {(tab === 'dashboard' || tab === 'reports') && reviewer && (
              <DesktopOverview
                user={user}
                page={tab}
                onGoToBookings={goToBookings}
                onSessionExpired={handleSessionExpired}
              />
            )}
            {tab === 'budgets' && reviewer && (
              <DesktopBudgets
                user={user}
                onSessionExpired={handleSessionExpired}
                onGoToBookings={(id) => goToBookings({ budget: String(id) })}
              />
            )}
            {tab === 'earmarks' && reviewer && (
              <DesktopEarmarks
                user={user}
                onSessionExpired={handleSessionExpired}
                onGoToBookings={(id) => goToBookings({ earmark: String(id) })}
              />
            )}
            {tab === 'receipts' && reviewer && (
              <DesktopReceipts
                user={user}
                onSessionExpired={handleSessionExpired}
                onGoToBooking={(id) => goToBookings({ q: `#${id}` })}
              />
            )}
            {tab === 'recurring' && reviewer && (
              <DesktopRecurring
                user={user}
                onSessionExpired={handleSessionExpired}
                notify={(type, message) =>
                  type === 'error' ? setError(message) : setNotice(message)
                }
              />
            )}
            {tab === 'bankimport' && reviewer && <DesktopBankImport user={user} onSessionExpired={handleSessionExpired} notify={(type, message) => type === 'error' ? setError(message) : setNotice(message)} onOpenVoucher={id => goToBookings({ q: `#${id}` })} />}
            {tab === 'members' && reviewer && organizationProfile === 'NONPROFIT' && (
              <DesktopMembers user={user} onSessionExpired={handleSessionExpired} />
            )}
            {tab === 'ai' && <DesktopAI onCapture={reviewer && bookingWorkspace.newTabsEnabled ? (fields,id,warnings)=>{bookingWorkspace.capture(fields,id,warnings);setTab('bookings')} : undefined} user={user} key={user.id} onSessionExpired={handleSessionExpired} />}
            {tab === 'bookings' && (
              <DesktopBookings
                workspace={bookingWorkspace}
                onOpenAI={() => setTab('ai')}
                externalFilters={bookingJump.filters}
                jumpRevision={bookingJump.revision}
                bookingView={workflowSettings?.bookingView || 'plus'}
                tableSettings={tableSettings}
                user={user}
                onSessionExpired={handleSessionExpired}
                onError={setError}
              />
            )}
            {tab === 'drafts' && (
              <div className="page-heading">
                <div>
                  <h1>
                    {
                      {
                        drafts: 'Buchungsentwürfe',
                        bookings: 'Buchungen',
                        users: 'Benutzerverwaltung',
                        account: 'Mein Konto'
                      }[tab]
                    }
                  </h1>
                  <p className="muted">
                    {
                      {
                        drafts: reviewer
                          ? 'Einträge erfassen, prüfen und gemeinsam freigeben.'
                          : 'Eigene Einträge vorbereiten und zur Prüfung einreichen.',
                        bookings: 'Alle freigegebenen Buchungen deines Vereins.',
                        users: 'Zugänge und Berechtigungen für dein Team.',
                        account: 'Verwalte dein persönliches Passwort.'
                      }[tab]
                    }
                  </p>
                </div>
                {tab === 'drafts' && (
                  <button className="btn primary" disabled={busy} onClick={() => setEdit('new')}>
                    ＋ Entwurf erstellen
                  </button>
                )}
              </div>
            )}
            {(tab === 'settings' || tab === 'account' || tab === 'users') && (
              <DesktopSettings
                organizationProfile={organizationProfile || 'NONPROFIT'}
                user={user}
                section={tab}
                onSectionChange={setTab}
                onSessionExpired={handleSessionExpired}
                onPreferencesChanged={applyPreferences}
                onOrganizationChanged={(name) =>
                  setUser((current) => (current ? { ...current, organizationName: name } : current))
                }
                feedback={
                  <>
                    {error && (
                      <div className="alert error" role="alert">
                        {error}
                      </div>
                    )}
                    {notice && (
                      <div className="alert success" role="status">
                        {notice}
                      </div>
                    )}
                  </>
                }
                accountContent={
                  <form
                    className="card settings-card settings-pane-card compact"
                    onSubmit={(e) => {
                      e.preventDefault()
                      const form = e.currentTarget
                      const data = Object.fromEntries(new FormData(form))
                      action(async () => {
                        await api('/auth/password', 'POST', data)
                        form.reset()
                        setUser(null)
                        setTab('drafts')
                      }, 'Passwort geändert. Bitte melde dich erneut an.')
                    }}
                  >
                    <h2 className="settings-title">Passwort ändern</h2>
                    <label>
                      Aktuelles Passwort
                      <input
                        className="input"
                        type="password"
                        name="currentPassword"
                        autoComplete="current-password"
                        required
                      />
                    </label>
                    <label>
                      Neues Passwort
                      <input
                        className="input"
                        type="password"
                        name="newPassword"
                        aria-label="Neues Passwort"
                        autoComplete="new-password"
                        minLength={12}
                        required
                      />
                      <small>Mindestens 12 Zeichen.</small>
                    </label>
                    <button disabled={busy} className="btn primary">
                      Passwort speichern
                    </button>
                  </form>
                }
                usersContent={
                  <>
                    <form
                      className="card settings-card settings-pane-card user-form"
                      onSubmit={(e) => {
                        e.preventDefault()
                        const form = e.currentTarget
                        const data = Object.fromEntries(new FormData(form))
                        action(async () => {
                          await api('/users', 'POST', data)
                          form.reset()
                          await refresh()
                        }, 'Benutzer angelegt.')
                      }}
                    >
                      <h2 className="settings-title">Benutzer hinzufügen</h2>
                      <label>
                        E-Mail
                        <input
                          className="input"
                          name="email"
                          type="email"
                          required
                          autoComplete="off"
                        />
                      </label>
                      <label>
                        Startpasswort
                        <input
                          className="input"
                          name="password"
                          type="password"
                          minLength={12}
                          required
                          autoComplete="new-password"
                        />
                      </label>
                      <label>
                        Rolle
                        <select className="input" name="role" defaultValue="USER">
                          {Object.entries(roleNames).map(([v, l]) => (
                            <option key={v} value={v}>
                              {l}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button className="btn primary" disabled={busy}>
                        Benutzer anlegen
                      </button>
                      <p className="muted role-help">
                        Admin: Verwaltung und Änderungen · Editor: Buchungen erstellen und Entwürfe
                        freigeben · User: eigene Entwürfe
                      </p>
                    </form>
                    <div className="card table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>E-Mail</th>
                            <th>Rolle</th>
                            <th>Status</th>
                            <th>Aktionen</th>
                          </tr>
                        </thead>
                        <tbody>
                          {users.map((u) => (
                            <tr key={u.id}>
                              <td>
                                {u.email}
                                {u.id === user.id && <small> (du)</small>}
                              </td>
                              <td>
                                <select
                                  className="input"
                                  aria-label={`Rolle von ${u.email}`}
                                  value={u.role}
                                  disabled={busy || u.id === user.id}
                                  onChange={(e) => {
                                    const role = e.target.value as Role
                                    action(async () => {
                                      await api(`/users/${u.id}`, 'PATCH', { role })
                                      await refresh()
                                    }, 'Rolle aktualisiert.')
                                  }}
                                >
                                  {Object.entries(roleNames).map(([v, l]) => (
                                    <option key={v} value={v}>
                                      {l}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td>
                                <span className="badge">
                                  {u.isActive === false ? 'Gesperrt' : 'Aktiv'}
                                </span>
                              </td>
                              <td>
                                <div className="row-actions">
                                  <button
                                    className="btn"
                                    disabled={busy || u.id === user.id}
                                    onClick={() =>
                                      action(async () => {
                                        await api(`/users/${u.id}`, 'PATCH', {
                                          isActive: u.isActive === false
                                        })
                                        await refresh()
                                      }, 'Benutzerstatus aktualisiert.')
                                    }
                                  >
                                    {u.isActive === false ? 'Aktivieren' : 'Sperren'}
                                  </button>
                                  <button
                                    className="btn"
                                    disabled={busy}
                                    onClick={() => setReset(u)}
                                  >
                                    Passwort setzen
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                }
              />
            )}
            {!['settings', 'account', 'users'].includes(tab) && error && (
              <div className="alert error" role="alert">
                {error}
              </div>
            )}
            {!['settings', 'account', 'users'].includes(tab) && notice && (
              <div className="alert success" role="status">
                {notice}
              </div>
            )}
            {tab === 'drafts' && (
              <>
                <div className="draft-list-toolbar">
                  <span className="draft-list-count">{visibleDrafts.length} von {entries.length} Einträgen</span>
                  <label className="draft-search">
                    <span className="sr-only">Entwürfe durchsuchen</span>
                    <input className="input" value={draftSearch} onChange={(event) => setDraftSearch(event.target.value)} placeholder="Entwürfe durchsuchen …" />
                  </label>
                  <label className="draft-sort">
                    <span className="sr-only">Entwürfe sortieren</span>
                    <select className="input" value={draftSort} onChange={(event) => setDraftSort(event.target.value as typeof draftSort)}>
                      <option value="date-desc">Neueste zuerst</option>
                      <option value="date-asc">Älteste zuerst</option>
                      <option value="amount-desc">Betrag absteigend</option>
                      <option value="amount-asc">Betrag aufsteigend</option>
                    </select>
                  </label>
                </div>
                {loading ? (
                  <div className="empty" role="status">
                    Einträge werden geladen …
                  </div>
                ) : entries.length === 0 || visibleDrafts.length === 0 ? (
                  <div className="card empty">
                    <span className="empty-symbol">▤</span>
                    <h2>{entries.length === 0 ? 'Noch keine Entwürfe' : 'Keine Treffer'}</h2>
                    <p className="muted">{entries.length === 0 ? 'Erstelle den ersten Eintrag über die Schaltfläche oben.' : 'Passe den Suchbegriff an.'}</p>
                  </div>
                ) : (
                  <div className="entry-list draft-entry-list">
                    {visibleDrafts.map((entry) => (
                      <article className="card entry" key={entry.id}>
                        <div className={`direction ${entry.type}`}>
                          {entry.type === 'IN' ? '↙' : '↗'}
                        </div>
                        <div className="entry-main">
                          <div className="entry-title">
                            <h2>{entry.description}</h2>
                            {entry.status && (
                              <span className={`badge ${entry.status}`}>
                                {states[entry.status]}
                              </span>
                            )}
                          </div>
                          <p className="muted">
                            {new Date(entry.date.slice(0, 10) + 'T12:00:00').toLocaleDateString(
                              'de-DE'
                            )}{' '}
                            · {spheres[entry.sphere]} ·{' '}
                            {entry.paymentMethod === 'BANK' ? 'Bank' : 'Kasse'}
                            {entry.number ? ` · Nr. ${entry.number}` : ''}
                          </p>
                          {entry.counterparty && <p>{entry.counterparty}</p>}
                          {(entry.budgets?.length || entry.earmarksAssigned?.length || entry.tags?.length) ? (
                            <div className="entry-meta-chips">
                              {entry.budgets?.map(item => <span className="chip" key={`budget-${item.budgetId}`}>Budget · {item.label || `#${item.budgetId}`}</span>)}
                              {entry.earmarksAssigned?.map(item => <span className="chip" key={`earmark-${item.earmarkId}`}>Zweckbindung · {item.code || item.name || `#${item.earmarkId}`}</span>)}
                              {entry.tags?.map(tag => <span className="chip" key={`tag-${tag}`}>{tag}</span>)}
                            </div>
                          ) : null}
                          {entry.createdByEmail && (
                            <small>Erfasst von {entry.createdByEmail}</small>
                          )}
                          {entry.reviewReason && (
                            <p className="review-reason">Rückmeldung: {entry.reviewReason}</p>
                          )}
                          {entry.status === 'SUBMITTED' && !reviewer && (
                            <p className="muted">Zur Prüfung eingereicht – Freigabe durch Admin oder Editor ausstehend.</p>
                          )}
                        </div>
                        <div className="entry-end">
                          <strong className={`amount ${entry.type}`}>
                            {entry.type === 'OUT' ? '−' : '+'}
                            {money(entry.grossAmountCents)}
                          </strong>
                          <div className="row-actions">
                            <button className="btn" onClick={() => setDraftAttachments(entry)}>Anhänge{entry.fileCount ? ` (${entry.fileCount})` : ''}</button>
                            {tab === 'drafts' && (reviewer ? ['DRAFT','RETURNED','SUBMITTED'].includes(entry.status || '') : entry.createdBy === user.id && ['DRAFT','RETURNED'].includes(entry.status || '')) && <button className="btn" disabled={busy} onClick={() => setEdit(entry)}>Bearbeiten</button>}
                            {tab === 'drafts' &&
                              entry.createdBy === user.id &&
                              ['DRAFT', 'RETURNED'].includes(entry.status || '') && (
                                <>
                                  <button
                                    className="btn primary"
                                    disabled={busy}
                                    onClick={() =>
                                      action(async () => {
                                        await api(`/drafts/${entry.id}/submit`, 'POST', {
                                          version: entry.version
                                        })
                                        await refresh()
                                      }, 'Entwurf zur Prüfung eingereicht.', true)
                                    }
                                  >
                                    Einreichen
                                  </button>
                                </>
                              )}
                            {tab === 'drafts' && reviewer && ['DRAFT', 'RETURNED', 'SUBMITTED'].includes(entry.status || '') && (
                              <button
                                className="btn primary"
                                disabled={busy}
                                title="Entwurf prüfen und freigeben"
                                onClick={() => setReview(entry)}
                              >
                                Prüfen
                              </button>
                            )}
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </>
            )}
          </main>
        </>
      )}
      {draftAttachments && <EntryAttachments entry={draftAttachments} kind="drafts" onSessionExpired={handleSessionExpired} onClose={() => setDraftAttachments(null)} onChanged={() => { void refresh().catch(handleError) }} />}
      {edit && user && (
        <BookingEditor
          mode="drafts"
          onAttachmentsChanged={() => { void refresh().catch(handleError) }}
          entry={edit === 'new' ? undefined : edit}
          user={user}
          onClose={() => setEdit(null)}
          onSessionExpired={handleSessionExpired}
          onSaved={saved => {
            setEdit(null)
            if (saved?.status === 'SUBMITTED' && reviewer) setReview(saved)
            setNotice('')
            notify('success', saved?.status === 'SUBMITTED' ? 'Entwurf aktualisiert.' : 'Entwurf gespeichert.')
            void refresh().catch(handleError)
          }}
        />
      )}
      {review && <DraftReview onAttachmentsChanged={() => { void refresh().catch(handleError) }} onEdit={() => {setEdit(review);setReview(null)}} entry={review} busy={busy} error={error} onClose={() => setReview(null)} onSessionExpired={() => setUser(null)}
        onApprove={() => action(async () => {
          await api(`/drafts/${review.id}/approve`, 'POST', {version:review.version})
          setReview(null);await refresh()
        }, 'Entwurf freigegeben und als Buchung übernommen.', true)}
        onReturn={reason => action(async () => {
          await api(`/drafts/${review.id}/return`, 'POST', {version:review.version,reason})
          setReview(null);await refresh()
        }, 'Entwurf zur Korrektur zurückgegeben.', true)} />}
      {reset && (
        <Modal title="Passwort neu setzen" close={() => setReset(null)} busy={busy}>
          <p>{reset.email}</p>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              const password = new FormData(e.currentTarget).get('password')
              action(async () => {
                await api(`/users/${reset.id}/password`, 'POST', { password })
                if (reset.id === user?.id) {
                  setUser(null)
                  setTab('drafts')
                }
                setReset(null)
              }, 'Passwort neu gesetzt. Bitte sicher an den Benutzer weitergeben.')
            }}
          >
            <label>
              Neues Passwort
              <input
                className="input"
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={12}
                required
              />
            </label>
            <button className="btn primary" disabled={busy}>
              Passwort setzen
            </button>
          </form>
          {error && (
            <p className="alert error" role="alert">
              {error}
            </p>
          )}
        </Modal>
      )}
    </div>
  )
}
function Modal({
  title,
  close,
  busy,
  children
}: {
  title: string
  close: () => void
  busy: boolean
  children: React.ReactNode
}) {
  const ref = React.useRef<HTMLDialogElement>(null)
  useEffect(() => {
    ref.current?.showModal()
    return () => ref.current?.close()
  }, [])
  return (
    <dialog
      className="modal web-dialog"
      ref={ref}
      aria-labelledby="modal-title"
      onCancel={(e) => {
        e.preventDefault()
        if (!busy) close()
      }}
    >
      <div className="modal-header modal-heading">
        <h2 id="modal-title">{title}</h2>
        <button
          className="btn ghost icon-btn"
          aria-label="Schließen"
          disabled={busy}
          onClick={close}
        >
          ✕
        </button>
      </div>
      <div className="modal-body">{children}</div>
    </dialog>
  )
}
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ToastProvider>
      <App />
    </ToastProvider>
  </React.StrictMode>
)
