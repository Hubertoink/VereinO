import { useEffect, useRef } from 'react'

/** View navigation is React state, not document navigation. Handle both driver commands and DOM mouse buttons. */
export function usePageHistory<T extends string>(page: T, setPage: (page: T) => void) {
  const history = useRef<T[]>([])
  const index = useRef(-1)
  const target = useRef<T | null>(null)
  const setter = useRef(setPage)
  setter.current = setPage
  useEffect(() => {
    if (target.current === page) { target.current = null; return }
    if (history.current[index.current] === page) return
    target.current = null
    history.current.splice(index.current + 1)
    history.current.push(page)
    index.current = history.current.length - 1
  }, [page])

  useEffect(() => {
    let last: { direction: number; source: string; at: number } | null = null
    const navigate = (direction: -1 | 1, source: string) => {
      const now = performance.now()
      // Some mouse drivers emit both signals for a single physical click.
      if (last && last.direction === direction && last.source !== source && now - last.at < 180) return
      last = { direction, source, at: now }
      const next = index.current + direction
      const nextPage = history.current[next]
      if (!nextPage) return
      index.current = next
      target.current = nextPage
      setter.current(nextPage)
    }
    const onMouse = (event: MouseEvent) => {
      if (event.button !== 3 && event.button !== 4) return
      event.preventDefault()
      event.stopPropagation()
      if (event.type === 'mouseup') navigate(event.button === 3 ? -1 : 1, 'mouse')
    }
    const onKey = (event: KeyboardEvent) => {
      const backward = event.key === 'BrowserBack' || (event.altKey && event.key === 'ArrowLeft')
      const forward = event.key === 'BrowserForward' || (event.altKey && event.key === 'ArrowRight')
      if (!backward && !forward) return
      event.preventDefault()
      if (!event.repeat) navigate(backward ? -1 : 1, 'keyboard')
    }
    const offBack = window.api?.window?.onNavigationBackRequested?.(() => navigate(-1, 'native'))
    const offForward = window.api?.window?.onNavigationForwardRequested?.(() => navigate(1, 'native'))
    for (const type of ['mousedown', 'mouseup', 'auxclick'] as const) window.addEventListener(type, onMouse, true)
    window.addEventListener('keydown', onKey, true)
    return () => {
      offBack?.(); offForward?.()
      for (const type of ['mousedown', 'mouseup', 'auxclick'] as const) window.removeEventListener(type, onMouse, true)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [])
}
