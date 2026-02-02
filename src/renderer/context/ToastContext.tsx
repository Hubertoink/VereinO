import React, { createContext, useContext, useState, useCallback, useRef } from 'react'

type ToastType = 'info' | 'success' | 'warn' | 'error'

interface Toast {
  id: number
  type: ToastType
  text: string
  action?: { label: string; onClick: () => void }
  closing?: boolean
}

interface ToastContextValue {
  notify: (type: ToastType, text: string, ms?: number, action?: { label: string; onClick: () => void }) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

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

export const useToast = () => {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}
