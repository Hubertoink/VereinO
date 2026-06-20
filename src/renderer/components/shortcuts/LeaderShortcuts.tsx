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
    || !!element.closest('button, a, [role="button"], [role="menuitem"]')
}

function hasBlockingDialog() {
  return !!document.querySelector('.modal-overlay, .booking-modal, [role="dialog"][aria-modal="true"]')
}

export function LeaderShortcuts({ commands, leaderLabel = 'Space' }: LeaderShortcutsProps) {
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
    const onKeyDown = (event: KeyboardEvent) => {
      if (!open) {
        if (event.code !== 'Space' || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return
        if (isEditableTarget(event.target) || hasBlockingDialog()) return
        event.preventDefault()
        setOpen(true)
        setPath([])
        setInvalidKey('')
        return
      }

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
      if (event.ctrlKey || event.metaKey || event.altKey) return

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

    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
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
        title="Tastaturbefehle (Leertaste)"
      >
        <kbd>Space</kbd>
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
                <span><kbd>Esc</kbd> schließen</span>
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
