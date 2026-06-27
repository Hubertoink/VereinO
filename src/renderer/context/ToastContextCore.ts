import { createContext } from 'react'

export type ToastType = 'info' | 'success' | 'warn' | 'error'

export interface ToastContextValue {
  notify: (type: ToastType, text: string, ms?: number, action?: { label: string; onClick: () => void }) => void
}

export const ToastContext = createContext<ToastContextValue | null>(null)
