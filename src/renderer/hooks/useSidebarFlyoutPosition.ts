import { useLayoutEffect, useState } from 'react'
import type { CSSProperties } from 'react'

/** Keep a flyout beside the actual sidebar, including its animated/mobile widths. */
export function useSidebarFlyoutPosition(enabled: boolean, preferredWidth: number): CSSProperties | undefined {
  const [left, setLeft] = useState(12)
  useLayoutEffect(() => {
    if (!enabled) return
    const sidebar = document.querySelector('.app-sidebar')
    if (!sidebar) return
    const measure = () => setLeft(Math.max(12, Math.min(sidebar.getBoundingClientRect().right + 12, window.innerWidth - preferredWidth - 12)))
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(sidebar)
    window.addEventListener('resize', measure)
    return () => { observer.disconnect(); window.removeEventListener('resize', measure) }
  }, [enabled, preferredWidth])
  return enabled ? { position: 'fixed', left, right: 'auto', bottom: 12, width: `min(${preferredWidth}px, calc(100vw - 24px))`, maxHeight: 'calc(100dvh - 80px)' } : undefined
}
