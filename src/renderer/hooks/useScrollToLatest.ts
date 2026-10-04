import { useLayoutEffect, type RefObject } from 'react'

/** Start chronological charts at the newest values, while allowing manual scrolling. */
export function useScrollToLatest(ref: RefObject<HTMLElement>, resetKey: string) {
  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    let atEnd = true
    let width = element.clientWidth
    let contentWidth = element.scrollWidth
    const scrollToEnd = () => { element.scrollLeft = element.scrollWidth }
    scrollToEnd()

    const onScroll = () => {
      // A resize can emit a scroll event before ResizeObserver runs.
      if (width !== element.clientWidth || contentWidth !== element.scrollWidth) return
      atEnd = element.scrollWidth - element.clientWidth - element.scrollLeft <= 1
    }
    const observer = new ResizeObserver(() => {
      if (atEnd) scrollToEnd()
      width = element.clientWidth
      contentWidth = element.scrollWidth
    })
    observer.observe(element)
    for (const child of element.children) observer.observe(child)
    element.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      observer.disconnect()
      element.removeEventListener('scroll', onScroll)
    }
  }, [ref, resetKey])
}
