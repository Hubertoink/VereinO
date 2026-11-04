import { IconArrowsShuffle } from '@tabler/icons-react'

export default function RandomColorButton({ color, onChange, size = 32 }: {
  color?: string | null
  onChange: (color: string) => void
  size?: number
}) {
  return (
    <button
      type="button"
      className="btn"
      title="Zufällige Farbe"
      aria-label="Zufällige Farbe erzeugen"
      style={{ width: size, height: size, minWidth: size, padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8 }}
      onClick={() => {
        const previous = /^#[0-9a-f]{6}$/i.test(color || '') ? parseInt(color!.slice(1), 16) : null
        // Exclude the current color so every click changes the selection.
        let value = Math.floor(Math.random() * (previous === null ? 0x1000000 : 0xffffff))
        if (previous !== null && value >= previous) value += 1
        onChange(`#${value.toString(16).padStart(6, '0').toUpperCase()}`)
      }}
    >
      <IconArrowsShuffle size={20} aria-hidden="true" />
    </button>
  )
}
