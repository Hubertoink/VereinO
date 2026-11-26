import { useRef } from 'react'
import { IconCheck } from '@tabler/icons-react'
import type { ColKey } from '../types'

interface DnDOrderProps {
  order: ColKey[]
  cols: Record<ColKey, boolean>
  onChange: (order: ColKey[]) => void
  actionsAvailable: boolean
  onToggle: (key: ColKey) => void
  labelFor: (key: ColKey) => string
}

export function DnDOrder({ order, cols, actionsAvailable, onChange, onToggle, labelFor }: DnDOrderProps) {
  const dragging = useRef<ColKey | null>(null)
  const movable = order.filter(key => key !== 'actions')

  function move(from: ColKey, to: ColKey) {
    if (from === 'actions' || to === 'actions' || from === to) return
    const next = [...movable]
    const target = next.indexOf(to)
    next.splice(next.indexOf(from), 1)
    next.splice(target, 0, from)
    let index = 0
    onChange(order.map(key => key === 'actions' ? key : next[index++]))
  }

  return (
    <div className="settings-column-options" role="group" aria-label="Spalten">
      {order.map(key => (
        <button
          key={key}
          type="button"
          className="settings-column-pill"
          disabled={key === 'actions' && !actionsAvailable}
          aria-pressed={!!cols[key]}
          draggable={key !== 'actions'}
          title={key === 'actions'
            ? (actionsAvailable ? 'Feste Position' : 'Verfügbar, wenn das Löschen von Buchungen unter Arbeitsweise erlaubt ist')
            : 'Zum Verschieben ziehen oder Alt + Pfeil links/rechts drücken'}
          onClick={() => onToggle(key)}
          onDragStart={event => {
            dragging.current = key
            event.dataTransfer.effectAllowed = 'move'
            event.dataTransfer.setData('text/plain', labelFor(key))
          }}
          onDragEnd={() => { dragging.current = null }}
          onDragOver={event => {
            if (dragging.current && key !== 'actions') event.preventDefault()
          }}
          onDrop={event => {
            event.preventDefault()
            if (dragging.current) move(dragging.current, key)
            dragging.current = null
          }}
          onKeyDown={event => {
            if (!event.altKey || key === 'actions') return
            if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
            event.preventDefault()
            const offset = event.key === 'ArrowLeft' ? -1 : 1
            const target = movable[movable.indexOf(key) + offset]
            if (target) move(key, target)
          }}
        >
          {cols[key] && <IconCheck size={14} stroke={2.4} aria-hidden="true" />}
          {labelFor(key)}
        </button>
      ))}
    </div>
  )
}
