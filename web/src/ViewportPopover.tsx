import React, { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import './popovers.css'
export function ViewportPopover({
  anchor,
  children,
  onClose,
  className = '',
  width = 440
}: {
  anchor: HTMLElement | null
  children: React.ReactNode
  onClose?: () => void
  className?: string
  width?: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<React.CSSProperties>({
    visibility: 'hidden',
    position: 'fixed'
  })
  useLayoutEffect(() => {
    const update = () => {
      const box = anchor?.getBoundingClientRect()
      if (!box) return
      const viewport = window.visualViewport,
        gap = 12,
        leftEdge = viewport?.offsetLeft || 0,
        topEdge = viewport?.offsetTop || 0
      const availableWidth = viewport?.width || document.documentElement.clientWidth,
        availableHeight = viewport?.height || window.innerHeight
      const panelWidth = Math.min(width, availableWidth - gap * 2)
      const below = topEdge + availableHeight - box.bottom - gap * 2,
        above = box.top - topEdge - gap * 2
      const upwards = below < Math.min(300, availableHeight * 0.5) && above > below
      const maxHeight = Math.max(80, Math.min(availableHeight - gap * 2, upwards ? above : below))
      const actualHeight = Math.min(ref.current?.scrollHeight || maxHeight, maxHeight)
      setPosition({
        position: 'fixed',
        width: panelWidth,
        left: Math.max(
          leftEdge + gap,
          Math.min(box.right - panelWidth, leftEdge + availableWidth - panelWidth - gap)
        ),
        top: Math.max(
          topEdge + gap,
          Math.min(
            upwards ? box.top - gap - actualHeight : box.bottom + gap,
            topEdge + availableHeight - actualHeight - gap
          )
        ),
        maxHeight,
        visibility: 'visible'
      })
    }
    update()
    const observer = new ResizeObserver(update)
    if (ref.current) observer.observe(ref.current)
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    window.visualViewport?.addEventListener('resize', update)
    window.visualViewport?.addEventListener('scroll', update)
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && onClose) {
        event.preventDefault()
        onClose()
        anchor?.focus()
      }
    }
    const outside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !ref.current?.contains(event.target) &&
        !anchor?.contains(event.target)
      )
        onClose?.()
    }
    document.addEventListener('keydown', keydown)
    document.addEventListener('pointerdown', outside)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
      window.visualViewport?.removeEventListener('resize', update)
      window.visualViewport?.removeEventListener('scroll', update)
      document.removeEventListener('keydown', keydown)
      document.removeEventListener('pointerdown', outside)
    }
  }, [anchor, width, onClose])
  return createPortal(
    <div ref={ref} className={`web-viewport-popover ${className}`} style={position}>
      {children}
    </div>,
    document.body
  )
}
export function InvoiceFlyoutPortal({
  anchor,
  children
}: {
  anchor: HTMLElement | null
  children: React.ReactNode
}) {
  return (
    <ViewportPopover anchor={anchor} className="web-invoice-popover" width={420}>
      {children}
    </ViewportPopover>
  )
}
