import ModulesControl from './settings/ModulesControl'
import AiSettingsPane from './settings/AiSettingsPane'
import React, { useEffect, useRef, useState } from 'react'
import { IconBuilding, IconPalette } from '@tabler/icons-react'
import MasterDataPane from './settings/MasterDataPane'
import OrganizationDetails from './settings/OrganizationDetails'
import WorkflowPane from './settings/WorkflowPane'
import TablePane from './settings/TablePane'
import WebInfoPane from './settings/WebInfoPane'
import { SettingsNav } from '../../src/renderer/views/Settings/SettingsNav'
import {
  ThemePicker,
  NavigationControls
} from '../../src/renderer/views/Settings/components/AppearanceControls'
import type { TileKey } from '../../src/renderer/views/Settings/types'
import { api, ApiError, type User } from './api'
import {
  loadWebPreferences,
  saveWebPreferences,
  type WebPreferences,
  type WebOrganizationSettings
} from './settingsApi'

const personalTiles: TileKey[] = ['general', 'workflow', 'table', 'updates', 'tutorial', 'about', 'account']
const organizationTiles: TileKey[] = ['general', 'workflow', 'table', 'storage', 'docling', 'import', 'updates', 'org', 'paymentAccounts', 'categories', 'parties', 'tags', 'aiPatterns', 'account']
const adminTiles: TileKey[] = [...organizationTiles, 'cashCheck', 'yearEnd', 'donations', 'users']
const infoTiles: TileKey[] = ['storage', 'docling', 'import', 'updates', 'aiPatterns', 'cashCheck', 'yearEnd', 'donations', 'tutorial', 'about']
type Props = {
  organizationProfile?: 'GENERAL' | 'NONPROFIT'
  section?: 'settings' | 'account' | 'users'
  onSectionChange?: (section: 'settings' | 'account' | 'users') => void
  accountContent?: React.ReactNode
  usersContent?: React.ReactNode
  feedback?: React.ReactNode
  user: User
  onSessionExpired: () => void
  onPreferencesChanged: (preferences: WebPreferences) => void
  onOrganizationChanged: (name: string) => void
}
export default function DesktopSettings({
  organizationProfile = 'NONPROFIT',
  section = 'settings',
  onSectionChange,
  accountContent,
  usersContent,
  feedback,
  user,
  onSessionExpired,
  onPreferencesChanged,
  onOrganizationChanged
}: Props) {
  const callbacks = useRef({ onPreferencesChanged, onOrganizationChanged })
  callbacks.current = { onPreferencesChanged, onOrganizationChanged }
  const [tile, setTile] = useState<TileKey>('general')
  const [preferences, setPreferences] = useState<WebPreferences | null>(null)
  const [organization, setOrganization] = useState<WebOrganizationSettings | null>(null)
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [revision, setRevision] = useState(0)
  const [loading, setLoading] = useState(true)
  const canReadOrganization = user.role !== 'USER'
  useEffect(() => {
    setNotice('')
    setError('')
  }, [section, tile])
  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    Promise.all([
      loadWebPreferences(),
      canReadOrganization
        ? api<{ organization: WebOrganizationSettings }>('/settings/organization')
        : Promise.resolve(null)
    ])
      .then(([personal, result]) => {
        if (!active) return
        setPreferences(personal)
        callbacks.current.onPreferencesChanged(personal)
        if (result) callbacks.current.onOrganizationChanged(result.organization.name)
        setOrganization(result?.organization || null)
        setName(result?.organization.name || '')
      })
      .catch((cause) => {
        if (!active) return
        if (cause instanceof ApiError && cause.status === 401) onSessionExpired()
        setError(
          cause instanceof Error ? cause.message : 'Einstellungen konnten nicht geladen werden.'
        )
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [user.id, canReadOrganization, revision, onSessionExpired])
  const save = async (work: () => Promise<void>) => {
    if (busy) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await work()
      setNotice('Einstellungen gespeichert.')
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) onSessionExpired()
      setError(
        cause instanceof Error ? cause.message : 'Einstellungen konnten nicht gespeichert werden.'
      )
    } finally {
      setBusy(false)
    }
  }
  const updatePreference = <K extends keyof WebPreferences>(key: K, value: WebPreferences[K]) => {
    setPreferences((current) => {
      if (!current) return current
      const next = { ...current, [key]: value }
      // Preview supported appearance changes immediately; saving still persists them.
      if (key === 'themeMode' || key === 'colorTheme' || key === 'navLayout' || key === 'navIconColorMode')
        onPreferencesChanged(next)
      return next
    })
    setNotice('')
  }
  return (
    <div className="settings-container">
      <div className="settings-heading">
        <h1>Einstellungen</h1>
      </div>
      <SettingsNav
        active={section === 'settings' ? tile : section}
        onSelect={(next) => {
          if (next === 'account' || next === 'users') onSectionChange?.(next)
          else {
            setTile(next)
            onSectionChange?.('settings')
          }
        }}
        organizationProfile={organizationProfile}
        showSupplementaryCategories
        visibleTiles={
          (user.role === 'ADMIN'
            ? adminTiles
            : canReadOrganization
              ? organizationTiles
              : personalTiles).filter(key => organizationProfile === 'NONPROFIT' || key !== 'donations')
        }
        accountSections={user.role === 'ADMIN' ? 'admin' : 'personal'}
      />
      <div className="settings-content">
        {feedback}
        {error && (
          <div role="alert" className="card">
            <p>{error}</p>
            <button
              className="btn"
              disabled={busy}
              onClick={() => setRevision((value) => value + 1)}
            >
              Einstellungen neu laden
            </button>
          </div>
        )}
        {notice && (
          <p role="status" style={{ color: 'var(--success)' }}>
            {notice}
          </p>
        )}
        {section === 'account' ? (
          accountContent
        ) : section === 'users' && user.role === 'ADMIN' ? (
          usersContent
        ) : section === 'settings' && ['workflow', 'table'].includes(tile) ? (
          tile === 'workflow' ? <WorkflowPane user={user} onSessionExpired={onSessionExpired} /> : <TablePane user={user} onSessionExpired={onSessionExpired} />
        ) : section === 'settings' && infoTiles.includes(tile) ? (
          <><WebInfoPane tile={tile} user={user} />{tile === 'aiPatterns' && <AiSettingsPane readOnly={user.role !== 'ADMIN'} onSessionExpired={onSessionExpired} />}</>
        ) : section === 'settings' && canReadOrganization && ['paymentAccounts','categories','parties','tags'].includes(tile) ? (
          <MasterDataPane key={tile} kind={tile === 'paymentAccounts' ? 'accounts' : tile as 'categories' | 'parties' | 'tags'} user={user} onSessionExpired={onSessionExpired} />
        ) : loading ? (
          <p role="status">Einstellungen werden geladen …</p>
        ) : tile === 'general' && preferences ? (
          <form
            onSubmit={(event) => {
              event.preventDefault()
              void save(async () => {
                const saved = await saveWebPreferences(preferences)
                setPreferences(saved)
                onPreferencesChanged(saved)
              })
            }}
          >
            <fieldset
              disabled={busy}
              style={{ padding: 0, margin: 0, border: 0, minWidth: 0 }}
              className="settings-pane"
            >
              <div className="card settings-card settings-pane-card">
                <div className="settings-title">
                  <IconPalette size={18} aria-hidden="true" />
                  <strong>Farbschema & Design</strong>
                </div>
                <p className="settings-sub">
                  Deine persönliche Darstellung wird für deinen Zugang gespeichert und auf anderen
                  PCs übernommen.
                </p>
                <div className="field">
                  <label htmlFor="web-theme-mode">Helligkeit des Standard-Themes</label>
                  <select
                    id="web-theme-mode"
                    className="input"
                    value={preferences.themeMode}
                    onChange={(event) =>
                      updatePreference(
                        'themeMode',
                        event.target.value as WebPreferences['themeMode']
                      )
                    }
                  >
                    <option value="dark">Dunkel</option>
                    <option value="light">Hell</option>
                  </select>
                </div>
                <ThemePicker
                  colorTheme={preferences.colorTheme}
                  setColorTheme={(theme) => updatePreference('colorTheme', theme)}
                />
              </div>
              <div className="card settings-card settings-pane-card">
                <div className="settings-title">
                  <strong>Navigation & Layout</strong>
                </div>
                <p className="settings-sub">Position und Farbigkeit deiner Hauptnavigation.</p>
                <div className="settings-layout-stack">
                  <section className="settings-layout-panel">
                    <NavigationControls
                      navLayout={preferences.navLayout}
                      setNavLayout={(layout) => updatePreference('navLayout', layout)}
                      navIconColorMode={preferences.navIconColorMode}
                      setNavIconColorMode={(mode) => updatePreference('navIconColorMode', mode)}
                    />
                    <ModulesControl user={user} generalProfile={organizationProfile === 'GENERAL'} colorMode={preferences.navIconColorMode} onSessionExpired={onSessionExpired} />
                  </section>
                </div>
              </div>
              <div className="settings-pane-actions">
                <button className="btn primary" type="submit">
                  {busy ? 'Wird gespeichert …' : 'Darstellung speichern'}
                </button>
              </div>
            </fieldset>
          </form>
        ) : tile === 'org' && organization ? (
          <OrganizationDetails generalProfile={organizationProfile === 'GENERAL'} organization={organization} readOnly={user.role !== 'ADMIN'} onSaved={saved => { setOrganization(saved); setName(saved.name); onOrganizationChanged(saved.name) }} onSessionExpired={onSessionExpired} />
        ) : null}
      </div>
    </div>
  )
}
