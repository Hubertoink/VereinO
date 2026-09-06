import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import './shortcuts.css'

export type ShortcutCommand = {
  key: string
  label: string
  description?: string
  action?: () => void
  target?: string
  global?: boolean
  disabled?: boolean
}

type Hint = ShortcutCommand & { element: HTMLElement; left: number; top: number }
const alphabet = 'abcdefghijklmnopqrstuvwxyz'
const normalize = (text: string) => text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
const labelOf = (element: HTMLElement) => element.getAttribute('aria-label') || element.getAttribute('title') || element.getAttribute('placeholder') || element.textContent?.trim() || ''

function visible(element: HTMLElement) {
  if (element.closest('[hidden], [inert], [aria-hidden="true"], [data-shortcut-ui], [data-shortcut-ignore]') || element.matches(':disabled, [aria-disabled="true"]')) return false
  const rect = element.getBoundingClientRect()
  if (!rect.width || !rect.height || getComputedStyle(element).visibility === 'hidden') return false
  const x = Math.max(0, rect.left) + Math.min(rect.width, window.innerWidth - Math.max(0, rect.left)) / 2
  const y = Math.max(0, rect.top) + Math.min(rect.height, window.innerHeight - Math.max(0, rect.top)) / 2
  if (rect.bottom <= 0 || rect.right <= 0 || rect.top >= innerHeight || rect.left >= innerWidth) return false
  const hit = document.elementFromPoint(x, y)
  return !!hit && element.contains(hit)
}

function stackingLevel(element: HTMLElement) {
  let level = 0
  for (let parent: HTMLElement | null = element; parent; parent = parent.parentElement) {
    level = Math.max(level, Number(getComputedStyle(parent).zIndex) || 0)
  }
  return level
}

function collectHints(commands: ShortcutCommand[]): Hint[] {
  // Only expose the foreground dialog's controls while a dialog is open.
  const dialogs = [...document.querySelectorAll<HTMLElement>('.modal-overlay, .booking-modal, .compact-booking-flyout, [role="dialog"]')]
    .filter(element => !element.closest('[data-shortcut-ui]') && element.getClientRects().length && !element.closest('[hidden]') && getComputedStyle(element).visibility !== 'hidden')
    .sort((a, b) => stackingLevel(a) - stackingLevel(b))
  const dialog = dialogs.at(-1)
  const candidates = [...document.querySelectorAll<HTMLElement>('button, summary, [role="tab"], input[type="search"], input[placeholder*="Such"], input[placeholder*="such"]')]
    .filter(element => (!dialog || dialog.contains(element) || element.closest('.select-dropdown__menu--portal, .party-selector__menu--portal')) && visible(element) && !!labelOf(element))
  const hints: Hint[] = []
  // Y is the prefix for additional actions on pages with many controls.
  const used = new Set(['y', ...commands.filter(command => command.global).map(command => command.key)])
  const assigned = new Set<HTMLElement>()
  const add = (element: HTMLElement, command: ShortcutCommand) => {
    const preferred = normalize(command.key)
    const key = command.global || (!used.has(preferred) && /^[a-z]$/.test(preferred)) ? preferred
      : [...normalize(command.label), ...alphabet].find(letter => /^[a-z]$/.test(letter) && !used.has(letter))
        ?? Array.from({ length: 676 }, (_, index) => `y${alphabet[Math.floor(index / 26)]}${alphabet[index % 26]}`).find(value => !used.has(value))
    if (!key) return
    used.add(key)
    assigned.add(element)
    const rect = element.getBoundingClientRect()
    hints.push({ ...command, key, element, left: Math.max(4, Math.min(innerWidth - 42, rect.right - 18)), top: Math.max(4, rect.top - 7) })
  }
  for (const command of commands) {
    if ((command.global && !command.target) || command.disabled) continue
    const element = candidates.find(candidate => !assigned.has(candidate) && (command.target
      ? candidate.matches(command.target)
      : normalize(labelOf(candidate)) === normalize(command.label)))
    if (element) add(element, command)
  }
  for (const element of candidates) {
    if (assigned.has(element)) continue
    const label = labelOf(element)
    add(element, { key: element.dataset.shortcut || normalize(label)[0], label, action: () => {
      element.focus()
      if (!(element instanceof HTMLInputElement)) element.click()
    } })
  }
  return hints
}

export function LeaderShortcuts({ commands }: { commands: ShortcutCommand[] }) {
  const [open, setOpen] = useState(false)
  const [hints, setHints] = useState<Hint[]>([])
  const [prefix, setPrefix] = useState('')
  const openRef = useRef(false)
  const hintsRef = useRef<Hint[]>([])
  const prefixRef = useRef('')
  const close = () => {
    openRef.current = false
    prefixRef.current = ''
    setOpen(false)
    setPrefix('')
  }
  const show = () => {
    hintsRef.current = collectHints(commands)
    setHints(hintsRef.current)
    openRef.current = true
    setOpen(true)
  }

  useEffect(() => {
    let altPending = false
    let wasOpen = false
    const cancel = () => { altPending = false; close() }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Alt' && !event.repeat && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
        altPending = true
        wasOpen = openRef.current
        if (!wasOpen) show()
        event.preventDefault()
        return
      }
      if (event.key === 'Alt') return
      altPending = false
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.getModifierState('AltGraph')) {
        if (openRef.current) close()
        return
      }
      if (event.key === 'Escape' && openRef.current) {
        event.preventDefault()
        event.stopImmediatePropagation()
        close()
        return
      }
      if (!event.altKey && !openRef.current) return
      const key = event.key.toLowerCase()
      if (key.length !== 1) { close(); return }
      // Global combinations also work in inputs and foreground dialogs.
      const global = prefixRef.current ? undefined : commands.find(command => command.global && command.key === key && !command.disabled)
      const current = collectHints(commands)
      const sequence = prefixRef.current + key
      const hint = current.find(candidate => candidate.key === sequence)
      if (global || hint) {
        event.preventDefault()
        event.stopImmediatePropagation()
        if (event.repeat) return
        close()
        ;(global ?? hint)?.action?.()
      } else if (current.some(candidate => candidate.key.startsWith(sequence))) {
        event.preventDefault()
        prefixRef.current = sequence
        setPrefix(sequence)
      } else {
        close()
      }
    }
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key !== 'Alt') return
      // Electron must not focus its native menu when Alt is released.
      if (altPending || openRef.current) event.preventDefault()
      if (altPending && wasOpen) close()
      altPending = false
    }
    const onPointer = (event: PointerEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest('[data-shortcut-ui]')) cancel()
    }
    const onVisibility = () => { if (document.hidden) cancel() }
    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('keyup', onKeyUp, true)
    window.addEventListener('blur', cancel)
    window.addEventListener('pointerdown', onPointer, true)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('keyup', onKeyUp, true)
      window.removeEventListener('blur', cancel)
      window.removeEventListener('pointerdown', onPointer, true)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [commands])

  useEffect(() => {
    if (!open) return
    let frame = 0
    const refresh = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const next = collectHints(commands)
        const previous = hintsRef.current
        if (next.length === previous.length && next.every((hint, index) => {
          const old = previous[index]
          return hint.element === old.element && hint.key === old.key && hint.left === old.left && hint.top === old.top && hint.label === old.label
        })) return
        hintsRef.current = next
        setHints(next)
      })
    }
    const observer = new MutationObserver(refresh)
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'hidden', 'class', 'style', 'aria-expanded'] })
    window.addEventListener('resize', refresh)
    window.addEventListener('scroll', refresh, true)
    refresh()
    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', refresh)
      window.removeEventListener('scroll', refresh, true)
    }
  }, [open, commands])

  return <>
    <button className="leader-shortcut-trigger" data-shortcut-ui type="button" aria-label="Tastaturbefehle anzeigen" aria-expanded={open} title="Tastaturbefehle (Alt)" onClick={() => openRef.current ? close() : show()}>
      <kbd>Alt</kbd><span>Befehle</span>
    </button>
    {open && createPortal(<div className="shortcut-hints" data-shortcut-ui>
      {hints.filter(hint => hint.key.startsWith(prefix)).map(hint => <kbd key={hint.key} className="shortcut-badge" style={{ left: hint.left, top: hint.top }} aria-label={`${hint.label}: Alt + ${hint.key.toUpperCase()}`}>{hint.key.toUpperCase()}</kbd>)}
      <aside className="shortcut-global-flyout" aria-label="Globale Tastaturbefehle">
        <div className="shortcut-global-heading"><strong>Überall verfügbar</strong><button type="button" onClick={close} aria-label="Tastaturbefehle schließen">×</button></div>
        {commands.filter(command => command.global).map(command => <button type="button" className="shortcut-global-command" key={command.key} disabled={command.disabled} onClick={() => { close(); command.action?.() }}>
          <span>{command.label}</span><kbd>Alt + {command.key.toUpperCase()}</kbd>
        </button>)}
        <small>Alt halten oder antippen · Buchstaben wählen · Esc schließen</small>
      </aside>
    </div>, document.body)}
  </>
}
