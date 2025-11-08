import React from 'react'
import { ColorTheme } from '../types'

interface ThemeSelectorProps {
  value: ColorTheme
  onChange: (v: ColorTheme) => void
}

/**
 * ThemeSelector - Theme Selection with Visual Preview
 * 
 * Dropdown with color swatches showing accent colors
 */
export function ThemeSelector({ value, onChange }: ThemeSelectorProps) {
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <select 
        className="input" 
        value={value} 
        onChange={(e) => onChange(e.target.value as ColorTheme)}
      >
        <option value="default">Standard</option>
        <option value="fiery-ocean">Fiery Ocean</option>
        <option value="peachy-delight">Peachy Delight</option>
        <option value="pastel-dreamland">Pastel Dreamland</option>
        <option value="ocean-breeze">Ocean Breeze</option>
        <option value="earthy-tones">Earthy Tones</option>
        <option value="monochrome-harmony">Monochrome Harmony</option>
        <option value="vintage-charm">Vintage Charm</option>
      </select>
      
      <div className="helper">Wirkt auf Akzentfarben (Buttons, Hervorhebungen).</div>
      
      <div className="swatches" aria-label="Farbvorschau" style={{ display: 'flex', gap: 6, marginTop: 4 }}>
        <span 
          className="swatch" 
          style={{ 
            background: 'var(--bg)', 
            width: 32, 
            height: 32, 
            borderRadius: 6, 
            border: '1px solid var(--border)' 
          }} 
          title="Hintergrund" 
        />
        <span 
          className="swatch" 
          style={{ 
            background: 'var(--surface)', 
            width: 32, 
            height: 32, 
            borderRadius: 6, 
            border: '1px solid var(--border)' 
          }} 
          title="Fläche" 
        />
        <span 
          className="swatch" 
          style={{ 
            background: 'var(--accent)', 
            width: 32, 
            height: 32, 
            borderRadius: 6, 
            border: '1px solid var(--border)' 
          }} 
          title="Akzent" 
        />
      </div>
    </div>
  )
}
