import React from 'react'
import { GeneralPaneProps } from '../types'
import { compressImageFileToDataUrl } from '../../../utils/imageCompression'
import HoverTooltip from '../../../components/common/HoverTooltip'

/**
 * GeneralPane - Darstellung & Layout Settings
 *
 * Handles:
 * - Setup wizard re-open
 * - Theme selection
 * - Navigation layout (left/top)
 * - Journal row style & density
 * - Date format
 */
export function GeneralPane({
  journalRowStyle,
  setJournalRowStyle,
  journalRowDensity,
  setJournalRowDensity,
  navLayout,
  setNavLayout,
  sidebarCollapsed,
  setSidebarCollapsed,
  navIconColorMode,
  setNavIconColorMode,
  colorTheme,
  setColorTheme,
  journalLimit,
  setJournalLimit,
  dateFmt,
  setDateFmt,
  notify,
  openSetupWizard,
  showBookingDraftTabs,
  setShowBookingDraftTabs,
  showBookingEditTabs,
  setShowBookingEditTabs,
  bookingsOpenDetached,
  setBookingsOpenDetached,
  allowVoucherDeletion,
  setAllowVoucherDeletion,
  quickAddAfterSave,
  setQuickAddAfterSave,
  backgroundImage,
  setBackgroundImage,
  customBackgroundImage,
  setCustomBackgroundImage,
  glassModals,
  setGlassModals,
}: GeneralPaneProps) {
  // Date format examples
  const sample = '2025-01-15'
  const pretty = '15. Jan 2025'
  const dot = '15.01.2025'
  const customBgInputRef = React.useRef<HTMLInputElement | null>(null)

  const openCustomBgPicker = () => {
    customBgInputRef.current?.click()
  }

  const handleCustomBgUpload = async (file: File) => {
    // Guardrail: don't attempt to load extremely large files
    const MAX_FILE_BYTES = 25 * 1024 * 1024
    if (file.size > MAX_FILE_BYTES) {
      notify('error', 'Bitte ein kleineres Bild auswählen (max. 25 MB).')
      return
    }

    try {
      // Keep this comfortably below common storage / IPC payload sizes.
      // Two-pass approach: try higher quality first, then fall back to smaller.
      const TARGET_BYTES = 1_200_000

      let result = await compressImageFileToDataUrl(file, {
        maxDimension: 2800,
        targetBytes: TARGET_BYTES,
      })

      if (result.bytes > TARGET_BYTES) {
        result = await compressImageFileToDataUrl(file, {
          maxDimension: 2048,
          targetBytes: TARGET_BYTES,
        })
      }

      if (result.bytes > TARGET_BYTES) {
        notify('error', 'Bild ist nach Kompression noch zu groß. Bitte ein kleineres Bild wählen oder vorher zuschneiden.')
        return
      }

      setCustomBackgroundImage(result.dataUrl)
      setBackgroundImage('custom')
      notify('success', `Eigenes Hintergrundbild gespeichert (${Math.round(result.bytes / 1024)} KB).`)
    } catch (e) {
      notify('error', `Bild konnte nicht verarbeitet werden: ${String((e as any)?.message || e)}`)
    }
  }

  const handleRemoveCustomBg = () => {
    setCustomBackgroundImage(null)
    if (backgroundImage === 'custom') setBackgroundImage('none')
    notify('info', 'Eigenes Hintergrundbild entfernt.')
  }

  return (
    <div className="settings-pane">
      <input
        ref={customBgInputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        aria-label="Eigenes Hintergrundbild auswählen"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void handleCustomBgUpload(file)
          e.currentTarget.value = ''
        }}
      />
      {/* Setup (Erststart) – Reopen wizard */}
      <div className="card settings-pane-card">
        <div className="settings-title">
          <span aria-hidden="true">✨</span> <strong>Setup (Erststart)</strong>
        </div>
        <div className="settings-sub">
          Öffne den Einrichtungs-Assistenten erneut, um Organisation, Darstellung und Tags schnell zu konfigurieren.
        </div>
        <div className="settings-pane-actions">
          <button className="btn" onClick={() => openSetupWizard?.()}>
            Setup erneut öffnen…
          </button>
        </div>
      </div>

      {/* Cluster: Farbschema & Design - organization-specific */}
      <div className="card settings-card settings-pane-card">
        <div className="settings-title">
          <span aria-hidden="true">🎨</span> <strong>Farbschema & Design</strong>
        </div>
        <div className="settings-sub">
          Diese Einstellungen werden pro Organisation gespeichert.
        </div>

        {/* Visual Theme Picker */}
        <div className="field" style={{ marginTop: 16 }}>
          <label>Farb-Theme</label>
          <div className="theme-picker-grid">
            {[
              { id: 'default', name: 'Standard', mode: 'auto' },
              { id: 'fiery-ocean', name: 'Fiery Ocean', mode: 'dark' },
              { id: 'peachy-delight', name: 'Peachy Delight', mode: 'dark' },
              { id: 'pastel-dreamland', name: 'Pastel Dreamland', mode: 'dark' },
              { id: 'ocean-breeze', name: 'Ocean Breeze', mode: 'dark' },
              { id: 'earthy-tones', name: 'Earthy Tones', mode: 'dark' },
              { id: 'monochrome-harmony', name: 'Monochrome', mode: 'dark' },
              { id: 'vintage-charm', name: 'Vintage Charm', mode: 'dark' },
              { id: 'soft-blush', name: 'Soft Blush', mode: 'light' },
              { id: 'professional-light', name: 'Professional', mode: 'light' },
            ].map((theme) => (
              <button
                key={theme.id}
                type="button"
                className={`theme-card ${colorTheme === theme.id ? 'active' : ''}`}
                onClick={() => setColorTheme(theme.id as any)}
                aria-pressed={colorTheme === theme.id}
                title={theme.name}
              >
                <div className="theme-card__swatch" data-theme={theme.id} />
                <span className="theme-card__name">{theme.name}</span>
                <span className="theme-card__mode">
                  {theme.mode === 'dark' ? '●' : theme.mode === 'light' ? '○' : '◐'}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Visual Background Picker */}
        <div className="field" style={{ marginTop: 20 }}>
          <label>Hintergrundbild</label>
          <div className="bg-picker-grid">
            {/* None */}
            <button
              type="button"
              className={`bg-card ${backgroundImage === 'none' ? 'active' : ''}`}
              onClick={() => setBackgroundImage('none')}
              aria-pressed={backgroundImage === 'none'}
            >
              <div className="bg-card__preview bg-card__preview--none">
                <span>—</span>
              </div>
              <span className="bg-card__name">Keins</span>
            </button>
            {/* Cherry Blossom */}
            <button
              type="button"
              className={`bg-card ${backgroundImage === 'cherry-blossom' ? 'active' : ''}`}
              onClick={() => setBackgroundImage('cherry-blossom')}
              aria-pressed={backgroundImage === 'cherry-blossom'}
            >
              <div className="bg-card__preview bg-card__preview--cherry-blossom" />
              <span className="bg-card__name">🌸 Kirschblüten</span>
            </button>
            {/* Foggy Forest */}
            <button
              type="button"
              className={`bg-card ${backgroundImage === 'foggy-forest' ? 'active' : ''}`}
              onClick={() => setBackgroundImage('foggy-forest')}
              aria-pressed={backgroundImage === 'foggy-forest'}
            >
              <div className="bg-card__preview bg-card__preview--foggy-forest" />
              <span className="bg-card__name">🌲 Nebliger Wald</span>
            </button>
            {/* Mountain Snow */}
            <button
              type="button"
              className={`bg-card ${backgroundImage === 'mountain-snow' ? 'active' : ''}`}
              onClick={() => setBackgroundImage('mountain-snow')}
              aria-pressed={backgroundImage === 'mountain-snow'}
            >
              <div className="bg-card__preview bg-card__preview--mountain-snow" />
              <span className="bg-card__name">🏔️ Schneeberge</span>
            </button>
            {/* Custom */}
            <div
              role="button"
              tabIndex={0}
              className={`bg-card ${backgroundImage === 'custom' ? 'active' : ''}`}
              onClick={() => {
                if (customBackgroundImage) {
                  setBackgroundImage('custom')
                } else {
                  openCustomBgPicker()
                }
              }}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return
                event.preventDefault()
                if (customBackgroundImage) setBackgroundImage('custom')
                else openCustomBgPicker()
              }}
              aria-pressed={backgroundImage === 'custom'}
            >
              <div
                className="bg-card__preview bg-card__preview--custom"
                style={customBackgroundImage ? { backgroundImage: `url(${customBackgroundImage})` } : undefined}
              >
                {!customBackgroundImage && <span>＋</span>}
                {/* Overlay icons for change/remove when image exists */}
                {customBackgroundImage && (
                  <div className="bg-card__overlay">
                    <button
                      type="button"
                      className="bg-card__icon-btn"
                      aria-label="Bild ändern"
                      onClick={(e) => {
                        e.stopPropagation()
                        openCustomBgPicker()
                      }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
                        <path d="m15 5 4 4"/>
                      </svg>
                    </button>
                    <button
                      type="button"
                      className="bg-card__icon-btn bg-card__icon-btn--danger"
                      aria-label="Bild entfernen"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleRemoveCustomBg()
                      }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>
                        <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
                      </svg>
                    </button>
                  </div>
                )}
              </div>
              <span className="bg-card__name">🖼️ Eigenes</span>
            </div>
          </div>
        </div>

        {/* Glass effect toggle - inline with preview */}
        <div className="field" style={{ marginTop: 20 }}>
          <div className="glass-toggle-row">
            <div className="glass-toggle-info">
              <label htmlFor="toggle-glass-modals">Glaseffekt (Blur)</label>
              <span className="helper">Transparente Fenster mit Unschärfe-Effekt</span>
            </div>
            <div className="glass-toggle-preview" data-enabled={glassModals}>
              <div className="glass-toggle-preview__window" />
            </div>
            <input
              id="toggle-glass-modals"
              role="switch"
              aria-checked={glassModals}
              className="toggle"
              type="checkbox"
              checked={glassModals}
              onChange={(e) => setGlassModals(e.target.checked)}
            />
          </div>
        </div>
      </div>

      {/* Cluster: Navigation & Layout */}
      <div className="card settings-card settings-pane-card">
        <div className="settings-title">
          <span aria-hidden="true">🧭</span> <strong>Navigation & Layout</strong>
        </div>
        <div className="settings-sub">Steuere, wie du dich durch die App bewegst und wie dicht Buchungen angezeigt werden.</div>

        <div className="settings-layout-stack">
          <section className="settings-layout-panel">
            <div>
              <div className="settings-layout-kicker">Navigation</div>
              <h3>Menüführung</h3>
              <p>Position und Farbigkeit der Hauptnavigation.</p>
            </div>

            <div className="settings-layout-grid">
              <div className="settings-layout-control">
                <div className="settings-layout-label-row">
                  <label>Menü-Layout</label>
                  <span>Bestimmt, ob die Hauptnavigation links oder oben sitzt.</span>
                </div>
                <div className="btn-group">
                  <button
                    type="button"
                    className={`btn-option ${navLayout === 'left' ? 'active' : ''}`}
                    onClick={() => setNavLayout('left')}
                  >
                    Links
                  </button>
                  <button
                    type="button"
                    className={`btn-option ${navLayout === 'top' ? 'active' : ''}`}
                    onClick={() => setNavLayout('top')}
                  >
                    Oben
                  </button>
                </div>
              </div>

              <label className="settings-toggle-card" htmlFor="toggle-menu-icons">
                <span className="settings-toggle-card__copy">
                  <strong>Farbige Menüicons</strong>
                  <span>Hebt Menüpunkte mit farbigen Symbolen hervor. Aus zeigt Icons neutral.</span>
                </span>
                <input
                  id="toggle-menu-icons"
                  role="switch"
                  aria-checked={navIconColorMode === 'color'}
                  className="toggle"
                  type="checkbox"
                  checked={navIconColorMode === 'color'}
                  onChange={(e) => setNavIconColorMode(e.target.checked ? 'color' : 'mono')}
                />
              </label>
            </div>
          </section>

          <section className="settings-layout-panel">
            <div>
              <div className="settings-layout-kicker">Buchungstabelle</div>
              <h3>Lesbarkeit</h3>
              <p>Darstellung der Zeilen in der Buchungsübersicht.</p>
            </div>

            <div className="settings-layout-grid">
              <div className="settings-layout-control">
                <div className="settings-layout-label-row">
                  <label>Zeilenhöhe</label>
                  <span>Normal für mehr Luft, kompakt für mehr Buchungen auf einmal.</span>
                </div>
                <div className="btn-group">
                  <button
                    type="button"
                    className={`btn-option ${journalRowDensity === 'normal' ? 'active' : ''}`}
                    onClick={() => setJournalRowDensity('normal')}
                  >
                    Normal
                  </button>
                  <button
                    type="button"
                    className={`btn-option ${journalRowDensity === 'compact' ? 'active' : ''}`}
                    onClick={() => setJournalRowDensity('compact')}
                  >
                    Kompakt
                  </button>
                </div>
              </div>

              <div className="settings-layout-control">
                <div className="settings-layout-label-row">
                  <label htmlFor="select-row-style">Zeilenlayout</label>
                  <span>Linien und Zebra-Muster trennen Buchungen optisch.</span>
                </div>
                <select id="select-row-style" className="input" value={journalRowStyle} onChange={(e) => setJournalRowStyle(e.target.value as any)}>
                  <option value="both">Linien + Zebra</option>
                  <option value="lines">Nur Linien</option>
                  <option value="zebra">Nur Zebra</option>
                  <option value="none">Ohne Linien/Zebra</option>
                </select>
              </div>
            </div>
          </section>

          <section className="settings-layout-panel">
            <div>
              <div className="settings-layout-kicker">Buchungsfenster</div>
              <h3>Arbeitsweise</h3>
              <p>Verhalten beim Erfassen, Speichern und Korrigieren von Buchungen.</p>
            </div>

            <div className="settings-layout-grid settings-layout-grid--wide">
              <label className="settings-toggle-card" htmlFor="toggle-booking-draft-tabs">
                <span className="settings-toggle-card__copy">
                  <strong>Buchungsreiter</strong>
                  <span>Zeigt mehrere offene Buchungsentwürfe als Reiter im Buchungsfenster.</span>
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

              <label className={`settings-toggle-card ${!allowVoucherDeletion ? 'is-disabled' : ''}`} htmlFor="toggle-booking-edit-tabs">
                <span className="settings-toggle-card__copy">
                  <strong>Bearbeitungen als Reiter</strong>
                  <span>{allowVoucherDeletion ? 'Hält mehrere geöffnete Buchungen beim Bearbeiten im Hauptfenster als eigene Reiter bereit.' : 'Nur verfügbar, wenn Buchungen endgültig löschen aktiviert ist.'}</span>
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

              <label className="settings-toggle-card" htmlFor="toggle-bookings-open-detached">
                <span className="settings-toggle-card__copy">
                  <strong>Eigenes Buchungsfenster</strong>
                  <span>Öffnet neue und bearbeitete Buchungen in einem separaten Fenster.</span>
                </span>
                <input
                  id="toggle-bookings-open-detached"
                  role="switch"
                  aria-checked={bookingsOpenDetached}
                  className="toggle"
                  type="checkbox"
                  checked={bookingsOpenDetached}
                  onChange={(e) => setBookingsOpenDetached(e.target.checked)}
                />
              </label>

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
                    <label htmlFor="toggle-voucher-delete-mode" className="settings-toggle-card__label">Buchungen endgültig löschen</label>
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
      </div>

      {/* Cluster 2: Anzeige & Lesbarkeit */}
      <div className="card settings-card settings-pane-card">
        <div className="settings-title">
          <span aria-hidden="true">🔎</span> <strong>Anzeige & Lesbarkeit</strong>
        </div>
        <div className="settings-sub">Kontrolliere Anzahl und Darstellung zentraler Informationen.</div>
        <div className="settings-row-2col" style={{ marginTop: 12 }}>
          <div className="field">
            <label>Buchungen: Anzahl der Einträge</label>
            <div className="btn-group">
              <button
                type="button"
                className={`btn-option ${journalLimit === 20 ? 'active' : ''}`}
                onClick={() => setJournalLimit(20)}
              >
                20
              </button>
              <button
                type="button"
                className={`btn-option ${journalLimit === 50 ? 'active' : ''}`}
                onClick={() => setJournalLimit(50)}
              >
                50
              </button>
              <button
                type="button"
                className={`btn-option ${journalLimit === 100 ? 'active' : ''}`}
                onClick={() => setJournalLimit(100)}
              >
                100
              </button>
            </div>
          </div>
          <div className="field">
            <label>Datumsformat</label>
            <div className="btn-group">
              <button
                type="button"
                className={`btn-option ${dateFmt === 'ISO' ? 'active' : ''}`}
                onClick={() => setDateFmt('ISO')}
              >
                {sample}
              </button>
              <button
                type="button"
                className={`btn-option ${dateFmt === 'PRETTY' ? 'active' : ''}`}
                onClick={() => setDateFmt('PRETTY')}
              >
                {pretty}
              </button>
              <button
                type="button"
                className={`btn-option ${dateFmt === 'DOT' ? 'active' : ''}`}
                onClick={() => setDateFmt('DOT')}
              >
                {dot}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

