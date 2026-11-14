import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { IconHelpCircle, IconLayoutColumns, IconList, IconSettings, IconBuildingBank, IconCheck, IconX } from '@tabler/icons-react'
import type { NavKey } from '../../utils/navItems'
import { nextTutorial, readTutorialProgress, writeTutorialProgress, type TutorialId, type TutorialPage, type TutorialProgress } from '../../utils/pageTutorials'
import './pageTutorials.css'
import { placeTutorial } from '../../utils/tutorialPlacement'

const topics = {
  views: { title: 'Deine Buchungsansicht', icon: IconLayoutColumns, anchor: '[data-shortcut-nav="Buchungen"]', text: 'Plus zeigt Kalender, Buchungen und Details nebeneinander. Klassisch bietet eine Tabelle mit frei wählbaren Spalten. Du kannst die Ansicht jederzeit hier im Rechtsklickmenü wechseln.' },
  columns: { title: 'Die Tabelle passend einrichten', icon: IconList, anchor: '[data-tutorial="columns"]', text: 'Über „Spalten“ wählst du sichtbare Spalten und ihre Reihenfolge. Ziehe am Rand eines Spaltenkopfs, um die Breite anzupassen. Ein Doppelklick auf eine Buchung öffnet ihre Details.' },
  plus: { title: 'Details und Filter direkt zur Hand', icon: IconLayoutColumns, anchor: '.bp-list-toolbar', text: 'Klicke eine Buchung an, um ihre Details zu sehen. Mit dem Kalender grenzt du den Zeitraum ein. Ein Klick auf einen Tag oder ein Budget filtert die Liste. Der Stornostatus zeigt Original und Gegenbuchung zusammen.' },
  workflow: { title: 'So erfasst du am liebsten', icon: IconSettings, anchor: '[data-shortcut-nav="Buchungen"]', text: 'In Einstellungen → Workflow legst du fest, ob neue Buchungen im Dialog, seitlich oder in einem eigenen Fenster geöffnet werden. Dort wählst du auch, ob nach dem Speichern geschlossen oder die nächste Buchung vorbereitet wird.' },
  bank: { title: 'Vom Bankbeleg zur Buchung', icon: IconBuildingBank, anchor: '.bank-table thead', text: 'Ein importierter Bankbeleg ist noch keine Buchung. Öffne eine Zeile und prüfe die Zuordnung zu einer vorhandenen Buchung oder den Entwurf für eine neue. Auch KI-Vorschläge prüfst du vor der Übernahme.' },
} as const
const supported = (page: string): page is TutorialPage => page === 'Buchungen' || page === 'Bankimport'
const visible = (element: Element) => element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden' && !element.closest('[hidden], [inert]')
function blocked() {
  return Array.from(document.querySelectorAll('[aria-modal="true"], [role="dialog"], [role="alertdialog"], .modal-overlay, .compact-booking-flyout, .filter-dropdown__panel')).some(visible)
}
type OpenCard = { topic: TutorialId | 'index'; manual: boolean; page: TutorialPage }
type Menu = { page: TutorialPage; x: number; y: number; trigger: HTMLElement }
type Props = { page: NavKey; bookingView: 'classic' | 'plus'; setBookingView: (view: 'classic' | 'plus') => void; openSettings: (tile: string) => void }

export default function PageTutorials({ page, bookingView, setBookingView, openSettings }: Props) {
  const [organization, setOrganization] = useState<{ id: string; progress: TutorialProgress } | null>(null)
  const organizationRef = useRef(organization)
  organizationRef.current = organization
  const [card, setCard] = useState<OpenCard | null>(null)
  const [menu, setMenu] = useState<Menu | null>(null)
  const [requestedHelp, setRequestedHelp] = useState<TutorialPage | null>(null)
  const [suppressed, setSuppressed] = useState(true)
  const [position, setPosition] = useState({ top: 80, left: 16, maxHeight: window.innerHeight - 24 })
  const cardRef = useRef<HTMLElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const returnFocus = useRef<HTMLElement | null>(null)
  const visitShown = useRef(false)
  const [draftView, setDraftView] = useState(bookingView)

  const positionCard = useCallback(() => {
    if (!card || !cardRef.current) return
    const navigation = `[data-shortcut-nav="${page}"]`
    const selector = card.topic === 'index' ? navigation : topics[card.topic].anchor
    const onScreen = (element: Element) => {
      const rect = element.getBoundingClientRect()
      return visible(element) && rect.bottom > 0 && rect.top < window.innerHeight && rect.right > 0 && rect.left < window.innerWidth
    }
    const anchor = Array.from(document.querySelectorAll(selector)).find(onScreen) || Array.from(document.querySelectorAll(navigation)).find(onScreen)
    const node = cardRef.current
    const next = placeTutorial(anchor?.getBoundingClientRect(), node.offsetWidth, node.scrollHeight + 2, window.innerWidth, window.innerHeight)
    setPosition(previous => previous.left === next.left && previous.top === next.top && previous.maxHeight === next.maxHeight ? previous : next)
  }, [card, page])

  useLayoutEffect(() => {
    if (!card || suppressed || menu) return
    positionCard()
    const observer = new ResizeObserver(positionCard)
    if (cardRef.current) observer.observe(cardRef.current)
    window.addEventListener('resize', positionCard)
    window.addEventListener('scroll', positionCard, true)
    return () => { observer.disconnect(); window.removeEventListener('resize', positionCard); window.removeEventListener('scroll', positionCard, true) }
  }, [card, suppressed, menu, positionCard])

  function updateProgress(change: (progress: TutorialProgress) => TutorialProgress) {
    const current = organizationRef.current
    if (!current) return
    const next = { id: current.id, progress: change(current.progress) }
    organizationRef.current = next
    writeTutorialProgress(next.id, next.progress)
    setOrganization(next)
  }

  useEffect(() => {
    let generation = 0
    async function load() {
      const request = ++generation
      setOrganization(null); organizationRef.current = null
      setCard(null); setMenu(null); setRequestedHelp(null); visitShown.current = false
      try {
        const active = await window.api.organizations.active()
        if (request !== generation || !active.organization) return
        const id = active.organization.id
        let progress = readTutorialProgress(id)
        if (!progress) {
          const [setup, vouchers] = await Promise.all([window.api.settings.get({ key: 'setup.completed' }), window.api.vouchers.list({ limit: 1 })])
          if (request !== generation) return
          // An update must not restart onboarding for established organizations.
          progress = { automatic: setup.value !== true && vouchers.rows.length === 0, seen: {}, dismissed: {}, later: {} }
          writeTutorialProgress(id, progress)
        }
        if (request === generation) setOrganization({ id, progress })
      } catch { /* Help remains available manually if initialization fails. */ }
    }
    void load()
    const off = window.api.organizations.onSwitched(() => void load())
    return () => { generation++; off?.() }
  }, [])

  useEffect(() => {
    setCard(null); setMenu(null); visitShown.current = false
  }, [page])

  useEffect(() => {
    if (!requestedHelp || page !== requestedHelp) return
    visitShown.current = true
    setDraftView(bookingView)
    setCard({ topic: 'index', manual: true, page: requestedHelp })
    setRequestedHelp(null)
  }, [requestedHelp, page, bookingView])

  useEffect(() => {
    const onEvent = (event: Event) => {
      const kind = (event as CustomEvent).detail
      if (kind !== 'booking-saved' && kind !== 'bank-imported') return
      const progress = organizationRef.current?.progress
      if (progress && !(kind === 'booking-saved' ? progress.bookingSaved : progress.bankImported)) visitShown.current = false
      updateProgress(progress => ({ ...progress, [kind === 'booking-saved' ? 'bookingSaved' : 'bankImported']: true }))
    }
    window.addEventListener('vereinO:tutorial-event', onEvent)
    const off = window.api.quickAdd?.onSaved?.(payload => {
      if (payload.mode === 'create' && !payload.deleted) onEvent(new CustomEvent('event', { detail: 'booking-saved' }))
    })
    return () => { window.removeEventListener('vereinO:tutorial-event', onEvent); off?.() }
  }, [])

  // Delegate from both navigation layouts, including collapsed icon-only navigation.
  useEffect(() => {
    const open = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent && event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return
      const trigger = (event.target as Element)?.closest<HTMLElement>('[data-shortcut-nav]')
      const target = trigger?.dataset.shortcutNav
      if (!trigger || !target || !supported(target)) return
      event.preventDefault(); event.stopPropagation()
      const rect = trigger.getBoundingClientRect()
      returnFocus.current = trigger
      setCard(null); visitShown.current = true
      setMenu({ page: target, trigger, x: event instanceof MouseEvent && event.clientX ? event.clientX : rect.right, y: event instanceof MouseEvent && event.clientY ? event.clientY : rect.bottom })
    }
    document.addEventListener('contextmenu', open)
    document.addEventListener('keydown', open, true)
    return () => { document.removeEventListener('contextmenu', open); document.removeEventListener('keydown', open, true) }
  }, [])

  useEffect(() => {
    if (!menu) return
    const node = menuRef.current
    if (node) {
      node.style.left = `${Math.max(8, Math.min(menu.x, window.innerWidth - node.offsetWidth - 8))}px`
      node.style.top = `${Math.max(8, Math.min(menu.y, window.innerHeight - node.offsetHeight - 8))}px`
      node.querySelector<HTMLButtonElement>('button')?.focus()
    }
    const outside = (event: PointerEvent) => { if (!menuRef.current?.contains(event.target as Node)) setMenu(null) }
    const close = () => setMenu(null)
    document.addEventListener('pointerdown', outside)
    window.addEventListener('resize', close)
    window.addEventListener('scroll', close, true)
    return () => { document.removeEventListener('pointerdown', outside); window.removeEventListener('resize', close); window.removeEventListener('scroll', close, true) }
  }, [menu])

  useEffect(() => {
    if (!supported(page)) return
    let readySince = 0
    const check = () => {
      const root = document.querySelector(page === 'Bankimport' ? '[data-tutorial="bank"]' : bookingView === 'plus' ? '[data-tutorial="plus"]' : '[data-tutorial="classic"]')
      const unavailable = !root || !visible(root) || blocked() || !!root.querySelector('[aria-busy="true"]') || root.getAttribute('aria-busy') === 'true' || document.visibilityState === 'hidden'
      setSuppressed(unavailable)
      if (unavailable || menu) { readySince = 0; return }
      if (!readySince) readySince = Date.now()
      if (!card && !visitShown.current && Date.now() - readySince >= 1800) {
        const progress = organizationRef.current?.progress
        const topic = progress && nextTutorial(progress, page, bookingView)
        if (topic) {
          visitShown.current = true
          returnFocus.current = document.activeElement as HTMLElement | null
          setCard({ topic, manual: false, page })
          updateProgress(current => ({ ...current, seen: { ...current.seen, [topic]: true } }))
        }
      }
      if (card) positionCard()
    }
    check()
    const timer = window.setInterval(check, 250)
    return () => window.clearInterval(timer)
  }, [page, bookingView, card, menu, positionCard])

  useEffect(() => { if (card?.manual && !suppressed) titleRef.current?.focus({ preventScroll: true }) }, [card, suppressed])

  function closeCard(later = false) {
    if (card && card.topic !== 'index' && !card.manual) {
      const topic = card.topic
      updateProgress(progress => later
        ? { ...progress, seen: { ...progress.seen, [topic]: false }, later: { ...progress.later, [topic]: Date.now() + 86400000 } }
        : { ...progress, dismissed: { ...progress.dismissed, [topic]: true } })
    }
    const restore = cardRef.current?.contains(document.activeElement)
    setCard(null); visitShown.current = true
    if (restore) returnFocus.current?.focus({ preventScroll: true })
  }

  const showHelp = () => {
    if (!menu) return
    const target = menu.page
    menu.trigger.click() // Also closes the responsive navigation drawer.
    setMenu(null)
    setRequestedHelp(target)
  }
  const topic = card && card.topic !== 'index' ? topics[card.topic] : null
  const TopicIcon = topic?.icon || IconHelpCircle

  return createPortal(<>
    {menu && <div className="page-help-menu" ref={menuRef} role="menu" aria-label={`${menu.page}: Aktionen`} data-shortcut-ignore onKeyDown={event => {
      const buttons = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('button') || [])
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault(); event.stopPropagation()
        buttons[event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus()
      }
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setMenu(null); menu.trigger.focus() }
      if (event.key === 'Tab') { setMenu(null); menu.trigger.focus() }
    }}>
      <div className="page-help-menu-label">{menu.page}</div>
      <button type="button" role="menuitem" onClick={showHelp}><IconHelpCircle size={17} />Hilfe zu dieser Seite</button>
      {menu.page === 'Buchungen' && <><div role="separator" /><div className="page-help-menu-label">Buchungsansicht</div>{(['classic', 'plus'] as const).map(view => <button type="button" key={view} role="menuitemradio" aria-checked={bookingView === view} onClick={() => { setBookingView(view); menu.trigger.click(); setMenu(null); menu.trigger.focus() }}><IconCheck size={16} style={{ visibility: bookingView === view ? 'visible' : 'hidden' }} />{view === 'classic' ? 'Klassisch' : 'Plus'}</button>)}</>}
    </div>}
    {card && card.page === page && !suppressed && !menu && <aside ref={cardRef} className="page-help-card" role="region" aria-live={card.manual ? 'off' : 'polite'} aria-labelledby="page-help-title" style={position} data-shortcut-ignore onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeCard(true) } }}>
      <header><span className="page-help-icon"><TopicIcon size={21} /></span><div><small>{card.manual ? 'Hilfe zu dieser Seite' : 'Tipp für deinen Einstieg'}</small><h2 ref={titleRef} tabIndex={-1} id="page-help-title">{topic?.title || (page === 'Buchungen' ? 'Buchungen kennenlernen' : 'Bankimport kennenlernen')}</h2></div>{card.manual && <button className="page-help-close" aria-label="Hilfe schließen" onClick={() => closeCard()}><IconX size={18} /></button>}</header>
      {card.topic === 'index' ? <div className="page-help-topics">{(page === 'Bankimport' ? ['bank'] : ['views', bookingView === 'classic' ? 'columns' : 'plus', 'workflow']).map(id => { const item = topics[id as TutorialId]; const Icon = item.icon; return <button type="button" key={id} onClick={() => { updateProgress(progress => ({ ...progress, seen: { ...progress.seen, [id]: true } })); setCard({ ...card, topic: id as TutorialId }) }}><Icon size={18} /><span>{item.title}</span></button> })}<p>Rechtsklick auf den Navigationseintrag öffnet diese Hilfe jederzeit wieder. Mit der Tastatur: Umschalt + F10.</p></div> : <>
        <p>{topic?.text}</p>
        {card.manual && card.topic === 'views' && <div className="page-help-view-choice">
          <label>Ansicht ausprobieren<select className="input" value={draftView} onChange={event => setDraftView(event.target.value as 'classic' | 'plus')}><option value="classic">Klassisch</option><option value="plus">Plus</option></select></label>
          <div className={`page-help-preview page-help-preview--${draftView}`} aria-label={`Vorschau: ${draftView === 'plus' ? 'Plus' : 'Klassisch'}`}>{draftView === 'plus' && <span>Kalender<br />September<br /><br />Filter</span>}<div><b>Buchungen</b><span>Mitgliedsbeitrag <strong>+50,00 €</strong></span><span>Material <strong>−12,90 €</strong></span></div>{draftView === 'plus' && <span>Details<br /><br />Bank</span>}</div>
          <button type="button" className="btn primary" disabled={draftView === bookingView} onClick={() => { setBookingView(draftView); closeCard() }}>Ansicht übernehmen</button>
        </div>}
        {card.manual && card.topic === 'workflow' && <button className="btn" onClick={() => { closeCard(); openSettings('workflow') }}>Workflow-Einstellungen öffnen</button>}
        <footer>{card.manual ? <button className="btn" onClick={() => setCard({ ...card, topic: 'index' })}>Zur Übersicht</button> : <><button className="btn" onClick={() => closeCard(true)}>Später</button><button className="btn ghost" onClick={() => closeCard()}>Nicht mehr anzeigen</button></>}</footer>
      </>}
    </aside>}
  </>, document.body)
}
