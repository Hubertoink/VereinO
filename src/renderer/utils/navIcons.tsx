import React from 'react'
import type { NavKey } from './navItems'

export function getNavIcon(key: NavKey): React.ReactNode {
  switch (key) {
    case 'Dashboard':
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z" />
        </svg>
      )
    case 'Buchungen':
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M3 5h18v2H3V5zm0 6h18v2H3v-2zm0 6h12v2H3v-2z" />
        </svg>
      )
    case 'Verbindlichkeiten':
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M6 2h9l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM14 3v5h5" />
          <path d="M8 12h8v2H8zM8 16h8v2H8zM8 8h4v2H8z" />
        </svg>
      )
    case 'Mitglieder':
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5s-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V20h14v-3.5C15 14.17 10.33 13 8 13zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V20h7v-3.5c0-2.33-4.67-3.5-7-3.5z" />
        </svg>
      )
    case 'Budgets':
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M3 17h18v2H3v-2zm0-7h18v6H3V10zm0-5h18v2H3V5z" />
        </svg>
      )
    case 'Zweckbindungen':
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M12 7V3L1 9l11 6 9-4.91V17h2V9L12 3v4z" />
        </svg>
      )
    case 'Einreichungen':
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z" />
          <path d="M12 16l4-4h-3V8h-2v4H8l4 4z" opacity="0.6" />
        </svg>
      )
    case 'Belege':
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M14 2H6a2 2 0 0 0-2 2v16l4-2 4 2 4-2 4 2V8l-6-6zM8 12h8v2H8v-2zm0-4h5v2H8V8z" />
        </svg>
      )
    case 'Reports':
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M3 3h18v2H3V3zm2 4h14v14H5V7zm2 2v10h10V9H7z" />
        </svg>
      )
    case 'Einstellungen':
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M19.14 12.94a7.97 7.97 0 0 0 .06-1l2.03-1.58-1.92-3.32-2.39.5a7.97 7.97 0 0 0-1.73-1l-.36-2.43h-3.84l-.36 2.43a7.97 7.97 0 0 0-1.73 1l-2.39-.5-1.92 3.32L4.8 11.94c0 .34.02.67.06 1L2.83 14.5l1.92 3.32 2.39-.5c.53.4 1.12.74 1.73 1l.36 2.43h3.84l.36-2.43c.61-.26 1.2-.6 1.73-1l2.39.5 1.92-3.32-2.03-1.56zM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7z" />
        </svg>
      )
    default:
      return null
  }
}

export const navIconPalette: Record<NavKey, string> = {
  Dashboard: '#7C4DFF',
  Buchungen: '#2962FF',
  Verbindlichkeiten: '#00B8D4',
  Mitglieder: '#26A69A',
  Budgets: '#00C853',
  Zweckbindungen: '#FFD600',
  Einreichungen: '#FF7043',
  Belege: '#FF9100',
  Reports: '#F50057',
  Einstellungen: '#9C27B0'
}
