import React from 'react'

type UpdateState = {
  status: 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'not-available' | 'error' | 'unsupported'
  currentVersion: string
  availableVersion: string | null
  downloadedVersion: string | null
  downloadProgress: number | null
  message: string | null
}

type Props = {
  notify: (type: 'success' | 'error' | 'info', text: string, ms?: number) => void
}

const EMPTY_STATE: UpdateState = {
  status: 'idle', currentVersion: '', availableVersion: null,
  downloadedVersion: null, downloadProgress: null, message: null,
}

export function UpdatesPane({ notify }: Props) {
  const [appVersion, setAppVersion] = React.useState('')
  const [updateState, setUpdateState] = React.useState<UpdateState>(EMPTY_STATE)
  const [autoUpdateCheck, setAutoUpdateCheck] = React.useState(true)

  React.useEffect(() => {
    let alive = true
    void window.api?.app?.version?.().then((res) => { if (alive) setAppVersion(res?.version || '') }).catch(() => {})
    void window.api?.updates?.getState?.().then((state) => { if (alive && state) setUpdateState(state) }).catch(() => {})
    void window.api?.settings?.get?.({ key: 'updates.autoCheck' }).then((res) => { if (alive) setAutoUpdateCheck(res?.value !== false) }).catch(() => {})
    const off = window.api?.updates?.onStateChanged?.((state) => { if (alive && state) setUpdateState(state) })
    return () => { alive = false; if (typeof off === 'function') off() }
  }, [])

  const checkForUpdates = async () => {
    try {
      const state = await window.api?.updates?.check?.()
      if (state) setUpdateState(state)
      if (state?.status === 'unsupported') notify('info', state.message || 'Updates sind in der Entwicklungsumgebung nicht verfügbar.')
    } catch (e) { notify('error', `Update-Prüfung fehlgeschlagen: ${String((e as any)?.message || e)}`) }
  }

  const downloadUpdate = async () => {
    try {
      const state = await window.api?.updates?.download?.()
      if (state) setUpdateState(state)
    } catch (e) { notify('error', `Update-Download fehlgeschlagen: ${String((e as any)?.message || e)}`) }
  }

  const installUpdate = async () => {
    try {
      const res = await window.api?.updates?.install?.()
      if (!res?.ok) notify('info', res?.state?.message || 'Es ist kein installierbares Update vorhanden.')
    } catch (e) { notify('error', `Update-Installation fehlgeschlagen: ${String((e as any)?.message || e)}`) }
  }

  const toggleAutoUpdateCheck = async (enabled: boolean) => {
    setAutoUpdateCheck(enabled)
    try {
      await window.api?.settings?.set?.({ key: 'updates.autoCheck', value: enabled })
      notify('info', enabled ? 'Automatische Update-Hinweise aktiviert.' : 'Automatische Update-Hinweise deaktiviert.')
    } catch (e) {
      setAutoUpdateCheck(!enabled)
      notify('error', `Update-Einstellung konnte nicht gespeichert werden: ${String((e as any)?.message || e)}`)
    }
  }

  return (
    <div className="settings-pane">
      <div className="card settings-pane-card">
        <div className="settings-title"><span aria-hidden="true">⬇️</span> <strong>Updates</strong></div>
        <div className="settings-sub">Installierte Version: {appVersion || updateState.currentVersion || 'unbekannt'}</div>
        <div className="settings-inline-toggle" style={{ marginTop: 10 }}>
          <label htmlFor="toggle-auto-update-check">Bei jedem Start nach Updates suchen</label>
          <input id="toggle-auto-update-check" role="switch" aria-checked={autoUpdateCheck} className="toggle" type="checkbox" checked={autoUpdateCheck} onChange={(e) => { void toggleAutoUpdateCheck(e.target.checked) }} />
        </div>
        {updateState.message && <div className="helper" style={{ marginTop: 8 }}>{updateState.message}{updateState.status === 'downloading' && typeof updateState.downloadProgress === 'number' ? ` (${updateState.downloadProgress}%)` : ''}</div>}
        <div className="settings-pane-actions flex gap-8" style={{ marginTop: 12, flexWrap: 'wrap' }}>
          <button className="btn" onClick={() => { void checkForUpdates() }} disabled={updateState.status === 'checking' || updateState.status === 'downloading'}>
            {updateState.status === 'checking' ? 'Suche läuft…' : updateState.status === 'downloading' ? 'Download läuft…' : 'Nach Updates suchen'}
          </button>
          {updateState.status === 'available' && <button className="btn primary" onClick={() => { void downloadUpdate() }}>Download starten</button>}
          {updateState.status === 'downloaded' && <button className="btn primary" onClick={() => { void installUpdate() }}>Update installieren</button>}
        </div>
      </div>
    </div>
  )
}
