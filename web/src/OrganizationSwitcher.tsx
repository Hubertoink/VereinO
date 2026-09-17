import { useModalBackgroundLock } from './useModalBackgroundLock'
import { createPortal } from 'react-dom'
import React, { useEffect, useRef, useState } from 'react'
import { IconBuilding, IconChevronDown, IconPlus, IconCheck, IconUsers } from '@tabler/icons-react'
import { api, ApiError, roleNames, type User, type Role } from './api'
import './organizations.css'
type Organization = { id: number; name: string; profile: 'NONPROFIT' | 'GENERAL'; role: Role }
export default function OrganizationSwitcher({
  user,
  onSessionExpired
}: {
  user: User
  onSessionExpired: () => void
}) {
  const [organizations, setOrganizations] = useState<Organization[]>([]),
    [open, setOpen] = useState(false),
    [creating, setCreating] = useState(false)
  const [name, setName] = useState(''),
    [profile, setProfile] = useState<'NONPROFIT' | 'GENERAL'>('NONPROFIT')
  const [members, setMembers] = useState<User[]>([]),
    [selected, setSelected] = useState<Record<number, Role>>({})
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [membersReady, setMembersReady] = useState(false)
  useModalBackgroundLock(creating)
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!creating) return
    const previous = document.activeElement as HTMLElement | null
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) {
        event.preventDefault()
        setCreating(false)
      }
      if (event.key === 'Tab') {
        const elements = Array.from(
          document.querySelectorAll<HTMLElement>(
            '.web-org-create button:not(:disabled), .web-org-create input:not(:disabled), .web-org-create select:not(:disabled)'
          )
        )
        const first = elements[0],
          last = elements[elements.length - 1]
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last?.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first?.focus()
        }
      }
    }
    document.addEventListener('keydown', keydown)
    return () => {
      document.removeEventListener('keydown', keydown)
      if (!busy) previous?.focus()
    }
  }, [creating, busy])
  const handleError = (cause: unknown) => {
    if (cause instanceof ApiError && cause.status === 401) onSessionExpired()
    else
      setError(cause instanceof Error ? cause.message : 'Organisation konnte nicht geladen werden.')
  }
  useEffect(() => {
    void api<{ organizations: Organization[] }>('/organizations')
      .then((result) => setOrganizations(result.organizations || []))
      .catch(handleError)
  }, [user.organizationId, user.organizationName])
  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])
  async function switchOrganization(id: number) {
    setBusy(true)
    setError('')
    try {
      await api(`/organizations/${id}/switch`, 'POST')
      window.location.reload()
    } catch (cause) {
      handleError(cause)
      setBusy(false)
    }
  }
  async function startCreation() {
    setOpen(false)
    setCreating(true)
    setName('')
    setProfile('NONPROFIT')
    setSelected({})
    setError('')
    setMembersReady(false)
    try {
      const result = await api<{ users: User[] }>('/users')
      setMembers(
        result.users.filter((member) => member.id !== user.id && member.isActive !== false)
      )
      setMembersReady(true)
    } catch (cause) {
      handleError(cause)
    }
  }
  return (
    <div ref={root} className="web-org-switcher">
      <button
        className="btn web-org-trigger"
        aria-label="Organisation wechseln"
        aria-expanded={open}
        disabled={busy}
        onClick={() => setOpen(!open)}
      >
        <span>{user.organizationName || 'VereinO'}</span>
        <IconChevronDown size={16} />
      </button>
      {open && (
        <div className="web-org-menu">
          <strong>Organisationen</strong>
          {organizations.map((org) => (
            <button
              className="btn web-org-option"
              key={org.id}
              disabled={busy}
              onClick={() => org.id !== user.organizationId && void switchOrganization(org.id)}
            >
              <IconBuilding size={20} />
              <span>
                {org.name}
                <small>
                  {org.profile === 'GENERAL' ? 'Allgemeine Budgetverwaltung' : 'Vereinsverwaltung'}{' '}
                  · {roleNames[org.role]}
                </small>
              </span>
              {org.id === user.organizationId && <IconCheck size={18} />}
            </button>
          ))}
          {user.role === 'ADMIN' && (
            <button className="btn web-org-option" onClick={() => void startCreation()}>
              <IconPlus size={20} />
              Organisation erstellen
            </button>
          )}
          {error && <p role="alert">{error}</p>}
        </div>
      )}
      {creating &&
        createPortal(
          <div className="modal-overlay web-org-overlay">
            <section
              className="modal web-org-create"
              role="dialog"
              aria-modal="true"
              aria-labelledby="org-create-title"
            >
              <form
                onSubmit={async (event) => {
                  event.preventDefault()
                  if (busy || !membersReady) return
                  setBusy(true)
                  setError('')
                  try {
                    const result = await api<{ organization: Organization }>(
                      '/organizations',
                      'POST',
                      {
                        name,
                        profile,
                        members: Object.entries(selected).map(([id, role]) => ({
                          userId: Number(id),
                          role
                        }))
                      }
                    )
                    setOrganizations((previous) => [...previous, result.organization])
                    setCreating(false)
                    setOpen(true)
                  } catch (cause) {
                    handleError(cause)
                  } finally {
                    setBusy(false)
                  }
                }}
              >
                <header className="web-org-create-header">
                  <div>
                    <h2 id="org-create-title">Neue Organisation anlegen</h2>
                    <p className="helper">
                      Ein eigener Bereich mit getrennten Buchungen, Stammdaten und Einstellungen.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn icon-btn"
                    aria-label="Schließen"
                    disabled={busy}
                    onClick={() => setCreating(false)}
                  >
                    ✕
                  </button>
                </header>
                <div className="field">
                  <label htmlFor="new-org-name">Organisationsname</label>
                  <input
                    id="new-org-name"
                    className="input"
                    autoFocus
                    required
                    minLength={2}
                    maxLength={255}
                    value={name}
                    disabled={busy}
                    onChange={(event) => setName(event.target.value)}
                  />
                </div>
                <fieldset disabled={busy} className="web-org-kind">
                  <legend>Verwendungsprofil</legend>
                  {(['NONPROFIT', 'GENERAL'] as const).map((kind) => (
                    <label
                      key={kind}
                      className={`web-org-kind-option ${profile === kind ? 'is-selected' : ''}`}
                    >
                      <input
                        type="radio"
                        name="organization-kind"
                        value={kind}
                        checked={profile === kind}
                        onChange={() => setProfile(kind)}
                      />
                      <span>
                        <strong>
                          {kind === 'NONPROFIT'
                            ? 'Vereinsverwaltung'
                            : 'Allgemeine Budgetverwaltung'}
                        </strong>
                        <small>
                          {kind === 'NONPROFIT'
                            ? 'Mitglieder, steuerliche Sphären und Spenden'
                            : 'Eigene Kategorien für Einnahmen und Ausgaben'}
                        </small>
                      </span>
                    </label>
                  ))}
                </fieldset>
                <p className="helper">
                  Die Organisationsart wird dauerhaft festgelegt. Du erhältst Admin-Zugang.
                </p>
                <div className="web-org-members">
                  <h3>
                    <IconUsers size={20} />
                    Benutzer übernehmen
                  </h3>
                  <p className="helper">
                    Nur ausgewählte Personen erhalten Zugang. Ihre Zugänge zur bisherigen
                    Organisation bleiben bestehen.
                  </p>
                  {!membersReady ? (
                    <p role="status">Benutzer werden geladen …</p>
                  ) : members.length === 0 ? (
                    <p className="helper">Keine weiteren aktiven Benutzer vorhanden.</p>
                  ) : (
                    members.map((member) => (
                      <div className="web-org-member" key={member.id}>
                        <label>
                          <input
                            type="checkbox"
                            disabled={busy}
                            checked={selected[member.id] !== undefined}
                            onChange={(event) =>
                              setSelected((previous) => {
                                const next = { ...previous }
                                if (event.target.checked) next[member.id] = member.role
                                else delete next[member.id]
                                return next
                              })
                            }
                          />
                          {member.email}
                        </label>
                        {selected[member.id] && (
                          <select
                            className="input"
                            aria-label={`Rolle für ${member.email}`}
                            disabled={busy}
                            value={selected[member.id]}
                            onChange={(event) =>
                              setSelected((previous) => ({
                                ...previous,
                                [member.id]: event.target.value as Role
                              }))
                            }
                          >
                            {Object.entries(roleNames).map(([role, label]) => (
                              <option key={role} value={role}>
                                {label}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    ))
                  )}
                </div>
                {error && (
                  <p role="alert" className="error-text">
                    {error}
                  </p>
                )}
                <footer className="web-org-create-actions">
                  <button
                    type="button"
                    className="btn"
                    disabled={busy}
                    onClick={() => setCreating(false)}
                  >
                    Abbrechen
                  </button>
                  <button
                    className="btn primary"
                    disabled={busy || !membersReady || name.trim().length < 2}
                  >
                    {busy ? 'Wird erstellt …' : 'Organisation erstellen'}
                  </button>
                </footer>
              </form>
            </section>
          </div>,
          document.body
        )}
    </div>
  )
}
