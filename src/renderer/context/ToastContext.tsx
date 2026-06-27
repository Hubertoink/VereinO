import React, { useState, useCallback, useRef } from 'react'
import { ToastContext, type ToastType } from './ToastContextCore'

interface Toast {
  id: number
  type: ToastType
  text: string
  action?: { label: string; onClick: () => void }
  closing?: boolean
}

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(0)

  const notify = useCallback(
    (type: ToastType, text: string, ms = 4000, action?: { label: string; onClick: () => void }) => {
      const id = ++nextId.current
      const exitMs = 180
      setToasts(prev => [...prev, { id, type, text, action, closing: false }])
      const closeIn = Math.max(0, ms - exitMs)
      setTimeout(() => {
        setToasts(prev => prev.map(t => (t.id === id ? { ...t, closing: true } : t)))
      }, closeIn)
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), ms)
    },
    []
  )

  return (
    <ToastContext.Provider value={{ notify }}>
      {children}
      <div className="toast-container">
        {toasts.map(t => (
          <div
            key={t.id}
            className={`toast ${t.type}${t.closing ? ' closing' : ''}`}
            role={t.type === 'error' || t.type === 'warn' ? 'alert' : 'status'}
          >
            <span>{t.text}</span>
            {t.action && (
              <button className="btn ghost sm" onClick={t.action.onClick}>
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
