import ModalHeader from '../../../components/ModalHeader'
import React from 'react'
import { createPortal } from 'react-dom'
import { StoragePaneProps } from '../types'
import type { PickResult } from '../../../storage'
import { dispatchDataChanged } from '../../../utils/refresh'
import { IconClock, IconDatabase, IconDeviceFloppy, IconFolder, IconShieldCheck } from '@tabler/icons-react'

import { useStorageLocation, useBackupSettings } from '../hooks'
import { LocationInfoDisplay, BackupList } from '../components'
import BackupProgressStatus from '../../../components/common/BackupProgressStatus'

/**
 * StoragePane - DB Location + Backups (auto + manual)
 */
export function StoragePane({ notify }: StoragePaneProps) {
  const { info, busy: locBusy, error: locError, pickFolder, migrateTo } = useStorageLocation()
  const { autoMode, intervalDays, backups, busy: backupBusy, progress, listError, listLoading, refreshBackups, makeBackup, updateAutoMode, updateInterval, chooseBackupDir, backupDir, openBackupFolder } = useBackupSettings()
  const [busy, setBusy] = React.useState(false)
  const [busyDanger, setBusyDanger] = React.useState(false)
  // Data management & security (moved from GeneralPane)
  const [importPick, setImportPick] = React.useState<null | { filePath: string; size?: number; mtime?: number; counts?: Record<string, number>; currentCounts?: Record<string, number> }>(null)
  const [busyImport, setBusyImport] = React.useState(false)
  const [showDeleteAll, setShowDeleteAll] = React.useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = React.useState('')
  const [showDeleteOrg, setShowDeleteOrg] = React.useState(false)
  const [deleteOrgConfirmText, setDeleteOrgConfirmText] = React.useState('')
  const [activeOrg, setActiveOrg] = React.useState<null | { id: string; name: string }>(null)
  const [compareModal, setCompareModal] = React.useState<PickResult | null>(null)
  const compareDialog = React.useRef<HTMLDivElement>(null)
  const compareReturnFocus = React.useRef<HTMLElement | null>(null)
  const lastListError = React.useRef('')
  const lastLocationError = React.useRef('')
  React.useEffect(() => {
    if (listLoading) { lastListError.current = ''; return }
    if (listError && listError !== lastListError.current) {
      notify('error', listError, 8000, { label: 'Erneut laden', onClick: () => void refreshBackups() })
    }
    lastListError.current = listError
  }, [listError, listLoading, notify, refreshBackups])
  React.useEffect(() => {
    if (locError && locError !== lastLocationError.current) notify('error', locError)
    lastLocationError.current = locError
  }, [locError, notify])
  React.useEffect(() => {
    if (!compareModal) return
    const previous = compareReturnFocus.current || document.activeElement as HTMLElement | null
    compareDialog.current?.focus()
    return () => previous?.focus()
  }, [compareModal])


  async function doMakeBackup() {
    setBusy(true)
    try {
      const res = await makeBackup('manual')
      if (res.ok && res.filePath) {
        notify(res.warning ? 'info' : 'success', res.warning || `Backup erstellt: ${res.filePath}`)
      } else {
        const message = res.error || 'Backup fehlgeschlagen'
        notify('error', message, 12000, { label: 'Lokale Kopien & Protokolle', onClick: () => void window.api.backup.openRecoveryFolder() })
      }
    }
    catch (e: any) { notify('error', e?.message || String(e)) }
    finally { setBusy(false) }
  }
  async function doRestore(filePath: string) {
    setBusy(true)
    try {
      const res = await window.api?.backup?.restore?.(filePath)
      if (res?.ok) { notify('success', 'Backup wiederhergestellt'); dispatchDataChanged() }
      else notify('error', res?.error || 'Wiederherstellung fehlgeschlagen')
    } catch (e: any) { notify('error', e?.message || String(e)) }
    finally { setBusy(false) }
  }

  async function handlePickFolder() {
    compareReturnFocus.current = document.activeElement as HTMLElement | null
    setBusy(true)
    try {
      const picked = await pickFolder()
      if (picked) setCompareModal(picked)
    } finally { setBusy(false) }
  }

  async function loadCurrentCounts(): Promise<Record<string, number>> {
    try {
      return (await window.api.backup.inspectCurrent()).counts || {}
    } catch { return {} }
  }

  async function migrateToSelectedFolder() {
    if (!compareModal) return
    setBusy(true)
    try {
      const result = await migrateTo(compareModal.root, compareModal.organization.id)
      if (result.ok) {
        notify('success', `Speicherort für „${compareModal.organization.name}“ geändert`)
        // Clear all cached paths and reload settings/backups from the new root.
        window.location.reload()
      }
    } finally { setBusy(false) }
  }

  async function ensureActiveOrgLoaded() {
    if (activeOrg) return
    const org = await window.api?.organizations?.active?.()
    const o = org?.organization
    if (o?.id && o?.name) setActiveOrg({ id: o.id, name: o.name })
  }

  return (
    <div className="storage-pane">
      <div>
        <strong>Speicher & Sicherungen</strong>
        <div className="helper">Verwalte Speicherort und Sicherungen der Datenbank.</div>
      </div>

      <section className="card storage-section">
        <div className="storage-location-heading">
          <div><IconFolder size={21} aria-hidden="true" /><strong>Aktueller Speicherort</strong></div>
          {info?.organization && <span className="storage-location-badge">{info.organization.name}</span>}
        </div>
        <div className="helper">Dieser Speicherort gehört ausschließlich zur aktuellen Organisation.</div>
        <LocationInfoDisplay info={info} onError={message => notify('error', message)} />
        <div className="storage-actions">
          <button className="btn" disabled={busy || locBusy || backupBusy} onClick={handlePickFolder}><IconFolder size={16} aria-hidden="true" /> Ordner wählen…</button>
        </div>
      </section>

      <section className="card storage-section">
        <div className="backup-section-header">
          <div className="backup-section-title">
            <IconShieldCheck size={22} aria-hidden="true" />
            <div>
              <strong>Datensicherung</strong>
              <div className="helper">Schütze deine Daten mit automatischen und manuellen Sicherungen.</div>
            </div>
          </div>
          <button className="btn primary" disabled={busy || backupBusy} onClick={doMakeBackup}>
            <IconDeviceFloppy size={16} aria-hidden="true" />
            Jetzt sichern
          </button>
        </div>

        <BackupProgressStatus progress={progress} />
        <div className="backup-settings-grid">
          {/* Auto-backup config */}
          <div className="backup-auto-card">
            <div className="backup-auto-header">
              <IconClock className="backup-auto-icon" size={18} aria-hidden="true" />
              <span className="backup-auto-label">Automatische Sicherung</span>
              <select 
                id="auto-backup-mode" 
                className="backup-mode-select" 
                value={autoMode} 
                onChange={(e) => updateAutoMode(e.target.value as any)}
                aria-label="Automatischer Sicherungsmodus"
              >
                <option value="OFF">Aus</option>
                <option value="PROMPT">Nachfragen</option>
                <option value="SILENT">Still</option>
              </select>
            </div>
            {autoMode !== 'OFF' && (
              <div className="backup-auto-details">
                <div className="backup-interval-row">
                  <label htmlFor="auto-backup-interval">Intervall:</label>
                  <div className="backup-interval-input">
                    <input 
                      id="auto-backup-interval" 
                      className="input" 
                      type="number" 
                      min={1} 
                      value={intervalDays} 
                      onChange={(e) => updateInterval(Number(e.target.value) || 1)} 
                    />
                    <span>Tage</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Backup directory config */}
          <div className="backup-dir-card">
            <div className="backup-dir-header">
              <IconFolder className="backup-dir-icon" size={18} aria-hidden="true" />
              <span className="backup-dir-label">Speicherort</span>
            </div>
            <div className="backup-dir-path">
              <code>{backupDir || 'Standard-Verzeichnis'}</code>
            </div>
            <div className="backup-dir-actions">
              <button className="btn btn-sm" disabled={backupBusy} onClick={async () => {
                const r = await chooseBackupDir()
                if (r.ok) notify(r.warning ? 'info' : 'success', r.warning || 'Backup-Verzeichnis gesetzt')
                else if (r.error && r.error !== 'Abbruch') notify('error', r.error)
              }}>
                Ändern
              </button>
              <button className="btn btn-sm" disabled={backupBusy} onClick={openBackupFolder}>
                Öffnen
              </button>
              <button className="btn btn-sm" onClick={() => void window.api.backup.openRecoveryFolder()}>Lokale Kopien & Protokolle</button>
            </div>
          </div>
        </div>

        {/* Backup list */}
        <div className="backup-list-section">
          <div className="backup-list-header">
            <span>Vorhandene Sicherungen</span>
            {!listError && !listLoading && <span className="backup-count">{backups.length}</span>}
            {listError && !listLoading && <button className="btn btn-sm" onClick={() => void refreshBackups()}>Erneut laden</button>}
          </div>
          {listLoading && <div role="status" className="helper">Sicherungsordner wird gelesen …</div>}
          {!listLoading && !listError && <BackupList backups={backups} onRestore={doRestore} />}
        </div>
      </section>

      {/* Datenverwaltung & Sicherheit */}
      <section className="card storage-section">
        <div className="settings-title">
          <IconDatabase size={18} aria-hidden="true" /> <strong>Datenverwaltung & Sicherheit</strong>
        </div>
        <div className="settings-sub">Exportiere eine Sicherung oder importiere eine bestehende SQLite-Datei.</div>
        <div className="storage-actions">
          <button
            className="btn"
            onClick={async () => {
              try {
                const res = await window.api?.db.export?.()
                if (res?.filePath) {
                  // Ignore empty string (cancel)
                  if (String(res.filePath).trim().length > 0) notify('success', `Datenbank exportiert: ${res.filePath}`)
                }
              } catch (e: any) {
                const msg = e?.message || String(e)
                if (/Abbruch/i.test(msg)) return
                notify('error', msg)
              }
            }}
          >
            Exportieren
          </button>
          <button className="btn danger" onClick={async () => {
            try {
              const api = window.api?.db?.import as any
              const picked = await api?.pick?.()
              if (picked?.ok && picked.filePath) {
                const cur = await loadCurrentCounts()
                setImportPick({ filePath: picked.filePath, size: picked.size, mtime: picked.mtime, counts: picked.counts, currentCounts: cur })
              }
            } catch (e: any) {
              const msg = e?.message || String(e)
              if (/Abbruch/i.test(msg)) return
              notify('error', msg)
            }
          }}>
            Importieren…
          </button>
        </div>
        <div className="muted-sep" />
        <div className="storage-data-management">
          <div>
            <strong>Gefährliche Aktion</strong>
            <div className="helper">Alle Buchungen löschen (inkl. Anhänge). Dies kann nicht rückgängig gemacht werden.</div>
          </div>
          <div>
            <button className="btn danger" onClick={() => { setDeleteConfirmText(''); setShowDeleteAll(true) }}>
              Alle Buchungen löschen…
            </button>
          </div>
        </div>

        <div className="muted-sep" />
        <div className="storage-data-management">
          <div>
            <strong>Gefährliche Aktion</strong>
            <div className="helper">Die aktuell aktive Organisation wird dauerhaft gelöscht (inkl. Datenbank und Dateien). Dies kann nicht rückgängig gemacht werden.</div>
          </div>
          <div>
            <button
              className="btn danger"
              disabled={busyDanger}
              onClick={async () => {
                try {
                  await ensureActiveOrgLoaded()
                  setDeleteOrgConfirmText('')
                  setShowDeleteOrg(true)
                } catch (e: any) {
                  notify('error', e?.message || String(e))
                }
              }}
            >
              Orga löschen…
            </button>
          </div>
        </div>
      </section>

      {/* Import comparison modal */}
      {importPick && (
        <div className="modal-overlay" role="dialog" aria-modal="true" onClick={() => !busyImport && setImportPick(null)}>
          <div className="modal modal-wide modal-grid" onClick={e => e.stopPropagation()}>
            <ModalHeader
              className="modal-header"
              title="Import vergleichen"
              onClose={() => setImportPick(null)}
              closeOnEscape={false}
            />
            <div className="helper helper-danger">
              Die aktuelle Datenbank wird beim Import überschrieben. Prüfe die Tabellenstände, bevor du fortfährst.
            </div>
            <div className="card compare-table">
              <div className="compare-header">
                <div>Tabelle</div>
                <div className="compare-badge-current">Aktuell</div>
                <div className="compare-badge-target">Import</div>
              </div>
              <div className="compare-rows">
                {(() => {
                  const currentCounts = importPick.currentCounts || {}
                  const importCounts = importPick.counts || {}
                  const tableNames: Record<string, string> = {
                    'invoice_files': 'Verbindlichkeitsdateien',
                    'invoices': 'Verbindlichkeiten',
                    'members': 'Mitglieder',
                    'tags': 'Tags',
                    'voucher_files': 'Belegdateien',
                    'vouchers': 'Buchungen',
                    'budgets': 'Budgets',
                    'bindings': 'Zweckbindungen',
                    'member_payments': 'Mitgliedsbeiträge',
                    'audit_log': 'Änderungsprotokoll',
                    'settings': 'Einstellungen'
                  }
                  const all = Array.from(new Set([...Object.keys(currentCounts), ...Object.keys(importCounts)])).sort()
                  return all.map(k => {
                    const cur = currentCounts[k] ?? 0
                    const imp = importCounts[k] ?? 0
                    const diff = cur !== imp
                    return (
                      <React.Fragment key={k}>
                        <div>{tableNames[k] || k}</div>
                        <div className={diff ? 'compare-cell compare-cell-diff' : 'compare-cell'}>{cur}</div>
                        <div className={diff ? 'compare-cell compare-cell-diff-blue' : 'compare-cell'}>{imp}</div>
                      </React.Fragment>
                    )
                  })
                })()}
                {(() => {
                  const currentCounts = importPick.currentCounts || {}
                  const importCounts = importPick.counts || {}
                  if (!Object.keys(currentCounts).length && !Object.keys(importCounts).length) {
                    return <div className="compare-no-data helper">Keine Tabellenstände verfügbar.</div>
                  }
                  return null
                })()}
              </div>
            </div>
            <div className="modal-actions-end">
              <button className="btn" disabled={busyImport} onClick={() => setImportPick(null)}>Abbrechen</button>
              <button className="btn danger" disabled={busyImport} onClick={async () => {
                try {
                  setBusyImport(true)
                  const api = window.api?.db?.import as any
                  const res = await api?.fromPath?.(importPick.filePath)
                  if (res?.ok) {
                    notify('success', 'Datenbank importiert. Neu laden …')
                    dispatchDataChanged()
                    window.setTimeout(() => window.location.reload(), 600)
                  }
                } catch (e: any) {
                  const msg = e?.message || String(e)
                  notify('error', msg)
                } finally {
                  setBusyImport(false)
                  setImportPick(null)
                }
              }}>Import bestätigen</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete All Confirmation Modal */}
      {showDeleteAll && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal modal-grid">
            <ModalHeader
              className="modal-header"
              title="Alle Buchungen löschen"
              onClose={() => setShowDeleteAll(false)}
              closeOnEscape={false}
            />
            <div className="helper">
              Dieser Vorgang löscht ALLE Buchungen und zugehörige Anhänge dauerhaft. Dies kann nicht rückgängig gemacht werden.
            </div>
            <div className="field">
              <label>Zur Bestätigung bitte exakt "LÖSCHEN" eingeben</label>
              <input
                className="input"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.currentTarget.value)}
                placeholder="LÖSCHEN"
              />
            </div>
            <div className="modal-actions-end">
              <button className="btn" onClick={() => setShowDeleteAll(false)}>
                Abbrechen
              </button>
              <button
                className="btn danger"
                disabled={deleteConfirmText !== 'LÖSCHEN'}
                onClick={async () => {
                  try {
                    const res = await window.api?.vouchers.clearAll?.()
                    const n = res?.deleted ?? 0
                    setShowDeleteAll(false)
                    notify('success', `${n} Buchung(en) gelöscht.`)
                    dispatchDataChanged()
                  } catch (e: any) {
                    notify('error', e?.message || String(e))
                  }
                }}
              >
                Ja, alles löschen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Organization Confirmation Modal */}
      {showDeleteOrg && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal modal-grid">
            <ModalHeader
              className="modal-header"
              title="Organisation löschen"
              onClose={() => setShowDeleteOrg(false)}
              closeOnEscape={false}
            />
            <div className="helper">
              Diese Aktion löscht die aktuell aktive Organisation{activeOrg?.name ? ` "${activeOrg.name}"` : ''} inklusive aller Daten.
            </div>
            <div className="field">
              <label>Zur Bestätigung bitte exakt "LÖSCHEN" eingeben</label>
              <input
                className="input"
                value={deleteOrgConfirmText}
                onChange={(e) => setDeleteOrgConfirmText(e.currentTarget.value)}
                placeholder="LÖSCHEN"
              />
            </div>
            <div className="modal-actions-end">
              <button className="btn" disabled={busyDanger} onClick={() => setShowDeleteOrg(false)}>
                Abbrechen
              </button>
              <button
                className="btn danger"
                disabled={busyDanger || deleteOrgConfirmText !== 'LÖSCHEN'}
                onClick={async () => {
                  setBusyDanger(true)
                  try {
                    await ensureActiveOrgLoaded()
                    const orgId = activeOrg?.id
                    if (!orgId) throw new Error('Keine aktive Organisation gefunden')

                    await window.api?.organizations?.delete?.({ orgId, deleteData: true })
                    notify('success', 'Organisation gelöscht. Neu laden …')
                    dispatchDataChanged()
                    window.setTimeout(() => window.location.reload(), 600)
                  } catch (e: any) {
                    notify('error', e?.message || String(e))
                  } finally {
                    setBusyDanger(false)
                    setShowDeleteOrg(false)
                    setDeleteOrgConfirmText('')
                    setActiveOrg(null)
                  }
                }}
              >
                Ja, Organisation löschen
              </button>
            </div>
          </div>
        </div>
      )}


      {/* Fallback simple migrate modal */}
      {compareModal && createPortal(
        <div className="modal-overlay storage-compare-overlay" onClick={() => !busy && setCompareModal(null)}>
          <div ref={compareDialog} className="modal storage-compare-modal" role="dialog" aria-modal="true" aria-labelledby="storage-compare-title" tabIndex={-1} onClick={e => e.stopPropagation()}
            onKeyDown={event => {
              if (event.key !== 'Tab') return
              const controls = Array.from(compareDialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), [tabindex="0"]') || [])
              const first = controls[0], last = controls[controls.length - 1]
              if (!first) { event.preventDefault(); return }
              if (event.shiftKey && (document.activeElement === first || document.activeElement === compareDialog.current)) { event.preventDefault(); last.focus() }
              else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
            }}>
            <ModalHeader
              className="modal-header"
              title="Speicherort ändern"
              titleId="storage-compare-title"
              onClose={() => setCompareModal(null)}
              closeLabel="Schließen"
              closeDisabled={busy}
            />
            <div className="storage-compare-body">
              <p>Speicherort für <strong>{compareModal.organization.name}</strong> ändern.</p>
              <div className="storage-location-paths">
                <div className="storage-location-path"><span className="storage-location-path__copy"><strong>Bisheriger Ordner</strong><code>{compareModal.sourceRoot}</code></span></div>
                <div className="storage-location-path"><span className="storage-location-path__copy"><strong>Neuer Ordner</strong><code>{compareModal.root}</code></span></div>
              </div>
              <p className="helper">Datenbank, Belege und Sicherungen im bisherigen Datenordner werden in den leeren Zielordner kopiert. Danach verwendet nur diese Organisation den neuen Ordner. Die bisherige Kopie bleibt erhalten.</p>
              <p className="helper">Ein separat gewählter Sicherungsordner bleibt bestehen.</p>
              {busy && <div role="status">Daten werden kopiert und geprüft …</div>}
            </div>
            <div className="modal-actions-between storage-compare-footer">
              <button className="btn" onClick={() => setCompareModal(null)} disabled={busy}>Abbrechen</button>
              <button className="btn primary" onClick={migrateToSelectedFolder} disabled={busy}>Kopieren und verwenden</button>
            </div>
          </div>
        </div>, document.body
      )}

    </div>
  )
}
