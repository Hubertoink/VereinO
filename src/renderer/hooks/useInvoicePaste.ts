import { useEffect, useRef, type RefObject } from 'react'

/** Clipboard intake is active only for the foremost, empty invoice uploader. */
export function useInvoicePaste({ enabled, surfaceRef, onFile, onError }: {
  enabled: boolean
  surfaceRef: RefObject<HTMLElement>
  onFile: (file: File) => void
  onError: (message: string) => void
}) {
  const callbacks = useRef({ onFile, onError })
  callbacks.current = { onFile, onError }

  useEffect(() => {
    if (!enabled) return
    const surface = surfaceRef.current
    if (!surface) return
    surface.setAttribute('data-invoice-paste-target', '')
    let disposed = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let request = 0
    let reading = false
    const available = () => {
      if (disposed || !surface.getClientRects().length || surface.closest('[inert]')) return false
      const overlays = [...document.querySelectorAll<HTMLElement>('.modal-overlay, [aria-modal="true"]')]
        .filter(element => element.getClientRects().length)
      const top = overlays.at(-1)
      if (top && !top.contains(surface)) return false
      const uploaders = [...document.querySelectorAll<HTMLElement>('[data-invoice-paste-target]')]
        .filter(element => element.getClientRects().length)
      return uploaders.at(-1) === surface
    }
    const cancelFallback = () => { clearTimeout(timer); request++; reading = false }
    const onPaste = (event: ClipboardEvent) => {
      if (!available() || event.defaultPrevented) return
      const data = event.clipboardData
      const file = data?.files[0] || Array.from(data?.items || [])
        .find(item => item.kind === 'file')?.getAsFile()
      if (file) {
        cancelFallback()
        event.preventDefault()
        callbacks.current.onFile(file)
      } else if (data?.getData('text/plain')) {
        // Do not turn an ordinary text paste into a separate image import.
        cancelFallback()
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (!available() || event.defaultPrevented || event.repeat || reading
        || !(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey || event.key.toLowerCase() !== 'v') return
      const target = event.target
      if (target instanceof HTMLElement && (target.isContentEditable || target.closest('input, textarea, select'))) return
      // Let Chromium's normal paste event deliver a File first. Native Windows
      // bitmaps (e.g. copied phone photos) may not produce a browser file item.
      cancelFallback()
      const ticket = request
      reading = true
      timer = setTimeout(async () => {
        try {
          const image = await window.api.clipboard?.readImage()
          if (ticket !== request || !available() || !image) return
          callbacks.current.onFile(new File([new Uint8Array(image.dataBytes)], image.fileName, { type: 'image/png' }))
        } catch (error) {
          if (ticket === request && available()) callbacks.current.onError(error instanceof Error ? error.message : 'Bild konnte nicht eingefügt werden.')
        } finally { if (ticket === request) reading = false }
      }, 0)
    }
    document.addEventListener('paste', onPaste)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      disposed = true
      cancelFallback()
      surface.removeAttribute('data-invoice-paste-target')
      document.removeEventListener('paste', onPaste)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [enabled, surfaceRef])
}
