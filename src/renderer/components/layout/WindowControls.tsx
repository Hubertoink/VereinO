import React from 'react'

type WindowControlsProps = {
    onClose?: () => void
}

export default function WindowControls({ onClose }: WindowControlsProps) {
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
                title="Maximieren / Wiederherstellen"
                aria-label="Maximieren"
                onClick={() => window.api?.window?.toggleMaximize?.()}
            >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M6 6h12v12H6z" />
                </svg>
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
