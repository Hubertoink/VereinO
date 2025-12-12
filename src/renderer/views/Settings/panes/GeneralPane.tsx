import React from 'react'
import { GeneralPaneProps } from '../types'

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
}: GeneralPaneProps) {
  // Date format examples
  const sample = '2025-01-15'
  const pretty = '15. Jan 2025'

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

      {/* Cluster 1: Darstellung & Layout */}
      <div className="card settings-card settings-pane-card">
        <div className="settings-title">
          <span aria-hidden="true">🖼️</span> <strong>Aussehen & Navigation</strong>
        </div>
        <div className="settings-sub">Passe die Darstellung deiner Buchungen und Menüs an.</div>
        
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

        {/* Row 2: Row style and Theme */}
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

