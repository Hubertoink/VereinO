import React, { useEffect } from 'react'
import { IconX } from '@tabler/icons-react'
import AppIcon from './common/AppIcon'

interface ModalHeaderProps {
  title: string
  onClose: () => void
  subtitle?: string
  closeButtonClassName?: string
}

/**
 * ModalHeader - Einheitlicher Modal-Header
 * 
 * Standardisierter Header für alle Modals mit:
 * - Titel links (mit optionalem Untertitel)
 * - X-Button rechts
 * - ESC-Taste-Support
 * - Konsistente Abstände und Styling
 */
export default function ModalHeader({ title, onClose, subtitle, closeButtonClassName }: ModalHeaderProps) {
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [onClose])

  return (
    <div 
      style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'flex-start',
        marginBottom: subtitle ? 8 : 16,
        paddingBottom: 12,
        borderBottom: '1px solid var(--border)'
      }}
    >
      <div style={{ flex: 1 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: 'var(--text)' }}>
          {title}
        </h2>
        {subtitle && (
          <div style={{ 
            fontSize: 13, 
            color: 'var(--text-dim)', 
            marginTop: 4 
          }}>
            {subtitle}
          </div>
        )}
      </div>

      <button 
        className={`btn ghost${closeButtonClassName ? ` ${closeButtonClassName}` : ''}`}
        onClick={onClose} 
        title="Schließen (ESC)"
        style={{
          padding: 4,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginLeft: 16
        }}
      >
        <AppIcon icon={IconX} size="action" />
      </button>
    </div>
  )
}
