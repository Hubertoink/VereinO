import React, { useEffect, useState } from 'react'

type WindowControlsProps = {
    onClose?: () => void
}

export default function WindowControls({ onClose }: WindowControlsProps) {
    const [isMaximized, setIsMaximized] = useState(false)

    useEffect(() => {
        let mounted = true
        const windowApi = window.api?.window
        const unsubscribe = windowApi?.onMaximizeChanged?.(setIsMaximized)

        void windowApi?.isMaximized?.().then((maximized) => {
            if (mounted) setIsMaximized(maximized)
        }).catch(() => {})

        return () => {
            mounted = false
            unsubscribe?.()
        }
    }, [])

    return (
        <div className="window-controls" style={{ WebkitAppRegion: 'no-drag' } as any}>
            <button
                type="button"
                className="btn ghost window-controls__btn"
                title="Minimieren"
                aria-label="Minimieren"
                onClick={() => window.api?.window?.minimize?.()}
            >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                    <path d="M5 12h14" />
                </svg>
            </button>
            <button
                type="button"
                className="btn ghost window-controls__btn"
                title={isMaximized ? 'Wiederherstellen' : 'Maximieren'}
                aria-label={isMaximized ? 'Wiederherstellen' : 'Maximieren'}
                onClick={() => window.api?.window?.toggleMaximize?.()}
            >
                {isMaximized ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
                        <path d="M9 8V4h11v11h-4" />
                        <rect x="4" y="9" width="11" height="11" rx="1" />
                    </svg>
                ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <rect x="5" y="5" width="14" height="14" rx="1" stroke="currentColor" strokeWidth="1.8" />
                    </svg>
                )}
            </button>
            <button
                type="button"
                className="btn danger window-controls__btn window-controls__btn--close"
                title="Schließen"
                aria-label="Schließen"
                onClick={() => onClose ? onClose() : window.api?.window?.close?.()}
            >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
            </button>
        </div>
    )
}
