import React, { useState, useCallback, useRef } from 'react'
import { ToastContext, type ToastType } from './ToastContextCore'
import { IconLoader2 } from '@tabler/icons-react'

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
  const [progressToasts, setProgressToasts] = useState<Record<string, string>>({})
  const setProgressToast = useCallback((id: string, text: string | null) => {
    setProgressToasts(previous => {
      const next = { ...previous }
      if (text === null) delete next[id]
      else next[id] = text
      return next
    })
  }, [])

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
    <ToastContext.Provider value={{ notify, setProgressToast }}>
      {children}
      <div className="toast-container">
        {Object.entries(progressToasts).map(([id, text]) => (
          <div key={id} className="toast info toast-progress" role="status" aria-live="polite">
            <IconLoader2 className="toast-spinner" size={20} aria-hidden="true" />
            <span>{text}</span>
          </div>
        ))}
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
