export type WidgetEdge = 'left' | 'right'
export type WidgetPosition = { edge: WidgetEdge; y: number; displayId?: number }
export type WidgetState = { expanded: boolean; edge: WidgetEdge }
export type WidgetAutostart = { enabled: boolean; available: boolean; reason?: string }
export const WIDGET_COLLAPSED = { width: 44, height: 72 }
export const WIDGET_EXPANDED = { width: 300, height: 210 }

export function widgetBounds(
  area: { x: number; y: number; width: number; height: number },
  position: WidgetPosition,
  expanded: boolean
) {
  const size = expanded ? WIDGET_EXPANDED : WIDGET_COLLAPSED
  // Keep the droplet vertically fixed while unfolding the panel around it.
  const center = Number.isFinite(position.y) ? position.y : area.y + area.height * 0.65
  const y = Math.round(
    Math.max(area.y, Math.min(center - size.height / 2, area.y + area.height - size.height))
  )
  return {
    x: Math.round(position.edge === 'left' ? area.x : area.x + area.width - size.width),
    y,
    ...size
  }
}
