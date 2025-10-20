import { useRef, useState } from 'react'

export type Toast = { id: number; type: 'success' | 'error' | 'info'; text: string; action?: { label: string; onClick: () => void } }

export default function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([])
  const idRef = useRef(1)
  const notify = (type: Toast['type'], text: string, ms = 3000, action?: Toast['action']) => {
    const id = idRef.current++
    setToasts(prev => [...prev, { id, type, text, action }])
    window.setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), ms)
  }
  return { toasts, notify }
}
