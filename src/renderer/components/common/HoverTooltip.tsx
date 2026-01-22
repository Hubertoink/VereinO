import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export type TooltipPlacement = 'bottom' | 'top'

export type HoverTooltipRenderArgs<TElement extends HTMLElement> = {
  ref: (el: TElement | null) => void
  props: Pick<
    React.HTMLAttributes<TElement>,
    'onMouseEnter' | 'onMouseLeave' | 'onFocus' | 'onBlur' | 'aria-describedby'
  >
}

export interface HoverTooltipProps<TElement extends HTMLElement = HTMLElement> {
  content?: React.ReactNode
  children: (args: HoverTooltipRenderArgs<TElement>) => React.ReactNode
  className?: string
  preferredPlacement?: TooltipPlacement
  gap?: number
  margin?: number
}

export default function HoverTooltip<TElement extends HTMLElement = HTMLElement>({
  content,
  children,
  className,
  preferredPlacement = 'bottom',
  gap = 8,
  margin = 8
}: HoverTooltipProps<TElement>) {
  const tooltipId = useId()
  const [open, setOpen] = useState(false)
  const [anchorEl, setAnchorEl] = useState<TElement | null>(null)
  const tooltipRef = useRef<HTMLDivElement | null>(null)
  const [tooltipStyle, setTooltipStyle] = useState<React.CSSProperties>({ left: 0, top: 0 })
  const [placement, setPlacement] = useState<TooltipPlacement>(preferredPlacement)

  const updateTooltipPosition = useCallback(() => {
    if (!content || !open) return
    if (!anchorEl || !tooltipRef.current) return

    const anchor = anchorEl.getBoundingClientRect()
    const tip = tooltipRef.current.getBoundingClientRect()

    let left = anchor.left + anchor.width / 2 - tip.width / 2
    left = Math.min(Math.max(left, margin), window.innerWidth - tip.width - margin)

    const bottomTop = anchor.bottom + gap
    const topTop = anchor.top - tip.height - gap

    let nextPlacement: TooltipPlacement = preferredPlacement
    if (preferredPlacement === 'bottom') {
      nextPlacement = bottomTop + tip.height + margin <= window.innerHeight ? 'bottom' : 'top'
    } else {
      nextPlacement = topTop >= margin ? 'top' : 'bottom'
    }

    const top = nextPlacement === 'bottom' ? bottomTop : topTop

    setPlacement(nextPlacement)
    setTooltipStyle({ left, top })
  }, [anchorEl, content, gap, margin, open, preferredPlacement])

  useLayoutEffect(() => {
    if (!content || !open) return
    updateTooltipPosition()
  }, [content, open, updateTooltipPosition])

  useEffect(() => {
    if (!content || !open) return

    const onReposition = () => updateTooltipPosition()
    window.addEventListener('resize', onReposition)
    window.addEventListener('scroll', onReposition, true)
    return () => {
      window.removeEventListener('resize', onReposition)
      window.removeEventListener('scroll', onReposition, true)
    }
  }, [content, open, updateTooltipPosition])

  useEffect(() => {
    if (!open) return

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        setOpen(false)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open])

  if (!content) {
    return <>{children({ ref: setAnchorEl, props: {} })}</>
  }

  const targetArgs: HoverTooltipRenderArgs<TElement> = {
    ref: setAnchorEl,
    props: {
      'aria-describedby': open ? tooltipId : undefined,
      onMouseEnter: () => setOpen(true),
      onMouseLeave: () => setOpen(false),
      onFocus: () => setOpen(true),
      onBlur: () => setOpen(false)
    }
  }

  return (
    <>
      {children(targetArgs)}
      {open && anchorEl &&
        createPortal(
          <div
            ref={tooltipRef}
            id={tooltipId}
            className={`tooltip-portal tooltip-portal--${placement}${className ? ` ${className}` : ''}`}
            style={tooltipStyle}
            role="tooltip"
          >
            {content}
          </div>,
          document.body
        )}
    </>
  )
}
