import { useEffect, useState } from 'react'
import { SettingsRow, SettingsSection } from './SettingsSection'
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
    <SettingsSection
      title="Belegwidget"
      description="Ein kleiner Tropfen am Bildschirmrand. Ziehe ein PDF oder Bild darauf, um die Erfassung zu öffnen."
    >
      <SettingsRow
        title="Am Bildschirmrand ablegen"
        description="Den Tropfen an die gewünschte Position ziehen. Er bleibt am linken oder rechten Rand und klappt bei Dateien automatisch auf."
      >
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
      </SettingsRow>
      <SettingsRow
        title="Beim Anmelden automatisch starten"
        description={
          autostart?.reason || 'Öffnet nur den Tropfen. Das Hauptfenster bleibt im Hintergrund.'
        }
        htmlFor="receipt-widget-autostart"
      >
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
      </SettingsRow>
      <p className="helper">
        Solange das Widget geöffnet ist, bleibt VereinO auch nach dem Schließen des Hauptfensters
        erreichbar. Das Kreuz am Widget blendet den Tropfen aus und holt VereinO zurück.
      </p>
    </SettingsSection>
  )
}
