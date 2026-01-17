import React from 'react'
import { GeneralPaneProps } from '../types'
import { compressImageFileToDataUrl } from '../../../utils/imageCompression'

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
  openSetupWizard,
  showSubmissionBadge,
  setShowSubmissionBadge,
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
      const result = await compressImageFileToDataUrl(file, {
        maxDimension: 3000,
        targetBytes: 2 * 1024 * 1024,
      })

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
        
        {/* Theme and Background */}
        <div className="settings-row-2col" style={{ marginTop: 12 }}>
          <div className="field">
            <label htmlFor="select-color-theme">Farb-Theme</label>
            <select id="select-color-theme" className="input" value={colorTheme} onChange={(e) => setColorTheme(e.target.value as any)}>
              <option value="default">Standard ◐</option>
              <option value="fiery-ocean">Fiery Ocean ●</option>
              <option value="peachy-delight">Peachy Delight ●</option>
              <option value="pastel-dreamland">Pastel Dreamland ●</option>
              <option value="ocean-breeze">Ocean Breeze ●</option>
              <option value="earthy-tones">Earthy Tones ●</option>
              <option value="monochrome-harmony">Monochrome Harmony ●</option>
              <option value="vintage-charm">Vintage Charm ●</option>
              <option value="soft-blush">Soft Blush ○</option>
              <option value="professional-light">Professional Light ○</option>
            </select>
            <div className="helper">● = Dark | ○ = Light</div>
          </div>
          <div className="field">
            <label htmlFor="select-background-image">Hintergrundbild</label>
            <select id="select-background-image" className="input" value={backgroundImage} onChange={(e) => setBackgroundImage(e.target.value as any)}>
              <option value="none">Kein Hintergrundbild</option>
              <option value="cherry-blossom">🌸 Kirschblüten</option>
              <option value="foggy-forest">🌲 Nebliger Wald</option>
              <option value="mountain-snow">🏔️ Schneeberge</option>
              <option value="custom">🖼️ Eigenes Bild…</option>
            </select>
            {(backgroundImage === 'custom' || !!customBackgroundImage) && (
              <div className="custom-bg-controls">
                <input
                  ref={customBgInputRef}
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) void handleCustomBgUpload(file)
                    // allow re-upload of the same file
                    e.currentTarget.value = ''
                  }}
                />
                <div className="custom-bg-row">
                  {customBackgroundImage ? (
                    <div
                      className="custom-bg-preview"
                      aria-label="Vorschau Hintergrundbild"
                      style={{ backgroundImage: `url(${customBackgroundImage})` }}
                    />
                  ) : (
                    <div className="custom-bg-preview custom-bg-preview--empty" aria-hidden="true" />
                  )}
                  <div className="custom-bg-actions">
                    <button type="button" className="btn" onClick={openCustomBgPicker}>
                      {customBackgroundImage ? 'Bild ändern…' : 'Bild auswählen…'}
                    </button>
                    {customBackgroundImage && (
                      <button type="button" className="btn btn-secondary" onClick={handleRemoveCustomBg}>
                        Entfernen
                      </button>
                    )}
                  </div>
                </div>
                <div className="helper">
                  Das Bild wird komprimiert und pro Organisation gespeichert.
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Glass effect toggle */}
        <div className="settings-row-2col" style={{ marginTop: 12 }}>
          <div className="settings-inline-toggle">
            <label htmlFor="toggle-glass-modals">Glaseffekt (Blur)</label>
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
          <div className="helper" style={{ alignSelf: 'center' }}>Transparente Fenster mit Unschärfe-Effekt</div>
        </div>
      </div>

      {/* Cluster: Navigation & Layout */}
      <div className="card settings-card settings-pane-card">
        <div className="settings-title">
          <span aria-hidden="true">🧭</span> <strong>Navigation & Layout</strong>
        </div>
        <div className="settings-sub">Passe die Darstellung deiner Menüs und Buchungstabelle an.</div>
        
        {/* Row 1: Layout options */}
        <div className="settings-row-2col" style={{ marginTop: 12 }}>
          <div className="field">
            <label>Menü-Layout</label>
            <div className="btn-group">
              <button
                type="button"
                className={`btn-option ${navLayout === 'left' ? 'active' : ''}`}
                onClick={() => setNavLayout('left')}
              >
                Links (klassisch)
              </button>
              <button
                type="button"
                className={`btn-option ${navLayout === 'top' ? 'active' : ''}`}
                onClick={() => setNavLayout('top')}
              >
                Oben (icons)
              </button>
            </div>
          </div>
          <div className="field">
            <label>Zeilenhöhe</label>
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
        </div>

        {/* Row 2: Row style */}
        <div className="settings-row-2col" style={{ marginTop: 12 }}>
          <div className="field">
            <label htmlFor="select-row-style">Buchungen: Zeilenlayout</label>
            <select id="select-row-style" className="input" value={journalRowStyle} onChange={(e) => setJournalRowStyle(e.target.value as any)}>
              <option value="both">Linien + Zebra</option>
              <option value="lines">Nur Linien</option>
              <option value="zebra">Nur Zebra</option>
              <option value="none">Ohne Linien/Zebra</option>
            </select>
          </div>
          <div className="field" />
        </div>

        {/* Row 3: Toggles in a grid */}
        <div className="settings-row-3col" style={{ marginTop: 16 }}>
          {navLayout === 'left' && (
            <div className="settings-inline-toggle">
              <label htmlFor="toggle-sidebar-compact">Kompakte Seitenleiste</label>
              <input
                id="toggle-sidebar-compact"
                role="switch"
                aria-checked={sidebarCollapsed}
                className="toggle"
                type="checkbox"
                checked={sidebarCollapsed}
                onChange={(e) => setSidebarCollapsed(e.target.checked)}
              />
            </div>
          )}
          <div className="settings-inline-toggle">
            <label htmlFor="toggle-menu-icons">Farbige Menüicons</label>
            <input
              id="toggle-menu-icons"
              role="switch"
              aria-checked={navIconColorMode === 'color'}
              className="toggle"
              type="checkbox"
              checked={navIconColorMode === 'color'}
              onChange={(e) => setNavIconColorMode(e.target.checked ? 'color' : 'mono')}
            />
          </div>
          <div className="settings-inline-toggle">
            <label htmlFor="toggle-submission-badge">Menü-Badges</label>
            <input
              id="toggle-submission-badge"
              role="switch"
              aria-checked={showSubmissionBadge}
              className="toggle"
              type="checkbox"
              checked={showSubmissionBadge}
              onChange={(e) => setShowSubmissionBadge(e.target.checked)}
            />
          </div>
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
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

