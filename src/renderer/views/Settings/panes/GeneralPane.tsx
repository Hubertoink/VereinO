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
            <button
              type="button"
              className={`bg-card ${backgroundImage === 'custom' ? 'active' : ''}`}
              onClick={() => {
                if (customBackgroundImage) {
                  setBackgroundImage('custom')
                } else {
                  openCustomBgPicker()
                }
              }}
              aria-pressed={backgroundImage === 'custom'}
            >
              <div
                className="bg-card__preview bg-card__preview--custom"
                style={customBackgroundImage ? { backgroundImage: `url(${customBackgroundImage})` } : undefined}
              >
                {!customBackgroundImage && <span>＋</span>}
              </div>
              <span className="bg-card__name">🖼️ Eigenes</span>
            </button>
          </div>
          {/* Custom image controls */}
          {(backgroundImage === 'custom' || !!customBackgroundImage) && (
            <div className="custom-bg-inline-controls">
              <input
                ref={customBgInputRef}
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) void handleCustomBgUpload(file)
                  e.currentTarget.value = ''
                }}
              />
              <button type="button" className="btn btn-sm" onClick={openCustomBgPicker}>
                {customBackgroundImage ? 'Ändern…' : 'Auswählen…'}
              </button>
              {customBackgroundImage && (
                <button type="button" className="btn btn-sm btn-secondary" onClick={handleRemoveCustomBg}>
                  Entfernen
                </button>
              )}
            </div>
          )}
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

