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
  const [showImportConfirm, setShowImportConfirm] = React.useState(false)
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
    <div style={{ display: 'grid', gap: 12 }}>
      <div>
        <strong>Speicher & Sicherungen</strong>
        <div className="helper">Verwalte Speicherort und Sicherungen der Datenbank.</div>
      </div>

      <section className="card" style={{ padding: 12, display: 'grid', gap: 8 }}>
        <div className="helper">Aktueller Speicherort</div>
        <LocationInfoDisplay info={info} />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn" disabled={busy || locBusy} onClick={handlePickFolder}>📁 Ordner wählen…</button>
          <button className="btn" disabled={busy || locBusy} onClick={handleResetToDefault}>↩️ Standard vergleichen…</button>
        </div>
        {locError && <div style={{ color: 'var(--danger)' }}>{locError}</div>}
      </section>

      <section className="card" style={{ padding: 12, display: 'grid', gap: 8 }}>
        <div className="helper">Automatische Sicherungen</div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div className="field">
            <label htmlFor="auto-backup-mode">Modus</label>
            <select id="auto-backup-mode" className="input" value={autoMode} onChange={(e) => updateAutoMode(e.target.value as any)}>
              <option value="OFF">Aus</option>
              <option value="PROMPT">Nachfragen</option>
              <option value="SILENT">Still</option>
            </select>
          </div>
          <div className="field" style={{ minWidth: 160 }}>
            <label htmlFor="auto-backup-interval">Intervall (Tage)</label>
            <input id="auto-backup-interval" title="Intervall (Tage)" className="input" type="number" min={1} value={intervalDays} onChange={(e) => updateInterval(Number(e.target.value) || 1)} />
          </div>
          <div className="field" style={{ minWidth: 240 }}>
            <label>Backup-Verzeichnis</label>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              <code style={{ fontSize: 12, wordBreak: 'break-all' }}>{backupDir || 'Standard'}</code>
              <button className="btn" disabled={backupBusy} onClick={async () => { const r = await chooseBackupDir(); if (r.ok) notify('success', 'Backup-Verzeichnis gesetzt') }}>Ändern…</button>
              <button className="btn" disabled={backupBusy} onClick={openBackupFolder}>Öffnen…</button>
            </div>
          </div>
        </div>
      </section>

      <section className="card" style={{ padding: 12, display: 'grid', gap: 8 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn" disabled={busy} onClick={doMakeBackup}>Jetzt sichern</button>
        </div>
        <BackupList backups={backups} onRestore={doRestore} />
      </section>

      {/* Datenverwaltung & Sicherheit */}
      <section className="card" style={{ padding: 12, display: 'grid', gap: 8 }}>
        <div className="settings-title">
          <span aria-hidden>🗄️</span> <strong>Datenverwaltung & Sicherheit</strong>
        </div>
        <div className="settings-sub">Exportiere eine Sicherung oder importiere eine bestehende SQLite-Datei.</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
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
          <button className="btn danger" onClick={() => setShowImportConfirm(true)}>
            Importieren…
          </button>
        </div>
        <div className="muted-sep" />
        <div style={{ display: 'grid', gap: 8 }}>
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

      {/* Import Confirmation Modal */}
      {showImportConfirm && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal" style={{ display: 'grid', gap: 12, maxWidth: 560 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ margin: 0 }}>Datenbank importieren</h2>
              <button className="btn ghost" onClick={() => setShowImportConfirm(false)}>
                ✕
              </button>
            </div>
            <div className="helper" style={{ color: 'var(--danger)' }}>
              Achtung: Die aktuelle Datenbank wird überschrieben. Erstelle vorher eine Sicherung, wenn du dir unsicher bist.
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn" onClick={() => setShowImportConfirm(false)}>
                Abbrechen
              </button>
              <button
                className="btn danger"
                disabled={busyImport}
                onClick={async () => {
                  try {
                    setBusyImport(true)
                    const res = await window.api?.db?.import?.()
                    if (res?.ok) {
                      notify('success', 'Datenbank importiert. Die App wird neu geladen …')
                      window.dispatchEvent(new Event('data-changed'))
                      window.setTimeout(() => window.location.reload(), 600)
                    }
                  } catch (e: any) {
                    const msg = e?.message || String(e)
                    if (/Abbruch/i.test(msg)) {
                      // graceful cancel -> ignore
                    } else {
                      notify('error', msg)
                    }
                  } finally {
                    setBusyImport(false)
                    setShowImportConfirm(false)
                  }
                }}
              >
                Ja, fortfahren
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete All Confirmation Modal */}
      {showDeleteAll && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal" style={{ display: 'grid', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ margin: 0 }}>Alle Buchungen löschen</h2>
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
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
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
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 780, display: 'grid', gap: 14 }}>
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ margin: 0 }}>
                {compareModal.mode === 'folder' ? 'Datenbanken vergleichen' : 'Standard-Datenbank Vergleich'}
              </h2>
              <button className="btn ghost" onClick={() => setCompareModal(null)} aria-label="Schließen">✕</button>
            </header>
            <div className="helper" style={{ marginTop: -4 }}>
              {compareModal.mode === 'folder' ? (
                compareModal.hasTargetDb ? 'Im gewählten Ordner wurde eine bestehende Datenbank gefunden. Vergleiche die Tabellenstände und wähle eine Aktion.' : 'Der gewählte Ordner enthält keine Datenbank. Du kannst deine aktuelle Datenbank dorthin migrieren.'
              ) : (
                compareModal.hasTargetDb ? 'Es existiert bereits eine Standard-Datenbank. Vergleiche Tabellenstände, bevor du wechselst oder migrierst.' : 'Im Standardordner liegt keine Datenbank. Du kannst deine aktuelle dorthin migrieren.'
              )}
            </div>
            <div className="card" style={{ padding: 12, display: 'grid', gap: 10 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 8, fontWeight: 600 }}>
                <div>Tabelle</div>
                <div style={{ background: 'var(--accent)', color: '#fff', padding: '4px 8px', borderRadius: 4, textAlign: 'center' }}>Aktuell</div>
                <div style={{ textAlign: 'center' }}>{compareModal.mode === 'folder' ? 'Gewählt' : 'Standard'}</div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 8 }}>
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
                        <div style={{ 
                          background: isDifferent ? 'rgba(255, 193, 7, 0.15)' : 'transparent',
                          padding: '4px 8px',
                          borderRadius: 4,
                          textAlign: 'center',
                          fontWeight: 600,
                          border: isDifferent ? '1px solid rgba(255, 193, 7, 0.3)' : 'none'
                        }}>
                          {current}
                        </div>
                        <div style={{ 
                          background: isDifferent ? 'rgba(33, 150, 243, 0.15)' : 'transparent',
                          padding: '4px 8px',
                          borderRadius: 4,
                          textAlign: 'center',
                          border: isDifferent ? '1px solid rgba(33, 150, 243, 0.3)' : 'none'
                        }}>
                          {target || '0'}
                        </div>
                      </React.Fragment>
                    )
                  })
                })()}
                {Object.keys(compareModal.currentCounts).length === 0 && Object.keys(compareModal.targetCounts || {}).length === 0 && (
                  <div style={{ gridColumn: '1 / span 3' }} className="helper">Keine Tabellenstände verfügbar.</div>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
              <div className="helper" style={{ flex: 1 }}>
                {compareModal.mode === 'folder' ? (
                  compareModal.hasTargetDb ? 'Aktion wählen: Bestehende Datenbank verwenden oder aktuelle Datenbank in den Ordner kopieren.' : 'Aktion wählen: Aktuelle Datenbank in den Ordner kopieren.'
                ) : (
                  compareModal.hasTargetDb ? 'Aktion wählen: Standard-Datenbank verwenden oder aktuelle zur Standard migrieren.' : 'Aktion wählen: Aktuelle Datenbank zum Standard migrieren.'
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
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

      {err && <div style={{ color: 'var(--danger)' }}>{err}</div>}
    </div>
  )
}
