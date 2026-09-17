import { useEffect } from 'react'
/** Web dialogs are portalled outside the app; keep its inner scroll panes fixed. */
export function useModalBackgroundLock(open = true) {
  useEffect(() => {
    if (!open) return
    const app = document.querySelector<HTMLElement>('.web-app')
    const previousInert = app?.inert
    const nodes = [
      document.documentElement,
      document.body,
      ...Array.from(app?.querySelectorAll<HTMLElement>('*') || [])
    ].filter(
      (node) =>
        node === document.body ||
        node === document.documentElement ||
        /(auto|scroll)/.test(getComputedStyle(node).overflow + getComputedStyle(node).overflowY)
    )
    const saved = nodes.map((node) => ({
      node,
      overflow: node.style.overflow,
      overscroll: node.style.overscrollBehavior
    }))
    for (const { node } of saved) {
      node.style.overflow = 'hidden'
      node.style.overscrollBehavior = 'none'
    }
    if (app) app.inert = true
    const prevent = (event: WheelEvent | TouchEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest('[role="dialog"]'))
        event.preventDefault()
    }
    document.addEventListener('wheel', prevent, { passive: false })
    document.addEventListener('touchmove', prevent, { passive: false })
    return () => {
      for (const { node, overflow, overscroll } of saved) {
        node.style.overflow = overflow
        node.style.overscrollBehavior = overscroll
      }
      if (app) app.inert = previousInert || false
      document.removeEventListener('wheel', prevent)
      document.removeEventListener('touchmove', prevent)
    }
  }, [open])
}
