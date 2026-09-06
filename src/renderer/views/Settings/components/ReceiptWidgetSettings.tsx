import { useEffect, useState } from 'react'
import { IconDroplet } from '@tabler/icons-react'
import type { WidgetAutostart } from '../../../../../shared/receiptWidget'
import type { WorkflowPaneProps } from '../types'

export default function ReceiptWidgetSettings({ notify }: Pick<WorkflowPaneProps, 'notify'>) {
  const [autostart, setAutostart] = useState<WidgetAutostart | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    let alive = true
    void window.api.receiptWidget
      .getAutostart()
      .then((state) => {
        if (alive) setAutostart(state)
      })
      .catch(() => {
        if (alive)
          setAutostart({
            enabled: false,
            available: false,
            reason: 'Autostart-Einstellung konnte nicht geladen werden.'
          })
      })
    return () => {
      alive = false
    }
  }, [])
  async function changeAutostart(enabled: boolean) {
    setBusy(true)
    try {
      setAutostart(await window.api.receiptWidget.setAutostart(enabled))
    } catch (error) {
      notify(
        'error',
        error instanceof Error ? error.message : 'Autostart konnte nicht geändert werden.'
      )
    } finally {
      setBusy(false)
    }
  }
  return (
    <section
      className="card settings-card settings-pane-card"
      aria-labelledby="receipt-widget-settings-title"
    >
      <div className="settings-title">
        <IconDroplet size={20} />
        <strong id="receipt-widget-settings-title">Belegwidget</strong>
      </div>
      <div className="settings-sub">
        Ein kleiner Tropfen am Bildschirmrand. Ziehe ein PDF oder Bild darauf, um die Erfassung zu
        öffnen.
      </div>
      <div className="settings-layout-grid settings-layout-grid--wide">
        <div className="settings-layout-control">
          <strong>Am Bildschirmrand ablegen</strong>
          <span className="helper">
            Den Tropfen an die gewünschte Position ziehen. Er bleibt am linken oder rechten Rand und
            klappt bei Dateien automatisch auf.
          </span>
          <button
            type="button"
            className="btn"
            onClick={() => {
              void window.api.receiptWidget
                .open()
                .then((result) => {
                  if (!result.ok) throw new Error()
                })
                .catch(() => notify('error', 'Belegwidget konnte nicht geöffnet werden.'))
            }}
          >
            Belegwidget öffnen
          </button>
        </div>
        <label className="settings-toggle-card" htmlFor="receipt-widget-autostart">
          <span className="settings-toggle-card__copy">
            <strong>Beim Anmelden automatisch starten</strong>
            <span>
              {autostart?.reason ||
                'Öffnet nur den Tropfen. Das Hauptfenster bleibt im Hintergrund.'}
            </span>
          </span>
          <input
            id="receipt-widget-autostart"
            className="toggle"
            type="checkbox"
            role="switch"
            checked={autostart?.enabled ?? false}
            aria-checked={autostart?.enabled ?? false}
            disabled={busy || !autostart?.available}
            onChange={(event) => void changeAutostart(event.target.checked)}
          />
        </label>
      </div>
      <p className="helper">
        Solange das Widget geöffnet ist, bleibt VereinO auch nach dem Schließen des Hauptfensters
        erreichbar. Das Kreuz am Widget blendet den Tropfen aus und holt VereinO zurück.
      </p>
    </section>
  )
}
