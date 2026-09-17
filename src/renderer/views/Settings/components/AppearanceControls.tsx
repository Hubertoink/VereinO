import React from 'react'
import { COLOR_THEME_OPTIONS } from '../../../utils/appearanceOptions'
import type { ColorTheme } from '../../../context/uiTheme'

/** Shared with the desktop GeneralPane so browser settings retain the same controls. */
export function ThemePicker({
  colorTheme,
  setColorTheme
}: {
  colorTheme: ColorTheme
  setColorTheme: (theme: ColorTheme) => void
}) {
  return (
    <div className="field" style={{ marginTop: 16 }}>
      <label>Farb-Theme</label>
      <div className="theme-picker-grid">
        {COLOR_THEME_OPTIONS.map((theme) => (
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
  )
}

export function NavigationControls({
  navLayout,
  setNavLayout,
  navIconColorMode,
  setNavIconColorMode
}: {
  navLayout: 'left' | 'top'
  setNavLayout: (layout: 'left' | 'top') => void
  navIconColorMode: 'color' | 'mono'
  setNavIconColorMode: (mode: 'color' | 'mono') => void
}) {
  return (
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
  )
}
