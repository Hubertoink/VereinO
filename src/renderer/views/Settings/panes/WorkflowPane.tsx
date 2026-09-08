import type { WorkflowPaneProps } from '../types'
import HoverTooltip from '../../../components/common/HoverTooltip'
import ReceiptWidgetSettings from '../components/ReceiptWidgetSettings'

export function WorkflowPane({
  bookingView,
  setBookingView,
  showBookingDraftTabs,
  setShowBookingDraftTabs,
  showBookingEditTabs,
  setShowBookingEditTabs,
  bookingEntryPresentation,
  setBookingEntryPresentation,
  allowVoucherDeletion,
  setAllowVoucherDeletion,
  quickAddAfterSave,
  setQuickAddAfterSave,
  notify
}: WorkflowPaneProps) {
  return (
    <div className="settings-workflow-pane">
      <div className="card settings-card settings-pane-card">
        <section className="settings-layout-panel">
          <div>
            <div className="settings-layout-kicker">Buchungsfenster</div>
            <h3>Arbeitsweise</h3>
            <p>Verhalten beim Erfassen, Speichern und Korrigieren von Buchungen.</p>
          </div>

          <div className="settings-layout-grid settings-layout-grid--wide">
            <div className="settings-layout-control">
              <div className="settings-layout-label-row">
                <label>Buchungsansicht</label>
                <span>Wähle die Buchungsseite für Navigation und Verweise auf Buchungen.</span>
              </div>
              <div className="btn-group" role="group" aria-label="Buchungsansicht">
                <button type="button" className={`btn-option ${bookingView === 'classic' ? 'active' : ''}`} aria-pressed={bookingView === 'classic'} onClick={() => setBookingView('classic')}>Buchungen (klassisch)</button>
                <button type="button" className={`btn-option ${bookingView === 'plus' ? 'active' : ''}`} aria-pressed={bookingView === 'plus'} onClick={() => setBookingView('plus')}>Buchungen Plus</button>
              </div>
              <div className="helper">{bookingView === 'plus' ? 'Kalender, Filter und Buchungsdetails nebeneinander.' : 'Kompakte Tabelle mit allen Buchungen.'}</div>
            </div>
            <label className="settings-toggle-card" htmlFor="toggle-booking-draft-tabs">
              <span className="settings-toggle-card__copy">
                <strong>Buchungsreiter</strong>
                <span>
                  {bookingEntryPresentation === 'flyout'
                    ? 'Parkt geschlossene Flyouts als Reiter. + Buchung öffnet einen weiteren Entwurf; ein Reiter holt ihn zurück.'
                    : 'Zeigt mehrere offene Buchungsentwürfe als Reiter in der Buchungsansicht.'}
                </span>
              </span>
              <input
                id="toggle-booking-draft-tabs"
                role="switch"
                aria-checked={showBookingDraftTabs}
                className="toggle"
                type="checkbox"
                checked={showBookingDraftTabs}
                onChange={(e) => setShowBookingDraftTabs(e.target.checked)}
              />
            </label>

            <label
              className={`settings-toggle-card ${!allowVoucherDeletion ? 'is-disabled' : ''}`}
              htmlFor="toggle-booking-edit-tabs"
            >
              <span className="settings-toggle-card__copy">
                <strong>Bearbeitungen als Reiter</strong>
                <span>
                  {allowVoucherDeletion
                    ? 'Hält mehrere geöffnete Buchungen beim Bearbeiten im Hauptfenster als eigene Reiter bereit.'
                    : 'Nur verfügbar, wenn Buchungen endgültig löschen aktiviert ist.'}
                </span>
              </span>
              <input
                id="toggle-booking-edit-tabs"
                role="switch"
                aria-checked={allowVoucherDeletion && showBookingEditTabs}
                className="toggle"
                type="checkbox"
                checked={allowVoucherDeletion && showBookingEditTabs}
                disabled={!allowVoucherDeletion}
                onChange={(e) => setShowBookingEditTabs(e.target.checked)}
              />
            </label>

            <div className="settings-layout-control settings-booking-presentation">
              <div className="settings-layout-label-row">
                <label>Buchungserfassung</label>
                <span>
                  Wähle zwischen vollständigem Dialog, kompaktem Flyout und eigenem Fenster.
                </span>
              </div>
              <div
                className="btn-group"
                role="group"
                aria-label="Darstellung der Buchungserfassung"
              >
                <button
                  type="button"
                  className={`btn-option ${bookingEntryPresentation === 'modal' ? 'active' : ''}`}
                  onClick={() => setBookingEntryPresentation('modal')}
                >
                  Dialog
                </button>
                <button
                  type="button"
                  className={`btn-option ${bookingEntryPresentation === 'flyout' ? 'active' : ''}`}
                  onClick={() => setBookingEntryPresentation('flyout')}
                >
                  Kompakt-Flyout
                </button>
                <button
                  type="button"
                  className={`btn-option ${bookingEntryPresentation === 'detached' ? 'active' : ''}`}
                  onClick={() => setBookingEntryPresentation('detached')}
                >
                  Eigenes Fenster
                </button>
              </div>
              <div className="helper">
                {bookingEntryPresentation === 'flyout'
                  ? 'Zeigt die wichtigsten Felder direkt an der Buchungsliste; weitere Angaben werden bei Bedarf ergänzt.'
                  : bookingEntryPresentation === 'detached'
                    ? 'Neue und bearbeitete Buchungen öffnen in einem separaten Fenster.'
                    : 'Öffnet die vollständige Buchungserfassung als Dialog im Hauptfenster.'}
              </div>
            </div>

            <div className="settings-layout-control">
              <div className="settings-layout-label-row">
                <label>Nach Speichern</label>
                <span>Was nach dem Speichern einer Buchung passieren soll.</span>
              </div>
              <div className="btn-group">
                <button
                  type="button"
                  className={`btn-option ${quickAddAfterSave === 'close' ? 'active' : ''}`}
                  onClick={() => setQuickAddAfterSave('close')}
                >
                  Schließen
                </button>
                <button
                  type="button"
                  className={`btn-option ${quickAddAfterSave === 'new' ? 'active' : ''}`}
                  onClick={() => setQuickAddAfterSave('new')}
                >
                  Neue Buchung
                </button>
              </div>
            </div>

            <div className="settings-toggle-card">
              <span className="settings-toggle-card__copy">
                <span className="settings-toggle-card__title-row">
                  <label
                    htmlFor="toggle-voucher-delete-mode"
                    className="settings-toggle-card__label"
                  >
                    Buchungen endgültig löschen
                  </label>
                  <HoverTooltip<HTMLButtonElement>
                    content="Storno ist der akzeptierte Buchungsstandard: Der Originalbeleg bleibt erhalten und eine Gegenbuchung korrigiert ihn nachvollziehbar."
                    preferredPlacement="top"
                  >
                    {({ ref, props }) => (
                      <button
                        ref={ref}
                        {...props}
                        type="button"
                        className="settings-info-icon"
                        aria-label="Info zu Storno als Buchungsstandard"
                        onClick={(e) => e.preventDefault()}
                      >
                        i
                      </button>
                    )}
                  </HoverTooltip>
                </span>
                <span>Aus nutzt Storno. Ein erlaubt das dauerhafte Entfernen von Buchungen.</span>
              </span>
              <input
                id="toggle-voucher-delete-mode"
                role="switch"
                aria-checked={allowVoucherDeletion}
                className="toggle"
                type="checkbox"
                checked={allowVoucherDeletion}
                onChange={(e) => setAllowVoucherDeletion(e.target.checked)}
              />
            </div>
          </div>
        </section>
      </div>
      <ReceiptWidgetSettings notify={notify} />
    </div>
  )
}
