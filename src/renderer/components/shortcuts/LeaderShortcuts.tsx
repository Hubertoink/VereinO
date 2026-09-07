import React, { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'

export type ShortcutCommand = {
  key: string
  label: string
  description?: string
  action?: () => void
  children?: ShortcutCommand[]
  disabled?: boolean
  icon?: React.ReactNode
}

type LeaderShortcutsProps = {
  commands: ShortcutCommand[]
  leaderLabel?: string
}

function isEditableTarget(target: EventTarget | null) {
  const element = target instanceof HTMLElement ? target : null
  if (!element) return false
  const tag = element.tagName.toLowerCase()
  return element.isContentEditable
    || tag === 'input'
    || tag === 'textarea'
    || tag === 'select'
}

function hasBlockingDialog() {
  return !!document.querySelector('.modal-overlay, .booking-modal, .compact-booking-flyout, [role="dialog"][aria-modal="true"]')
}

export function LeaderShortcuts({ commands, leaderLabel = 'Alt' }: LeaderShortcutsProps) {
  const [path, setPath] = useState<ShortcutCommand[]>([])
  const [open, setOpen] = useState(false)
  const [invalidKey, setInvalidKey] = useState('')

  const currentCommands = path.at(-1)?.children ?? commands
  const pathLabel = useMemo(
    () => [leaderLabel, ...path.map((command) => command.key.toUpperCase())].join('  ›  '),
    [leaderLabel, path]
  )

  const close = () => {
    setOpen(false)
    setPath([])
    setInvalidKey('')
  }

  const selectCommand = (command: ShortcutCommand) => {
    if (command.disabled) return
    if (command.children?.length) {
      setPath((previous) => [...previous, command])
      setInvalidKey('')
      return
    }
    close()
    command.action?.()
  }

  useEffect(() => {
    // Only a standalone Alt press toggles the guide. Windows may consume Tab
    // during Alt+Tab, so losing focus must also cancel the pending press.
    let altPending = false
    const cancelAlt = () => { altPending = false }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Alt') {
        if (event.repeat) return
        altPending = !event.ctrlKey && !event.metaKey && !event.shiftKey
          && (open || (!isEditableTarget(event.target) && !hasBlockingDialog()))
        return
      }
      cancelAlt()
      if (!open || event.ctrlKey || event.metaKey || event.altKey) return

      if (event.key === 'Escape') {
        event.preventDefault()
        close()
        return
      }
      if (event.key === 'Backspace') {
        event.preventDefault()
        if (path.length) setPath((previous) => previous.slice(0, -1))
        else close()
        return
      }
      const key = event.key.toLowerCase()
      const command = currentCommands.find((candidate) => candidate.key.toLowerCase() === key)
      if (!command) {
        if (key.length === 1) {
          event.preventDefault()
          setInvalidKey(event.key.toUpperCase())
          window.setTimeout(() => setInvalidKey(''), 700)
        }
        return
      }
      event.preventDefault()
      selectCommand(command)
    }

    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key !== 'Alt') return
      const shouldToggle = altPending
      cancelAlt()
      if (!shouldToggle || event.ctrlKey || event.metaKey || event.shiftKey || !document.hasFocus()) return
      if (!open && (isEditableTarget(event.target) || hasBlockingDialog())) return
      event.preventDefault()
      if (open) close()
      else {
        setOpen(true)
        setPath([])
        setInvalidKey('')
      }
    }
    const onVisibilityChange = () => {
      if (document.hidden) cancelAlt()
    }

    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('keyup', onKeyUp, true)
    window.addEventListener('blur', cancelAlt)
    window.addEventListener('pointerdown', cancelAlt, true)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('keyup', onKeyUp, true)
      window.removeEventListener('blur', cancelAlt)
      window.removeEventListener('pointerdown', cancelAlt, true)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [commands, currentCommands, open, path.length])

  return (
    <>
      <button
        className="leader-shortcut-trigger"
        type="button"
        onClick={() => {
          if (open) close()
          else if (!hasBlockingDialog()) setOpen(true)
        }}
        aria-label="Tastaturbefehle öffnen"
        title="Tastaturbefehle (Alt)"
      >
        <kbd>Alt</kbd>
        <span>Befehle</span>
      </button>

      {open && createPortal(
        <div className="leader-shortcut-layer" role="dialog" aria-modal="true" aria-label="Tastaturbefehle">
          <button className="leader-shortcut-backdrop" onClick={close} aria-label="Tastaturbefehle schließen" />
          <section className="leader-shortcut-panel">
            <header className="leader-shortcut-header">
              <div>
                <div className="leader-shortcut-eyebrow">Tastaturbefehle</div>
                <strong>{pathLabel}</strong>
              </div>
              <div className="leader-shortcut-help">
                {invalidKey ? <span className="leader-shortcut-invalid">„{invalidKey}“ ist hier nicht belegt</span> : null}
                {path.length ? <span><kbd>⌫</kbd> zurück</span> : null}
                <span><kbd>Alt</kbd> / <kbd>Esc</kbd> schließen</span>
              </div>
            </header>

            <div className="leader-shortcut-grid">
              {currentCommands.map((command) => (
                <button
                  className={`leader-shortcut-command${command.icon ? ' has-icon' : ''}`}
                  type="button"
                  key={command.key}
                  onClick={() => selectCommand(command)}
                  disabled={command.disabled}
                >
                  <kbd>{command.key.toUpperCase()}</kbd>
                  {command.icon ? <span className="leader-shortcut-command-icon">{command.icon}</span> : null}
                  <span className="leader-shortcut-command-copy">
                    <strong>{command.label}</strong>
                    {command.description ? <small>{command.description}</small> : null}
                  </span>
                  {command.children?.length ? <span className="leader-shortcut-arrow">›</span> : null}
                </button>
              ))}
            </div>
          </section>
        </div>,
        document.body
      )}
    </>
  )
}
