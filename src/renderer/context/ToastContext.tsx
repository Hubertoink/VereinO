import React, { createContext, useContext, useState, useCallback } from 'react'

type ToastType = 'info' | 'success' | 'warn' | 'error'

interface Toast {
  id: number
  type: ToastType
  text: string
  action?: { label: string; onClick: () => void }
}

interface ToastContextValue {
  notify: (type: ToastType, text: string, ms?: number, action?: { label: string; onClick: () => void }) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([])
  let nextId = 0

  const notify = useCallback(
    (type: ToastType, text: string, ms = 4000, action?: { label: string; onClick: () => void }) => {
      const id = ++nextId
      setToasts(prev => [...prev, { id, type, text, action }])
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
            className={`toast ${t.type}`}
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
