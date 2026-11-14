type Anchor = { left: number; right: number; top: number; bottom: number }

/** Keep the complete anchor free, including when the preferred side hits a window edge. */
export function placeTutorial(anchor: Anchor | undefined, width: number, height: number, viewportWidth: number, viewportHeight: number) {
  const margin = 12, gap = 14
  const maxHeight = Math.max(0, viewportHeight - margin * 2)
  const visibleHeight = Math.min(height, maxHeight)
  const clampX = (x: number) => Math.max(margin, Math.min(x, viewportWidth - width - margin))
  const clampY = (y: number) => Math.max(margin, Math.min(y, viewportHeight - visibleHeight - margin))
  if (!anchor) return { left: clampX(viewportWidth - width - margin), top: clampY(80), maxHeight }

  if (anchor.right + gap + width <= viewportWidth - margin) {
    return { left: anchor.right + gap, top: clampY(anchor.top), maxHeight }
  }
  if (anchor.left - gap - width >= margin) {
    return { left: anchor.left - gap - width, top: clampY(anchor.top), maxHeight }
  }
  const below = Math.max(0, viewportHeight - margin - anchor.bottom - gap)
  const above = Math.max(0, anchor.top - gap - margin)
  if (below >= visibleHeight) return { left: clampX(anchor.left), top: anchor.bottom + gap, maxHeight }
  if (above >= visibleHeight) return { left: clampX(anchor.left), top: anchor.top - gap - visibleHeight, maxHeight }

  // In short/narrow windows, scroll the card within the larger free area instead of covering the control.
  return below >= above
    ? { left: clampX(anchor.left), top: anchor.bottom + gap, maxHeight: below }
    : { left: clampX(anchor.left), top: margin, maxHeight: above }
}
