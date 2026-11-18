import React from 'react'
import { GeneralPaneProps } from '../types'
import { compressImageFileToDataUrl } from '../../../utils/imageCompression'
import { BACKGROUND_IMAGE_OPTIONS, COLOR_THEME_OPTIONS } from '../../../utils/appearanceOptions'
import { navItems, type NavKey } from '../../../utils/navItems'
import { getNavIcon } from '../../../utils/navIcons'
import { SettingsPageHeader, SettingsSection, SettingsRow } from '../components'

/**
 * GeneralPane - Darstellung & Layout Settings
 *
 * Handles:
 * - Setup wizard re-open
 * - Theme selection
 * - Navigation layout (left/top)
 */
export function GeneralPane({
  displayDensity = 'compact',
  setDisplayDensity,
  sidebarBookingActions = false,
  setSidebarBookingActions,
  navLayout,
  setNavLayout,
  navIconColorMode,
  setNavIconColorMode,
  colorTheme,
  setColorTheme,
  notify,
  openSetupWizard,
  visibleNavItems,
  setVisibleNavItems,
  backgroundImage,
  setBackgroundImage,
  backgroundImageVisibility,
  setBackgroundImageVisibility,
  customBackgroundImage,
  setCustomBackgroundImage,
  glassModals,
  setGlassModals
}: GeneralPaneProps) {
  const customBgInputRef = React.useRef<HTMLInputElement | null>(null)
  const lockedNavItems = React.useMemo(
    () => new Set<NavKey>(['Dashboard', 'Buchungen', 'Einstellungen']),
    []
  )

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
        targetBytes: TARGET_BYTES
      })

      if (result.bytes > TARGET_BYTES) {
        result = await compressImageFileToDataUrl(file, {
          maxDimension: 2048,
          targetBytes: TARGET_BYTES
        })
      }

      if (result.bytes > TARGET_BYTES) {
        notify(
          'error',
          'Bild ist nach Kompression noch zu groß. Bitte ein kleineres Bild wählen oder vorher zuschneiden.'
        )
        return
      }

      setCustomBackgroundImage(result.dataUrl)
      setBackgroundImage('custom')
      notify(
        'success',
        `Eigenes Hintergrundbild gespeichert (${Math.round(result.bytes / 1024)} KB).`
      )
    } catch (e) {
      notify('error', `Bild konnte nicht verarbeitet werden: ${String((e as any)?.message || e)}`)
    }
  }

  const handleRemoveCustomBg = () => {
    setCustomBackgroundImage(null)
    if (backgroundImage === 'custom') setBackgroundImage('none')
    notify('info', 'Eigenes Hintergrundbild entfernt.')
  }

  const toggleNavItem = (key: NavKey, checked: boolean) => {
    if (lockedNavItems.has(key)) return
    const next = checked
      ? Array.from(new Set([...visibleNavItems, key]))
      : visibleNavItems.filter((item) => item !== key)
    setVisibleNavItems(next)
  }

  return (
    <div className="settings-pane settings-page settings-preferences-page">
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
      <SettingsPageHeader
        title="Darstellung"
        description="Passe Schriftgröße, Farben, Hintergrund und Navigation an deinen Arbeitsstil an."
        meta="Änderungen werden automatisch übernommen."
      />
      <SettingsSection
        title="Schriftgröße & Abstände"
        description="Gilt für alle Bereiche und Fenster auf diesem Gerät."
      >
        <SettingsRow
          title="Darstellungsgröße"
          description="Mit Kompakt passen mehr Einträge ins Fenster. Standard zeigt größere Schrift und lässt mehr Abstand."
        >
          <div className="settings-density-options" role="group" aria-label="Darstellungsgröße">
            <button
              type="button"
              className={`btn ${displayDensity === 'compact' ? 'primary' : ''}`}
              aria-pressed={displayDensity === 'compact'}
              onClick={() => setDisplayDensity('compact')}
            >Kompakt</button>
            <button
              type="button"
              className={`btn ${displayDensity === 'standard' ? 'primary' : ''}`}
              aria-pressed={displayDensity === 'standard'}
              onClick={() => setDisplayDensity('standard')}
            >Standard</button>
          </div>
        </SettingsRow>
        <div className="settings-density-preview" aria-label="Vorschau der Darstellungsgröße">
          <strong>Mitgliedsbeitrag</strong>
          <span>Max Mustermann · Bank</span>
          <b>25,00 €</b>
        </div>
      </SettingsSection>
      <SettingsSection
        title="Farben & Hintergrund"
        description="Diese Einstellungen werden pro Organisation gespeichert."
      >
        {/* Visual Theme Picker */}
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

        {/* Visual Background Picker */}
        <div className="field" style={{ marginTop: 20 }}>
          <label>Hintergrundbild</label>
          <div className="bg-picker-grid">
            {BACKGROUND_IMAGE_OPTIONS.filter((option) => option.id !== 'custom').map((option) => (
              <button
                key={option.id}
                type="button"
                className={`bg-card ${backgroundImage === option.id ? 'active' : ''}`}
                onClick={() => setBackgroundImage(option.id)}
                aria-pressed={backgroundImage === option.id}
              >
                <div className={`bg-card__preview bg-card__preview--${option.id}`}>
                  {option.id === 'none' && <span>-</span>}
                </div>
                <span className="bg-card__name">{option.name}</span>
              </button>
            ))}
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
                style={
                  customBackgroundImage
                    ? { backgroundImage: `url(${customBackgroundImage})` }
                    : undefined
                }
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
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                        <path d="m15 5 4 4" />
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
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M3 6h18" />
                        <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                        <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>
              <span className="bg-card__name">Eigenes</span>
            </div>
          </div>
        </div>

        <SettingsRow
          title="Bildsichtbarkeit"
          description="Regelt, wie deutlich das Bild hinter den Arbeitsflächen erscheint."
          htmlFor="background-image-visibility"
        >
          <input
            id="background-image-visibility"
            className="background-visibility-slider"
            type="range"
            min="10"
            max="100"
            step="5"
            value={backgroundImageVisibility}
            disabled={backgroundImage === 'none'}
            onChange={(event) => setBackgroundImageVisibility(Number(event.target.value))}
          />
          <output htmlFor="background-image-visibility">{backgroundImageVisibility} %</output>
        </SettingsRow>
        <SettingsRow
          title="Glaseffekt (Blur)"
          description="Transparente Fenster mit Unschärfe-Effekt."
          htmlFor="toggle-glass-modals"
        >
          <div className="glass-toggle-preview" data-enabled={glassModals} aria-hidden="true">
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
        </SettingsRow>
      </SettingsSection>

      <SettingsSection
        title="Navigation"
        description="Bestimme Position und sichtbare Bereiche der Hauptnavigation."
      >
        <div className="settings-layout-stack">
          <section className="settings-layout-panel">
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

              {navLayout === 'left' && <label className="settings-toggle-card" htmlFor="toggle-sidebar-booking-actions">
                <span className="settings-toggle-card__copy">
                  <strong>Buchungsaktionen in der Seitenleiste</strong>
                  <span>Buchung erstellen, KI-Buchung und Batch über den Einstellungen anzeigen – auch bei eingeklappter Navigation.</span>
                </span>
                <input id="toggle-sidebar-booking-actions" role="switch" className="toggle" type="checkbox" checked={sidebarBookingActions}
                  onChange={event => setSidebarBookingActions?.(event.target.checked)} />
              </label>}

              <label className="settings-toggle-card" htmlFor="toggle-menu-icons">
                <span className="settings-toggle-card__copy">
                  <strong>Farbige Menüicons</strong>
                  <span>
                    Hebt Menüpunkte mit farbigen Symbolen hervor. Aus zeigt Icons neutral.
                  </span>
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

            <div className="settings-layout-control settings-nav-visibility-control">
              <div className="settings-layout-label-row">
                <label>Reiterleiste</label>
                <span>
                  Bestimme, welche Hauptbereiche in der Navigation dieser Organisation sichtbar
                  sind.
                </span>
              </div>
              <div className="settings-nav-visibility-grid">
                {navItems.map((item) => {
                  const locked = lockedNavItems.has(item.key)
                  const checked = locked || visibleNavItems.includes(item.key)
                  return (
                    <label
                      key={item.key}
                      className={`settings-nav-visibility-item ${locked ? 'is-locked' : ''}`}
                    >
                      <span
                        className={`settings-nav-visibility-icon ${navIconColorMode === 'color' ? `icon-color-${item.key}` : ''}`}
                      >
                        {getNavIcon(item.key)}
                      </span>
                      <span>{item.label}</span>
                      <input
                        type="checkbox"
                        className="toggle"
                        checked={checked}
                        disabled={locked}
                        onChange={(event) => toggleNavItem(item.key, event.target.checked)}
                        aria-label={`${item.label} in Navigation anzeigen`}
                      />
                    </label>
                  )
                })}
              </div>
            </div>
          </section>
        </div>
      </SettingsSection>

      <details className="settings-disclosure">
        <summary>Einrichtungsassistent</summary>
        <p className="helper">Organisation, Darstellung und Tags gemeinsam einrichten.</p>
        <button className="btn" onClick={() => openSetupWizard?.()}>
          Setup erneut öffnen…
        </button>
      </details>
    </div>
  )
}
