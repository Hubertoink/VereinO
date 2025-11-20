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
        <div className="row">
          <div className="field">
            <label htmlFor="select-row-style">Buchungen: Zeilenlayout</label>
            <select id="select-row-style" className="input" value={journalRowStyle} onChange={(e) => setJournalRowStyle(e.target.value as any)}>
              <option value="both">Linien + Zebra</option>
              <option value="lines">Nur Linien</option>
              <option value="zebra">Nur Zebra</option>
              <option value="none">Ohne Linien/Zebra</option>
            </select>
            <div className="helper">
              "Nur Linien" entspricht der Verbindlichkeiten-Tabelle. "Zebra" hebt jede zweite Zeile leicht hervor.
            </div>
          </div>
          <div className="field">
            <label htmlFor="select-row-density">Buchungen: Zeilenhöhe</label>
            <select id="select-row-density" className="input" value={journalRowDensity} onChange={(e) => setJournalRowDensity(e.target.value as any)}>
              <option value="normal">Normal</option>
              <option value="compact">Kompakt</option>
            </select>
            <div className="helper">„Kompakt" reduziert die vertikale Polsterung der Tabellenzellen.</div>
          </div>
          <div className="field">
            <label htmlFor="select-nav-layout">Menü-Layout</label>
            <select id="select-nav-layout" className="input" value={navLayout} onChange={(e) => setNavLayout(e.target.value as 'left' | 'top')}>
              <option value="left">Links (klassisch)</option>
              <option value="top">Oben (icons)</option>
            </select>
            <div className="helper">
              „Oben" blendet die Seitenleiste aus und zeigt eine kompakte Icon-Leiste im Kopfbereich.
            </div>
          </div>
          {navLayout === 'left' && (
            <div className="field">
              <div className="label-row">
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
            </div>
          )}
          <div className="field">
            <div className="label-row">
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
            <div className="helper">Wirkt auf Akzentfarben (Buttons, Hervorhebungen). ● = Dark | ○ = Light</div>
          </div>
        </div>
      </div>

      {/* Cluster 2: Anzeige & Lesbarkeit */}
      <div className="card settings-card settings-pane-card">
        <div className="settings-title">
          <span aria-hidden="true">🔎</span> <strong>Anzeige & Lesbarkeit</strong>
        </div>
        <div className="settings-sub">Kontrolliere Anzahl und Darstellung zentraler Informationen.</div>
        <div className="row">
          <div className="field">
            <label htmlFor="select-journal-limit">Buchungen: Anzahl der Einträge</label>
            <select id="select-journal-limit" className="input" value={journalLimit} onChange={(e) => setJournalLimit(Number(e.target.value))}>
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="select-date-format">Datumsformat</label>
            <select id="select-date-format" className="input" value={dateFmt} onChange={(e) => setDateFmt(e.target.value as any)}>
              <option value="ISO">ISO (z.B. {sample})</option>
              <option value="PRETTY">Lesbar (z.B. {pretty})</option>
            </select>
            <div className="helper">Wirkt u.a. in Buchungen (Datumsspalte) und Filter-Chips.</div>
          </div>
        </div>
      </div>
    </div>
  )
}

