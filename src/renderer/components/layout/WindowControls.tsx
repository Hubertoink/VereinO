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
                className="btn ghost window-controls__btn"
                title="Minimieren"
                aria-label="Minimieren"
                onClick={() => window.api?.window?.minimize?.()}
            >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <rect x="5" y="11" width="14" height="2" rx="1" />
                </svg>
            </button>
            <button
                className="btn ghost window-controls__btn"
                title={isMaximized ? 'Wiederherstellen' : 'Maximieren'}
                aria-label={isMaximized ? 'Wiederherstellen' : 'Maximieren'}
                onClick={() => window.api?.window?.toggleMaximize?.()}
            >
                {isMaximized ? (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <rect x="9" y="4" width="11" height="11" stroke="currentColor" strokeWidth="1.8" />
                        <rect x="4" y="9" width="11" height="11" stroke="currentColor" strokeWidth="1.8" />
                    </svg>
                ) : (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <rect x="6" y="6" width="12" height="12" stroke="currentColor" strokeWidth="1.8" />
                    </svg>
                )}
            </button>
            <button
                className="btn danger window-controls__btn"
                title="Schließen"
                aria-label="Schließen"
                onClick={() => onClose ? onClose() : window.api?.window?.close?.()}
            >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" />
                </svg>
            </button>
        </div>
    )
}
