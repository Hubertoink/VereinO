import React, { useRef } from 'react'

interface DnDOrderProps {
  order: string[]
  cols: Record<string, boolean>
  onChange: (o: string[]) => void
  labelFor: (k: string) => string
}

/**
 * DnDOrder - Drag & Drop Component for Column Reordering
 * 
 * Allows users to reorder table columns via drag and drop
 * Visually indicates hidden columns with reduced opacity
 */
export function DnDOrder({ order, cols, onChange, labelFor }: DnDOrderProps) {
  const dragIndex = useRef<number | null>(null)

  function onDragStart(e: React.DragEvent<HTMLDivElement>, idx: number) {
    dragIndex.current = idx
    e.dataTransfer.effectAllowed = 'move'
  }

  function onDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>, idx: number) {
    e.preventDefault()
    const from = dragIndex.current
    dragIndex.current = null
    if (from == null || from === idx) return
    const next = order.slice()
    const [moved] = next.splice(from, 1)
    next.splice(idx, 0, moved)
    onChange(next)
  }

  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
      {order.map((k, idx) => {
        const visible = !!cols[k]
        return (
          <div
            key={k}
            draggable
            onDragStart={(e) => onDragStart(e, idx)}
            onDragOver={onDragOver}
            onDrop={(e) => onDrop(e, idx)}
            title={visible ? 'Sichtbar' : 'Ausgeblendet – Reihenfolge bleibt erhalten'}
            style={{
              padding: '4px 8px',
              borderRadius: 6,
              border: '1px solid var(--border)',
              background: visible ? 'var(--surface)' : 'color-mix(in oklab, var(--surface) 60%, transparent)',
              opacity: visible ? 1 : 0.6,
              cursor: 'grab',
              userSelect: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6
            }}
          >
            <span aria-hidden>☰</span>
            <span>{labelFor(k)}</span>
          </div>
        )
      })}
    </div>
  )
}
