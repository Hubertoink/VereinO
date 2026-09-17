import { useEffect, useState } from 'react'
import { api, ApiError, type User } from '../api'
import { navItems } from '../../../src/renderer/utils/navItems'
import { getNavIcon } from '../../../src/renderer/utils/navIcons'
import { lockedWebNavKeys, webNavKeys, type WebNavKey } from '../../../shared/webNavigation'
import { useToast } from '../../../src/renderer/context/useToast'

export type ModuleSettings = { version: number; visibleNavItems: WebNavKey[] }
export default function ModulesControl({ user, generalProfile, colorMode, onSessionExpired }: {
  user: User; generalProfile: boolean; colorMode: 'color' | 'mono'; onSessionExpired: () => void
}) {
  const [settings, setSettings] = useState<ModuleSettings | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [revision, setRevision] = useState(0)
  const { notify } = useToast()
  useEffect(() => {
    let active = true
    setError('')
    api<ModuleSettings>('/settings/modules').then(result => { if (active) setSettings(result) }).catch(cause => {
      if (active) setError(cause.message)
      if (cause instanceof ApiError && cause.status === 401) onSessionExpired()
    })
    return () => { active = false }
  }, [user.organizationId, user.id, revision, onSessionExpired])
  const items = navItems.filter(item => webNavKeys.includes(item.key as WebNavKey) && (!generalProfile || item.key !== 'Mitglieder') && (user.role !== 'USER' || ['Einreichungen', 'KI', 'Einstellungen'].includes(item.key)))
  const save = async () => {
    if (!settings || busy) return
    setBusy(true); setError('')
    try {
      const saved = await api<ModuleSettings>('/settings/modules', 'PATCH', settings)
      setSettings(saved)
      window.dispatchEvent(new CustomEvent('vereino-modules-changed', { detail: { ...saved, organizationId: user.organizationId } }))
      notify('success', 'Modulauswahl gespeichert.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Speichern fehlgeschlagen.')
      if (cause instanceof ApiError && cause.status === 401) onSessionExpired()
    } finally { setBusy(false) }
  }
  return <div className="settings-layout-control settings-nav-visibility-control">
    <div className="settings-layout-label-row"><label>Reiterleiste</label><span>Bestimme, welche Hauptbereiche in der Navigation dieser Organisation sichtbar sind. Die Zugriffsrechte der Benutzer gelten weiterhin.</span></div>
    {settings && <div className="settings-nav-visibility-grid">{items.map(item => {
      const key = item.key as WebNavKey, locked = lockedWebNavKeys.includes(key)
      return <label key={key} className={`settings-nav-visibility-item ${locked ? 'is-locked' : ''}`}>
        <span className={`settings-nav-visibility-icon ${colorMode === 'color' ? `icon-color-${key}` : ''}`}>{getNavIcon(key)}</span>
        <span>{key === 'Einreichungen' ? 'Entwürfe' : item.label}</span>
        <input type="checkbox" className="toggle" checked={locked || (settings.visibleNavItems || webNavKeys).includes(key)} disabled={locked || busy || user.role !== 'ADMIN'} aria-label={`${item.label} in Navigation anzeigen`} onChange={event => setSettings(current => current && { ...current, visibleNavItems: event.target.checked ? [...new Set([...(current.visibleNavItems || webNavKeys), key])] : (current.visibleNavItems || webNavKeys).filter(value => value !== key) })} />
      </label>
    })}</div>}
    {error && <div role="alert">{error} <button type="button" className="btn" onClick={() => setRevision(value => value + 1)}>Neu laden</button></div>}
    {user.role === 'ADMIN' ? <div className="settings-pane-actions"><button type="button" className="btn primary" disabled={!settings || busy} onClick={() => void save()}>{busy ? 'Wird gespeichert …' : 'Modulauswahl speichern'}</button></div> : <p className="helper">Die Modulauswahl wird vom Admin dieser Organisation verwaltet.</p>}
  </div>
}
