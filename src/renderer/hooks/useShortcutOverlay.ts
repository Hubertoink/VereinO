import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

export type ShortcutOverlayAction = {
    id: string
    key: string
    label: string
    action: () => void
    disabled?: boolean
}

type UseShortcutOverlayOptions = {
    actions: ShortcutOverlayAction[]
    enabled?: boolean
    timeoutMs?: number
    isTargetBlocked?: (target: EventTarget | null) => boolean
    capture?: boolean
    stopPropagation?: boolean
    enableAltChords?: boolean
}

export function isTextEntryTarget(target: EventTarget | null): boolean {
    const element = target instanceof HTMLElement
        ? target
        : document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null

    if (!element) return false
    const tag = element.tagName.toLowerCase()
    if (tag === 'textarea' || tag === 'select') return true
    if (element.isContentEditable) return true
    if (tag !== 'input') return false

    const input = element as HTMLInputElement
    const inputType = (input.type || 'text').toLowerCase()
    return ['text', 'search', 'email', 'url', 'tel', 'password'].includes(inputType)
}

export function useShortcutOverlay({
    actions,
    enabled = true,
    timeoutMs = 4000,
    isTargetBlocked = isTextEntryTarget,
    capture = false,
    stopPropagation = false,
    enableAltChords = true
}: UseShortcutOverlayOptions) {
    const [showShortcuts, setShowShortcuts] = useState(false)
    const timerRef = useRef<number | null>(null)

    const activeActions = useMemo(
        () => actions.filter((shortcut) => shortcut.key.trim().length > 0),
        [actions]
    )

    const shortcutMap = useMemo(() => {
        return Object.fromEntries(activeActions.map((shortcut) => [shortcut.id, shortcut.key])) as Record<string, string>
    }, [activeActions])

    const hideShortcuts = useCallback(() => {
        setShowShortcuts(false)
        if (timerRef.current) {
            window.clearTimeout(timerRef.current)
            timerRef.current = null
        }
    }, [])

    const scheduleHide = useCallback(() => {
        if (timerRef.current) window.clearTimeout(timerRef.current)
        timerRef.current = window.setTimeout(hideShortcuts, timeoutMs)
    }, [hideShortcuts, timeoutMs])

    useEffect(() => {
        if (!enabled) hideShortcuts()
    }, [enabled, hideShortcuts])

    useEffect(() => {
        if (!enabled) return

        function consume(event: KeyboardEvent) {
            event.preventDefault()
            if (stopPropagation) event.stopImmediatePropagation()
        }

        function onKeyDown(event: KeyboardEvent) {
            if (enableAltChords && event.key === 'Alt') {
                consume(event)
                if (!event.repeat) setShowShortcuts(true)
                return
            }

            if (enableAltChords && event.altKey && !event.ctrlKey && !event.metaKey && event.key.length === 1) {
                const pressed = event.key.toLowerCase()
                const shortcut = activeActions.find((item) => item.key.toLowerCase() === pressed)
                if (!shortcut || shortcut.disabled) return

                consume(event)
                shortcut.action()
                hideShortcuts()
                return
            }

            if (event.code === 'Space') {
                if (isTargetBlocked(event.target)) return

                consume(event)
                setShowShortcuts((current) => {
                    const next = !current
                    if (next) scheduleHide()
                    else if (timerRef.current) {
                        window.clearTimeout(timerRef.current)
                        timerRef.current = null
                    }
                    return next
                })
                return
            }

            if (!showShortcuts) return

            if (event.key === 'Escape') {
                consume(event)
                hideShortcuts()
                return
            }

            const pressed = event.key.toLowerCase()
            const shortcut = activeActions.find((item) => item.key.toLowerCase() === pressed)
            if (!shortcut || shortcut.disabled) return

            consume(event)
            shortcut.action()
            hideShortcuts()
        }

        function onKeyUp(event: KeyboardEvent) {
            if (enableAltChords && event.key === 'Alt') {
                consume(event)
                hideShortcuts()
            }
        }

        window.addEventListener('keydown', onKeyDown, { capture })
        window.addEventListener('keyup', onKeyUp, { capture })
        return () => {
            window.removeEventListener('keydown', onKeyDown, { capture })
            window.removeEventListener('keyup', onKeyUp, { capture })
        }
    }, [activeActions, capture, enableAltChords, enabled, hideShortcuts, isTargetBlocked, scheduleHide, showShortcuts, stopPropagation])

    useEffect(() => hideShortcuts, [hideShortcuts])

    return { showShortcuts, shortcutMap, hideShortcuts }
}