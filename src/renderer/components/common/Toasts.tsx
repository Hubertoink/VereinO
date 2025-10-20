import React from 'react'

export type Toast = { id: number; type: 'success' | 'error' | 'info'; text: string; action?: { label: string; onClick: () => void } }

export default function Toasts({ items }: { items: Toast[] }) {
  return (
    <div className="toast-container" aria-live="polite" aria-atomic="true">
      {items.map(t => (
        <div key={t.id} className={`toast ${t.type}`} role="status" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="title">{t.type === 'error' ? 'Fehler' : t.type === 'success' ? 'OK' : 'Info'}</span>
          <span style={{ flex: 1 }}>{t.text}</span>
          {t.action && (
            <button className="btn" onClick={() => t.action?.onClick?.()}>{t.action.label}</button>
          )}
        </div>
      ))}
    </div>
  )
}
