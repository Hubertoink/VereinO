import React, { useEffect, useRef, useState } from 'react'
import { SideNav, type SideNavProps } from './SideNav'
import './sidebar.css'
import { createPortal } from 'react-dom'
import { ChangelogModal } from '../modals/ChangelogModal'

export function AppSidebar(props: SideNavProps) {
  const [appVersion, setAppVersion] = useState('')
  const [showChangelog, setShowChangelog] = useState(false)
  useEffect(() => {
    let disposed = false
    window.api.app.version().then(result => { if (!disposed) setAppVersion(result.version) }).catch(() => {})
    return () => { disposed = true }
  }, [])
  const [narrow, setNarrow] = useState(() => window.matchMedia('(max-width: 1050px)').matches)
  const [overlayOpen, setOverlayOpen] = useState(false)
  const aside = useRef<HTMLElement>(null)
  const collapsed = narrow ? !overlayOpen : props.collapsed
  useEffect(() => {
    const media = window.matchMedia('(max-width: 1050px)')
    const change = () => { setNarrow(media.matches); setOverlayOpen(false) }
    media.addEventListener('change', change)
    return () => media.removeEventListener('change', change)
  }, [])
  useEffect(() => window.api.organizations.onSwitched(() => setOverlayOpen(false)), [])
  useEffect(() => {
    if (!narrow || !overlayOpen) return
    const root = aside.current?.closest('.app-root-grid')
    const siblings = Array.from(root?.querySelectorAll<HTMLElement>(':scope > .app-main, :scope > .app-header') || [])
    const previous = siblings.map(element => element.inert)
    siblings.forEach(element => { element.inert = true })
    aside.current?.querySelector<HTMLButtonElement>('.sidebar-toggle')?.focus()
    return () => {
      siblings.forEach((element, index) => { element.inert = previous[index] })
      aside.current?.querySelector<HTMLButtonElement>('.sidebar-toggle')?.focus()
    }
  }, [narrow, overlayOpen])
  return <>
    {narrow && overlayOpen && <div className="sidebar-backdrop" aria-hidden="true" onClick={() => setOverlayOpen(false)} />}
    <aside ref={aside} className={`app-sidebar ${collapsed ? 'app-sidebar--collapsed' : 'app-sidebar--expanded'}${narrow && overlayOpen ? ' app-sidebar--overlay' : ''}`} role={narrow && overlayOpen ? 'dialog' : undefined} aria-modal={narrow && overlayOpen ? true : undefined} aria-label={narrow && overlayOpen ? 'Navigation' : undefined}
      onKeyDown={event => {
        if (!narrow || !overlayOpen) return
        if (event.key === 'Escape') { event.preventDefault(); setOverlayOpen(false) }
        if (event.key !== 'Tab') return
        const buttons = Array.from(aside.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') || [])
        const first = buttons[0], last = buttons[buttons.length - 1]
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
      }}>
      <SideNav {...props} appVersion={appVersion} onOpenChangelog={() => { setOverlayOpen(false); setShowChangelog(true) }} collapsed={collapsed} onToggleCollapse={() => narrow ? setOverlayOpen(value => !value) : props.onToggleCollapse?.()} onNavigate={page => { props.onNavigate(page); setOverlayOpen(false) }} onSelectAccount={props.onSelectAccount ? id => { props.onSelectAccount?.(id); setOverlayOpen(false) } : undefined} onSelectBankAccount={props.onSelectBankAccount ? id => { props.onSelectBankAccount?.(id); setOverlayOpen(false) } : undefined} onSelectMembershipFees={props.onSelectMembershipFees ? () => { props.onSelectMembershipFees?.(); setOverlayOpen(false) } : undefined} onSelectAssignment={props.onSelectAssignment ? (kind, id) => { props.onSelectAssignment?.(kind, id); setOverlayOpen(false) } : undefined} />
    </aside>
    {showChangelog && createPortal(<ChangelogModal appVersion={appVersion} onClose={() => setShowChangelog(false)} />, document.body)}
  </>
}
