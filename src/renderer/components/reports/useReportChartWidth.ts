import { useCallback, useEffect, useRef, useState } from 'react'

/** Measure the chart container again when loading attaches it or its page becomes active. */
export function useReportChartWidth(loading: boolean, activateKey?: number) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [containerW, setContainerW] = useState(0)
  const measure = useCallback(() => {
    const width = containerRef.current?.clientWidth
    if (width) setContainerW((current) => (Math.abs(width - current) > 1 ? width : current))
  }, [])

  useEffect(() => {
    const element = containerRef.current
    if (loading || !element) return
    let disposed = false
    const timers = new Set<number>()
    const measureIfActive = () => {
      if (!disposed) measure()
    }
    const schedule = (delay: number) => {
      const timer = window.setTimeout(() => {
        timers.delete(timer)
        measureIfActive()
      }, delay)
      timers.add(timer)
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        schedule(0)
        schedule(120)
      }
    }
    measureIfActive()
    const observer = new ResizeObserver(measureIfActive)
    observer.observe(element)
    window.addEventListener('resize', measureIfActive)
    document.addEventListener('visibilitychange', onVisibility)
    ;[0, 120, 360].forEach(schedule)
    return () => {
      disposed = true
      observer.disconnect()
      window.removeEventListener('resize', measureIfActive)
      document.removeEventListener('visibilitychange', onVisibility)
      timers.forEach((timer) => window.clearTimeout(timer))
    }
  }, [loading, measure])

  useEffect(() => {
    if (loading || !containerRef.current) return
    let disposed = false
    let timers: number[] = []
    const frame = window.requestAnimationFrame(() => {
      if (disposed) return
      measure()
      timers = [0, 120, 360].map((delay) =>
        window.setTimeout(() => {
          if (!disposed) measure()
        }, delay)
      )
    })
    return () => {
      disposed = true
      window.cancelAnimationFrame(frame)
      timers.forEach((timer) => window.clearTimeout(timer))
    }
  }, [activateKey, loading, measure])

  return { containerRef, containerW }
}
