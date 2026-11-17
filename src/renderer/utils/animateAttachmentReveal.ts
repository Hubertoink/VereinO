import type { AttachmentPreviewRequest } from './attachmentPreview'

/** Warp horizontal strips into a flowing sheet, without changing the form layout. */
export function animateAttachmentReveal(media: HTMLImageElement | HTMLCanvasElement, origin: AttachmentPreviewRequest['origin']) {
  const bounds = media.getBoundingClientRect()
  const sourceWidth = media instanceof HTMLImageElement ? media.naturalWidth : media.width
  const sourceHeight = media instanceof HTMLImageElement ? media.naturalHeight : media.height
  if (!sourceWidth || !sourceHeight || !bounds.width || !bounds.height) return () => {}
  const fit = Math.min(bounds.width / sourceWidth, bounds.height / sourceHeight)
  const width = sourceWidth * fit, height = sourceHeight * fit
  const target = { x: bounds.x + (bounds.width - width) / 2, y: bounds.y, width, height }
  const canvas = document.createElement('canvas')
  canvas.className = 'attachment-reveal-wave'
  canvas.setAttribute('aria-hidden', 'true')
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5)
  canvas.width = Math.ceil(window.innerWidth * pixelRatio)
  canvas.height = Math.ceil(window.innerHeight * pixelRatio)
  Object.assign(canvas.style, { position: 'fixed', inset: '0', width: '100vw', height: '100vh', pointerEvents: 'none', zIndex: '5101' })
  const context = canvas.getContext('2d')
  if (!context) return () => {}
  context.scale(pixelRatio, pixelRatio)
  document.body.append(canvas)
  const previousOpacity = media.style.opacity
  media.style.opacity = '0'
  let frame = 0
  let stopped = false
  const finish = () => {
    if (stopped) return
    stopped = true
    cancelAnimationFrame(frame)
    canvas.remove()
    media.style.opacity = previousOpacity
    window.removeEventListener('resize', finish)
  }
  window.addEventListener('resize', finish)
  const started = performance.now()
  const fromBelow = origin.y + origin.height / 2 >= target.y + target.height / 2
  const smooth = (value: number) => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t) }
  const edge = (row: number, progress: number) => {
    // The far edge opens first, with the rest of the sheet following in a wave.
    const phase = smooth((progress - (fromBelow ? row : 1 - row) * 0.22) / 0.78)
    const span = origin.width + (target.width - origin.width) * phase
    const center = origin.x + origin.width / 2 + (target.x + target.width / 2 - origin.x - origin.width / 2) * phase
    const bend = Math.sin(row * Math.PI) * Math.sin(progress * Math.PI) * 12
    return { x: center - span / 2 + bend, y: origin.y + row * origin.height + (target.y + row * target.height - origin.y - row * origin.height) * phase, width: span }
  }
  const draw = (now: number) => {
    if (stopped) return
    const progress = Math.min(1, (now - started) / 520)
    context.clearRect(0, 0, window.innerWidth, window.innerHeight)
    const strips = 256
    const edges = Array.from({ length: strips + 1 }, (_, i) => edge(i / strips, progress))
    context.save()
    context.beginPath()
    context.moveTo(edges[0].x, edges[0].y)
    edges.forEach(point => context.lineTo(point.x, point.y))
    for (let i = strips; i >= 0; i--) context.lineTo(edges[i].x + edges[i].width, edges[i].y)
    context.closePath()
    context.clip()
    for (let i = 0; i < strips; i++) {
      const top = edges[i], bottom = edges[i + 1]
      const left = Math.min(top.x, bottom.x), right = Math.max(top.x + top.width, bottom.x + bottom.width)
      context.drawImage(media, 0, i * sourceHeight / strips, sourceWidth, sourceHeight / strips,
        left, top.y, right - left, Math.max(0.1, bottom.y - top.y) + 0.5)
    }
    context.restore()
    const fade = smooth((progress - 0.78) / 0.22)
    media.style.opacity = String(fade)
    canvas.style.opacity = String(1 - fade)
    if (progress < 1) frame = requestAnimationFrame(draw)
    else finish()
  }
  frame = requestAnimationFrame(draw)
  return finish
}
