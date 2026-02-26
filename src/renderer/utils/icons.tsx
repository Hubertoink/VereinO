import React from 'react'

// Zentrale Icon-Definitionen für die gesamte App
// Verhindert Encoding-Probleme und macht Icons wartbar

// String-Icons (für Text-Kontext)
export const ICONS = {
    // Platzhalter & Symbole
    EMPTY: '−',  // Minus-Zeichen für leere Werte
    DASH: '–',   // En-dash
    ARROW_RIGHT: '→',
    ARROW_UP: '↑',
    ARROW_DOWN: '↓',
    ARROW_BOTH: '↕',
    ELLIPSIS: '…',
    BULLET: '·',  // Middle dot für Trennung
    
    // Bearbeitung & Aktionen
    EDIT: '✎',
    DELETE: '🗑',
    ADD: '+',
    SAVE: '💾',
    CANCEL: '✖',
    
    // Status
    CHECK: '✓',
    CROSS: '✗',
    WARNING: '⚠',
    INFO: 'ℹ',
} as const

// React Icon-Komponenten
// Bank icon – filled temple/building, default blue
export const IconBank = ({ size = 14, color }: { size?: number; color?: string }) => (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Roof / triangle */}
        <path d="M10 2L1 8h18L10 2z" fill={color || '#3b82f6'} />
        {/* Pillars */}
        <rect x="3" y="9" width="2" height="6" rx="0.5" fill={color || '#3b82f6'} />
        <rect x="7" y="9" width="2" height="6" rx="0.5" fill={color || '#3b82f6'} />
        <rect x="11" y="9" width="2" height="6" rx="0.5" fill={color || '#3b82f6'} />
        <rect x="15" y="9" width="2" height="6" rx="0.5" fill={color || '#3b82f6'} />
        {/* Base */}
        <rect x="1" y="15.5" width="18" height="2.5" rx="0.5" fill={color || '#3b82f6'} />
    </svg>
)

// Cash icon – banknote with € symbol, default green
export const IconCash = ({ size = 14, color }: { size?: number; color?: string }) => (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Banknote body */}
        <rect x="1" y="4" width="18" height="12" rx="2" fill={color || '#22c55e'} />
        {/* Inner border */}
        <rect x="3" y="6" width="14" height="8" rx="1" fill="none" stroke={color || '#16a34a'} strokeWidth="0.8" strokeDasharray="2 1" opacity="0.5" />
        {/* Euro symbol */}
        <text x="10" y="13" textAnchor="middle" fontSize="8" fontWeight="700" fill="#fff" fontFamily="sans-serif">€</text>
    </svg>
)

export const IconTransfer = ({ size = 14 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M3 5h10M10 2l3 3-3 3M13 11H3M6 14L3 11l3-3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
)

// Transfer arrow – bold chevron with color
export const IconArrow = ({ size = 14, color }: { size?: number; color?: string }) => (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke={color || 'currentColor'} strokeWidth="2">
        <path d="M6 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
)

// Trash icon (monochrome, matches other stroke icons)
export const IconTrash = ({ size = 16, color }: { size?: number; color?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color || 'currentColor'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="3 6 5 6 21 6" />
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
)

// Budget icon (bar chart style - matches nav)
export const IconBudget = ({ size = 16, color }: { size?: number; color?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color || 'currentColor'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="20" x2="12" y2="10" />
        <line x1="18" y1="20" x2="18" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
)

// Earmark/Zweckbindung icon (bookmark style - matches nav)
export const IconEarmark = ({ size = 16, color }: { size?: number; color?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color || 'currentColor'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
)

// Attachment/clip icon
export const IconAttachment = ({ size = 16, color }: { size?: number; color?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color || 'currentColor'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
)

// Helper-Funktion für Platzhalter-Text
export function emptyValue(value: any): string {
    if (value === null || value === undefined || value === '') {
        return ICONS.EMPTY
    }
    return String(value)
}

// Helper für Zahlweg-Icons (React)
export function PaymentMethodIcon({ method, size = 14 }: { method: 'BAR' | 'BANK' | null | undefined; size?: number }) {
    if (method === 'BANK') return <IconBank size={size} />
    if (method === 'BAR') return <IconCash size={size} />
    return <span>{ICONS.EMPTY}</span>
}

// Helper für Transfer-Anzeige mit Icons
export function TransferDisplay({ from, to, size = 14 }: { from: 'BAR' | 'BANK' | null | undefined; to: 'BAR' | 'BANK' | null | undefined; size?: number }) {
    return (
        <span className="pm-transfer-display">
            {from === 'BAR' ? <IconCash size={size} /> : from === 'BANK' ? <IconBank size={size} /> : ICONS.EMPTY}
            <IconArrow size={size} color="var(--text-dim)" />
            {to === 'BAR' ? <IconCash size={size} /> : to === 'BANK' ? <IconBank size={size} /> : ICONS.EMPTY}
        </span>
    )
}

// Helper für Transfer-Anzeige als String (für Zusammenfassung)
export function transferDisplayString(from: 'BAR' | 'BANK' | null | undefined, to: 'BAR' | 'BANK' | null | undefined): string {
    const fromStr = from || ICONS.EMPTY
    const toStr = to || ICONS.EMPTY
    return `${fromStr} ${ICONS.ARROW_RIGHT} ${toStr}`
}
