import React from 'react'
import { StoragePaneProps } from '../types'
import DbMigrateModal from '../../../DbMigrateModal'

import { useStorageLocation, useBackupSettings } from '../hooks'
import { LocationInfoDisplay, BackupList } from '../components'

/**
 * StoragePane - DB Location + Backups (auto + manual)
 */
export function StoragePane({ notify }: StoragePaneProps) {
  const { info, busy: locBusy, error: locError, refresh: refreshLoc, pickFolder, migrateTo, useFolder, resetToDefault } = useStorageLocation()
  const { autoMode, intervalDays, backups, busy: backupBusy, refreshBackups, makeBackup, updateAutoMode, updateInterval, chooseBackupDir, backupDir, openBackupFolder } = useBackupSettings()
  const [busy, setBusy] = React.useState(false)
  const [err, setErr] = React.useState('')
  // Data management & security (moved from GeneralPane)
  const [importPick, setImportPick] = React.useState<null | { filePath: string; size?: number; mtime?: number; counts?: Record<string, number>; currentCounts?: Record<string, number> }>(null)
  const [busyImport, setBusyImport] = React.useState(false)
  const [showDeleteAll, setShowDeleteAll] = React.useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = React.useState('')
  // Unified comparison modal state
  const [compareModal, setCompareModal] = React.useState<null | {
    mode: 'folder' | 'default'
    root: string
    dbPath?: string
    hasTargetDb: boolean
    currentCounts: Record<string, number>
    targetCounts: Record<string, number> | null
  }>(null)
  // Legacy simple migrate modal (kept for fallback when counts fail to load)
  const [migrateModal, setMigrateModal] = React.useState<{ mode: 'useOrMigrate' | 'migrateEmpty'; root: string; dbPath?: string } | null>(null)

  async function doMakeBackup() {
    setBusy(true); setErr('')
    try { const res = await makeBackup('manual'); if (res?.filePath) { notify('success', `Backup erstellt: ${res.filePath}`); refreshBackups() } }
    catch (e: any) { setErr(e?.message || String(e)); notify('error', e?.message || String(e)) }
    finally { setBusy(false) }
  }
  async function doRestore(filePath: string) {
    setBusy(true); setErr('')
    try {
      const res = await window.api?.backup?.restore?.(filePath)
      if (res?.ok) { notify('success', 'Backup wiederhergestellt'); window.dispatchEvent(new Event('data-changed')) }
      else notify('error', res?.error || 'Wiederherstellung fehlgeschlagen')
    } catch (e: any) { setErr(e?.message || String(e)); notify('error', e?.message || String(e)) }
    finally { setBusy(false) }
  }

  // Helper: load counts for current + selected DB (silently fall back to simple modal if inspection fails)
  async function loadCountsFor(dbPath?: string): Promise<Record<string, number> | null> {
    if (!dbPath) return null
    try {
      const res = await window.api?.backup?.inspect?.(dbPath)
      return res?.counts || null
    } catch { return null }
  }
  async function loadCurrentCounts(): Promise<Record<string, number>> {
    try {
      const res = await window.api?.backup?.inspectCurrent?.()
      return res?.counts || {}
    } catch { return {} }
  }

  async function openFolderCompare(picked: { root: string; dbPath: string; hasDb: boolean }) {
    const [cur, target] = await Promise.all([
      loadCurrentCounts(),
      picked.hasDb ? loadCountsFor(picked.dbPath) : Promise.resolve(null)
    ])
    if (picked.hasDb && target === null) {
      // fallback
      setMigrateModal({ mode: 'useOrMigrate', root: picked.root, dbPath: picked.dbPath })
      return
    }
    setCompareModal({
      mode: 'folder',
      root: picked.root,
      dbPath: picked.dbPath,
      hasTargetDb: picked.hasDb,
      currentCounts: cur,
      targetCounts: target
    })
  }

  async function handlePickFolder() {
    const picked = await pickFolder()
    if (!picked) return
    await openFolderCompare(picked)
  }

  async function handleResetToDefault() {
    // Show smart restore preview instead of direct apply
    setBusy(true)
    try {
      const preview = await window.api?.db?.smartRestore?.preview?.()
      if (preview) {
        const cur = preview.current?.counts || {}
        const def = preview.default?.counts || null
        setCompareModal({
          mode: 'default',
          root: preview.default?.root || '(Standard)',
          dbPath: preview.default?.dbPath,
          hasTargetDb: !!preview.default?.exists,
          currentCounts: cur,
          targetCounts: def
        })
      } else {
        notify('error', 'Smart Restore Vorschau fehlgeschlagen')
      }
    } catch (e: any) {
      notify('error', e?.message || String(e))
    } finally { setBusy(false) }
  }

  async function handleMigrateConfirm() {
    // From legacy migrateModal fallback
    if (!migrateModal) return
    setBusy(true)
    try {
      const result = await migrateTo(migrateModal.root)
      if (result.ok) {
        notify('success', 'Migration erfolgreich')
        setMigrateModal(null)
        await refreshLoc()
      } else {
        notify('error', 'Migration fehlgeschlagen')
      }
    } catch (err: any) {
      notify('error', err?.message || String(err))
    } finally { setBusy(false) }
  }
  async function handleUseExisting() {
    if (!migrateModal) return
    setBusy(true)
    try {
      const result = await useFolder(migrateModal.root)
      if (result.ok) {
        notify('success', 'Ordner übernommen')
        setMigrateModal(null)
        await refreshLoc()
      } else {
        notify('error', 'Ordnerwechsel fehlgeschlagen')
      }
    } catch (err: any) {
      notify('error', err?.message || String(err))
    } finally { setBusy(false) }
  }

  // Actions from compare modal
  async function useSelectedFolder() {
    if (!compareModal || compareModal.mode !== 'folder') return
    setBusy(true)
    try {
      const result = await useFolder(compareModal.root)
      if (result.ok) { notify('success', 'Bestehende Datenbank verwendet'); await refreshLoc() }
    } catch (e: any) { notify('error', e?.message || String(e)) }
    finally { setBusy(false); setCompareModal(null) }
  }
  async function migrateToSelectedFolder() {
    if (!compareModal || compareModal.mode !== 'folder') return
    setBusy(true)
    try {
      const result = await migrateTo(compareModal.root)
      if (result.ok) { notify('success', 'Aktuelle Datenbank migriert'); await refreshLoc() }
    } catch (e: any) { notify('error', e?.message || String(e)) }
    finally { setBusy(false); setCompareModal(null) }
  }
  async function useDefaultDb() {
    if (!compareModal || compareModal.mode !== 'default') return
    setBusy(true)
    try {
      const res = await window.api?.db?.smartRestore?.apply?.({ action: 'useDefault' })
      if (res?.ok) { notify('success', 'Standard-Datenbank verwendet'); await refreshLoc() }
    } catch (e: any) { notify('error', e?.message || String(e)) }
    finally { setBusy(false); setCompareModal(null) }
  }
  async function migrateToDefaultDb() {
    if (!compareModal || compareModal.mode !== 'default') return
    setBusy(true)
    try {
      const res = await window.api?.db?.smartRestore?.apply?.({ action: 'migrateToDefault' })
      if (res?.ok) { notify('success', 'Aktuelle Datenbank zum Standard migriert'); await refreshLoc() }
    } catch (e: any) { notify('error', e?.message || String(e)) }
    finally { setBusy(false); setCompareModal(null) }
  }

  React.useEffect(() => { refreshBackups(); refreshLoc() }, [])

  return (
    <div className="storage-pane">
      <div>
        <strong>Speicher & Sicherungen</strong>
        <div className="helper">Verwalte Speicherort und Sicherungen der Datenbank.</div>
      </div>

      <section className="card storage-section">
        <div className="helper">Aktueller Speicherort</div>
        <LocationInfoDisplay info={info} />
        <div className="storage-actions">
          <button className="btn" disabled={busy || locBusy} onClick={handlePickFolder}>📁 Ordner wählen…</button>
          <button className="btn" disabled={busy || locBusy} onClick={handleResetToDefault}>↩️ Standard vergleichen…</button>
        </div>
        {locError && <div className="error-text">{locError}</div>}
      </section>

      <section className="card storage-section">
        <div className="helper">Automatische Sicherungen</div>
        <div className="storage-auto-settings">
          <div className="field">
            <label htmlFor="auto-backup-mode">Modus</label>
            <select id="auto-backup-mode" className="input" value={autoMode} onChange={(e) => updateAutoMode(e.target.value as any)}>
              <option value="OFF">Aus</option>
              <option value="PROMPT">Nachfragen</option>
              <option value="SILENT">Still</option>
            </select>
          </div>
          <div className="field storage-field-min-160">
            <label htmlFor="auto-backup-interval">Intervall (Tage)</label>
            <input id="auto-backup-interval" title="Intervall (Tage)" className="input" type="number" min={1} value={intervalDays} onChange={(e) => updateInterval(Number(e.target.value) || 1)} />
          </div>
          <div className="field storage-field-min-240">
            <label>Backup-Verzeichnis</label>
            <div className="storage-backup-dir">
              <code className="storage-backup-code">{backupDir || 'Standard'}</code>
              <button className="btn" disabled={backupBusy} onClick={async () => { const r = await chooseBackupDir(); if (r.ok) notify('success', 'Backup-Verzeichnis gesetzt') }}>Ändern…</button>
              <button className="btn" disabled={backupBusy} onClick={openBackupFolder}>Öffnen…</button>
            </div>
          </div>
        </div>
      </section>

      <section className="card storage-section">
        <div className="storage-actions">
          <button className="btn" disabled={busy} onClick={doMakeBackup}>Jetzt sichern</button>
        </div>
        <BackupList backups={backups} onRestore={doRestore} />
      </section>

      {/* Datenverwaltung & Sicherheit */}
      <section className="card storage-section">
        <div className="settings-title">
          <span aria-hidden="true">🗄️</span> <strong>Datenverwaltung & Sicherheit</strong>
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
      </section>

      {/* Import comparison modal */}
      {importPick && (
        <div className="modal-overlay" role="dialog" aria-modal="true" onClick={() => !busyImport && setImportPick(null)}>
          <div className="modal modal-wide modal-grid" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Import vergleichen</h2>
              <button className="btn ghost" onClick={() => setImportPick(null)}>✕</button>
            </div>
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
                    'invoice_files': 'Rechnungsdateien',
                    'invoices': 'Rechnungen',
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
                    window.dispatchEvent(new Event('data-changed'))
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
            <div className="modal-header">
              <h2>Alle Buchungen löschen</h2>
              <button className="btn ghost" onClick={() => setShowDeleteAll(false)}>
                ✕
              </button>
            </div>
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
                    window.dispatchEvent(new Event('data-changed'))
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


      {/* Fallback simple migrate modal */}
      {migrateModal && (
        <DbMigrateModal
          {...(migrateModal.mode === 'useOrMigrate'
            ? {
                mode: 'useOrMigrate' as const,
                root: migrateModal.root,
                dbPath: migrateModal.dbPath || '',
                busy,
                onCancel: () => setMigrateModal(null),
                onUse: handleUseExisting,
                onMigrate: handleMigrateConfirm,
              }
            : {
                mode: 'migrateEmpty' as const,
                root: migrateModal.root,
                busy,
                onCancel: () => setMigrateModal(null),
                onMigrate: handleMigrateConfirm,
              })}
        />
      )}

      {compareModal && (
        <div className="modal-overlay" role="dialog" aria-modal="true" onClick={() => !busy && setCompareModal(null)}>
          <div className="modal modal-wider modal-grid-14" onClick={e => e.stopPropagation()}>
            <header className="modal-header">
              <h2>
                {compareModal.mode === 'folder' ? 'Datenbanken vergleichen' : 'Standard-Datenbank Vergleich'}
              </h2>
              <button className="btn ghost" onClick={() => setCompareModal(null)} aria-label="Schließen">✕</button>
            </header>
            <div className="helper helper-mt-neg">
              {compareModal.mode === 'folder' ? (
                compareModal.hasTargetDb ? 'Im gewählten Ordner wurde eine bestehende Datenbank gefunden. Vergleiche die Tabellenstände und wähle eine Aktion.' : 'Der gewählte Ordner enthält keine Datenbank. Du kannst deine aktuelle Datenbank dorthin migrieren.'
              ) : (
                compareModal.hasTargetDb ? 'Es existiert bereits eine Standard-Datenbank. Vergleiche Tabellenstände, bevor du wechselst oder migrierst.' : 'Im Standardordner liegt keine Datenbank. Du kannst deine aktuelle dorthin migrieren.'
              )}
            </div>
            <div className="card compare-table-10">
              <div className="compare-header">
                <div>Tabelle</div>
                <div className="compare-badge-current">Aktuell</div>
                <div className="compare-badge-target">{compareModal.mode === 'folder' ? 'Gewählt' : 'Standard'}</div>
              </div>
              <div className="compare-rows">
                {(() => {
                  // Map technical table names to German
                  const tableNames: Record<string, string> = {
                    'invoice_files': 'Rechnungsdateien',
                    'invoices': 'Rechnungen',
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
                  
                  const allTables = Array.from(new Set([
                    ...Object.keys(compareModal.currentCounts || {}),
                    ...Object.keys(compareModal.targetCounts || {})
                  ])).sort()
                  
                  return allTables.map(k => {
                    const current = compareModal.currentCounts[k] ?? 0
                    const target = (compareModal.targetCounts || {})[k] ?? 0
                    const isDifferent = current !== target
                    const germanName = tableNames[k] || k
                    
                    return (
                      <React.Fragment key={k}>
                        <div>{germanName}</div>
                        <div className={isDifferent ? 'compare-cell-diff-current' : 'compare-cell'}>
                          {current}
                        </div>
                        <div className={isDifferent ? 'compare-cell-diff-target' : 'compare-cell'}>
                          {target || '0'}
                        </div>
                      </React.Fragment>
                    )
                  })
                })()}
                {Object.keys(compareModal.currentCounts).length === 0 && Object.keys(compareModal.targetCounts || {}).length === 0 && (
                  <div className="compare-no-data helper">Keine Tabellenstände verfügbar.</div>
                )}
              </div>
            </div>
            <div className="modal-actions-between">
              <div className="helper helper-flex-1">
                {compareModal.mode === 'folder' ? (
                  compareModal.hasTargetDb ? 'Aktion wählen: Bestehende Datenbank verwenden oder aktuelle Datenbank in den Ordner kopieren.' : 'Aktion wählen: Aktuelle Datenbank in den Ordner kopieren.'
                ) : (
                  compareModal.hasTargetDb ? 'Aktion wählen: Standard-Datenbank verwenden oder aktuelle zur Standard migrieren.' : 'Aktion wählen: Aktuelle Datenbank zum Standard migrieren.'
                )}
              </div>
              <div className="storage-actions">
                {compareModal.mode === 'folder' && compareModal.hasTargetDb && (
                  <button className="btn" onClick={useSelectedFolder} disabled={busy}>Bestehende verwenden</button>
                )}
                {compareModal.mode === 'default' && compareModal.hasTargetDb && (
                  <button className="btn" onClick={useDefaultDb} disabled={busy}>Standard verwenden</button>
                )}
                {compareModal.mode === 'folder' && (
                  <button className="btn primary" onClick={migrateToSelectedFolder} disabled={busy}>Aktuelle migrieren</button>
                )}
                {compareModal.mode === 'default' && (
                  <button className="btn primary" onClick={migrateToDefaultDb} disabled={busy}>Aktuelle migrieren</button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {err && <div className="error-text">{err}</div>}
    </div>
  )
}
