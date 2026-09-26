import { useLayoutEffect } from 'react'

// Legacy modals and portalled flyouts share this guard, including nested dialogs.
const overlaySelector = '.modal-overlay, [role="dialog"], .flyout-popover, .invoice-batch-flyout, .bank-action-menu__popover'
const lockClass = 'overlay-scroll-locked'
const gutterClass = 'overlay-scroll-gutter'

export function useOverlayScrollLock() {
  useLayoutEffect(() => {
    let active: HTMLElement | undefined
    let previous: HTMLElement[] = []
    const locked = new Set<HTMLElement>()
    const unlock = () => { locked.forEach(el => el.classList.remove(lockClass, gutterClass)); locked.clear() }
    const layer = (el: HTMLElement) => {
      let z = 0
      for (let node: HTMLElement | null = el; node; node = node.parentElement) {
        z = Math.max(z, Number.parseInt(getComputedStyle(node).zIndex) || 0)
      }
      return z
    }
    const update = () => {
      const overlays = Array.from(document.querySelectorAll<HTMLElement>(overlaySelector))
        .filter(el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden' && !el.closest('[hidden], [aria-hidden="true"]'))
        .sort((a, b) => layer(a) - layer(b))
      if (overlays.length === previous.length && overlays.every((el, i) => el === previous[i])) return
      previous = overlays
      unlock()
      active = overlays[overlays.length - 1]
      if (!active) return
      // Lock the actual page scrollers as well as body; Electron layouts often scroll .app-main.
      const candidates = [document.documentElement, document.body, ...document.body.querySelectorAll<HTMLElement>('*')]
      const pending: Array<{ el: HTMLElement; preserveGutter: boolean }> = []
      for (const el of candidates) {
        if (active.contains(el)) continue
        const style = getComputedStyle(el)
        if (el === document.documentElement || el === document.body || /auto|scroll/.test(`${style.overflowX} ${style.overflowY}`)) {
          // Measure before hiding any scrollbar, including the viewport scrollbar.
          // Only reserve space that was already occupied; overlay scrollbars and
          // non-scrolling containers must not gain a new gutter when a modal opens.
          const gutter = el === document.documentElement
            ? window.innerWidth - el.clientWidth
            : el.offsetWidth - el.clientWidth - (parseFloat(style.borderLeftWidth) || 0) - (parseFloat(style.borderRightWidth) || 0)
          pending.push({ el, preserveGutter: gutter > 1 && style.scrollbarGutter === 'auto' })
        }
      }
      for (const { el, preserveGutter } of pending) {
        if (preserveGutter) el.classList.add(gutterClass)
        el.classList.add(lockClass)
        locked.add(el)
      }
    }
    const mayScroll = (target: EventTarget | null, dx: number, dy: number) => {
      if (!active || !(target instanceof Element) || !active.contains(target)) return !active
      if (target.closest('select')) return true
      for (let node: Element | null = target; node; node = node.parentElement) {
        const style = getComputedStyle(node)
        const vertical = Math.abs(dy) >= Math.abs(dx)
        const delta = vertical ? dy : dx
        const position = vertical ? node.scrollTop : node.scrollLeft
        const maximum = vertical ? node.scrollHeight - node.clientHeight : node.scrollWidth - node.clientWidth
        if (/auto|scroll/.test(vertical ? style.overflowY : style.overflowX) && maximum > 1 &&
          (delta < 0 ? position > 0 : position < maximum - 1)) return true
        if (node === active) break
      }
      return false
    }
    const wheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !mayScroll(event.target, event.deltaX, event.deltaY)) event.preventDefault()
    }
    let touchX = 0, touchY = 0
    const touchStart = (event: TouchEvent) => { touchX = event.touches[0]?.clientX || 0; touchY = event.touches[0]?.clientY || 0 }
    const touchMove = (event: TouchEvent) => {
      if (event.touches.length !== 1) return
      const { clientX, clientY } = event.touches[0]
      if (!mayScroll(event.target, touchX - clientX, touchY - clientY)) event.preventDefault()
      touchX = clientX; touchY = clientY
    }
    const keydown = (event: KeyboardEvent) => {
      if (active && event.target instanceof Node && !active.contains(event.target) &&
        ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'PageDown', 'PageUp', 'Home', 'End', ' '].includes(event.key)) event.preventDefault()
    }
    const observer = new MutationObserver(update)
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'hidden', 'aria-hidden', 'open'] })
    document.addEventListener('wheel', wheel, { passive: false, capture: true })
    document.addEventListener('touchstart', touchStart, { passive: true, capture: true })
    document.addEventListener('touchmove', touchMove, { passive: false, capture: true })
    document.addEventListener('keydown', keydown, true)
    update()
    return () => {
      observer.disconnect(); unlock()
      document.removeEventListener('wheel', wheel, true)
      document.removeEventListener('touchstart', touchStart, true)
      document.removeEventListener('touchmove', touchMove, true)
      document.removeEventListener('keydown', keydown, true)
    }
  }, [])
}
