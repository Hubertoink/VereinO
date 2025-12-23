import React, { useEffect, useRef, useState } from 'react'
import NewOrgModal from '../modals/NewOrgModal'
import ConfirmSwitchOrgModal from '../modals/ConfirmSwitchOrgModal'

interface Organization {
  id: string
  name: string
  dbRoot: string
  createdAt: string
  isActive: boolean
}

interface OrgSwitcherProps {
  notify?: (type: 'success' | 'error' | 'info', text: string) => void
}

/**
 * Organization switcher dropdown for the top header.
 * Shows current organization and allows switching or creating new ones.
 */
export default function OrgSwitcher({ notify }: OrgSwitcherProps) {
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [activeOrg, setActiveOrg] = useState<Organization | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [showNewOrgModal, setShowNewOrgModal] = useState(false)
  const [showConfirmSwitch, setShowConfirmSwitch] = useState<Organization | null>(null)
  const [switching, setSwitching] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  async function loadOrganizations() {
    try {
      const result = await (window as any).api?.organizations?.list?.()
      if (result?.organizations) {
        setOrganizations(result.organizations)
        const active = result.organizations.find((o: Organization) => o.isActive)
        setActiveOrg(active || result.organizations[0] || null)
      }
    } catch (e) {
      console.error('Failed to load organizations:', e)
    }
  }

  useEffect(() => {
    loadOrganizations()
    
    // Reload when data changes (e.g. after rename)
    const onDataChanged = () => loadOrganizations()
    window.addEventListener('data-changed', onDataChanged)
    return () => window.removeEventListener('data-changed', onDataChanged)
  }, [])

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  // Handle keyboard navigation
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      setIsOpen(false)
    }
  }

  async function handleSwitch(org: Organization) {
    if (org.isActive || switching) return
    setSwitching(true)
    setIsOpen(false)
    try {
      await (window as any).api?.organizations?.switch?.({ orgId: org.id })
      notify?.('info', `Wechsle zu "${org.name}"…`)
      // Reload the window to reinitialize with new database
      setTimeout(() => window.location.reload(), 500)
    } catch (e: any) {
      notify?.('error', e?.message || 'Wechsel fehlgeschlagen')
      setSwitching(false)
    }
  }

  function handleNewOrg() {
    setIsOpen(false)
    setShowNewOrgModal(true)
  }

  async function handleOrgCreated(org: { id: string; name: string }) {
    setShowNewOrgModal(false)
    await loadOrganizations()
    // Show confirm modal to switch to the new org
    setShowConfirmSwitch({ ...org, dbRoot: '', createdAt: '', isActive: false })
  }

  function handleConfirmSwitch() {
    if (showConfirmSwitch) {
      handleSwitch(showConfirmSwitch)
      setShowConfirmSwitch(null)
    }
  }

  // Don't show switcher if there's only one org and no option to create more
  const showSwitcher = organizations.length > 0

  if (!showSwitcher) return null

  return (
    <>
      <div className="org-switcher" ref={dropdownRef} onKeyDown={handleKeyDown}>
        <button
          className="org-switcher-trigger"
          onClick={() => setIsOpen(!isOpen)}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-label="Organisation wechseln"
          disabled={switching}
          title={activeOrg?.name || 'Organisation wählen'}
        >
          <span className="org-switcher-icon">🏢</span>
          <span className="org-switcher-name">{activeOrg?.name || 'Organisation'}</span>
          <span className="org-switcher-arrow">{isOpen ? '▲' : '▼'}</span>
        </button>

        {isOpen && (
          <div className="org-switcher-dropdown" role="listbox">
            <div className="org-switcher-header">Organisationen</div>
            
            {organizations.map((org) => (
              <button
                key={org.id}
                className={`org-switcher-item ${org.isActive ? 'active' : ''}`}
                onClick={() => handleSwitch(org)}
                role="option"
                aria-selected={org.isActive}
                disabled={org.isActive}
              >
                <span className="org-item-name">{org.name}</span>
                {org.isActive && <span className="org-item-badge">Aktiv</span>}
              </button>
            ))}

            <div className="org-switcher-divider" />
            
            <button className="org-switcher-item org-switcher-new" onClick={handleNewOrg}>
              <span>➕</span>
              <span>Neue Organisation…</span>
            </button>
          </div>
        )}
      </div>

      {showNewOrgModal && (
        <NewOrgModal
          onClose={() => setShowNewOrgModal(false)}
          onCreated={handleOrgCreated}
          notify={notify}
        />
      )}

      {showConfirmSwitch && (
        <ConfirmSwitchOrgModal
          orgName={showConfirmSwitch.name}
          onConfirm={handleConfirmSwitch}
          onCancel={() => setShowConfirmSwitch(null)}
        />
      )}
    </>
  )
}
