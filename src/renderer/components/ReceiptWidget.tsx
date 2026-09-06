import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import {
  IconFilePlus,
  IconX,
  IconArrowUpRight,
  IconGripVertical,
  IconChevronRight,
  IconChevronLeft
} from '@tabler/icons-react'
import { encodeFileForUpload } from '../utils/fileEncoding'
import type { WidgetState } from '../../../shared/receiptWidget'

export default function ReceiptWidget() {
  const input = useRef<HTMLInputElement>(null)
  const busyRef = useRef(false)
  const timers = useRef<{
    shrink?: ReturnType<typeof setTimeout>
    leave?: ReturnType<typeof setTimeout>
  }>({})
  const requestedExpanded = useRef(false)
  const pointer = useRef<{ x: number; y: number; moved: boolean } | null>(null)
  const suppressClick = useRef(false)
  const moving = useRef(false)
  const [state, setState] = useState<WidgetState>({ expanded: false, edge: 'right' })
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState('')
  const [organization, setOrganization] = useState('')

  useEffect(() => {
    document.body.classList.add('receipt-widget-document')
    document.documentElement.classList.add('receipt-widget-document')
    let alive = true
    const load = () => {
      void window.api.organizations
        .active()
        .then(({ organization }) => {
          if (alive) setOrganization(organization?.name || 'VereinO')
        })
        .catch(() => {
          if (alive) setError('Verein konnte nicht geladen werden.')
        })
    }
    load()
    void window.api.receiptWidget.state().then((next) => {
      if (alive) {
        requestedExpanded.current = next.expanded
        setState(next)
      }
    })
    const offState = window.api.receiptWidget.onState((next) => setState(next))
    const offOrg = window.api.organizations.onSwitched(load)
    const currentTimers = timers.current
    return () => {
      alive = false
      offState()
      offOrg()
      clearTimeout(currentTimers.shrink)
      clearTimeout(currentTimers.leave)
      document.body.classList.remove('receipt-widget-document')
      document.documentElement.classList.remove('receipt-widget-document')
    }
  }, [])

  function expand(next: boolean) {
    clearTimeout(timers.current.leave)
    if (requestedExpanded.current === next) return
    requestedExpanded.current = next
    clearTimeout(timers.current.shrink)
    if (next) {
      void window.api.receiptWidget.setExpanded(true).catch(() => {
        requestedExpanded.current = false
        setError('Widget konnte nicht geöffnet werden.')
      })
    } else {
      setState((current) => ({ ...current, expanded: false }))
      timers.current.shrink = setTimeout(() => {
        void window.api.receiptWidget.setExpanded(false)
      }, 190)
    }
  }
  function leave() {
    clearTimeout(timers.current.leave)
    if (busyRef.current || pointer.current) return
    timers.current.leave = setTimeout(() => {
      setDragging(false)
      expand(false)
    }, 750)
  }
  function startMove(event: ReactPointerEvent<HTMLElement>) {
    if (event.button !== 0) return
    pointer.current = { x: event.screenX, y: event.screenY, moved: false }
    suppressClick.current = false
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  function move(event: ReactPointerEvent<HTMLElement>) {
    const origin = pointer.current
    if (!origin) return
    if (Math.hypot(event.screenX - origin.x, event.screenY - origin.y) < 5 && !origin.moved) return
    origin.moved = true
    suppressClick.current = true
    if (moving.current) return
    moving.current = true
    void window.api.receiptWidget.move(false).finally(() => {
      moving.current = false
    })
  }
  function endMove() {
    if (pointer.current?.moved)
      void window.api.receiptWidget
        .move(true)
        .catch(() => setError('Position konnte nicht gespeichert werden.'))
    pointer.current = null
  }

  async function accept(files: FileList | null) {
    if (!files?.length || busyRef.current) return
    expand(true)
    setError('')
    if (files.length !== 1) {
      setError('Bitte jeweils einen Beleg ablegen.')
      return
    }
    const file = files[0]
    if (!/\.(pdf|png|jpe?g|webp)$/i.test(file.name)) {
      setError('Bitte ein PDF oder Bild auswählen.')
      return
    }
    if (file.size === 0 || file.size > 25 * 1024 * 1024) {
      setError('Bitte einen nicht leeren Beleg bis 25 MB auswählen.')
      return
    }
    busyRef.current = true
    setBusy(true)
    clearTimeout(timers.current.leave)
    try {
      const response = await window.api.quickAdd.openDetached({
        mode: 'invoice',
        receiptIntake: true,
        files: [await encodeFileForUpload(file)]
      })
      if (!response.ok) throw new Error(response.error || 'Erfassung konnte nicht geöffnet werden.')
      expand(false)
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Beleg konnte nicht geöffnet werden.')
    } finally {
      busyRef.current = false
      setBusy(false)
      if (input.current) input.current.value = ''
    }
  }

  return (
    <main
      className={`receipt-widget receipt-widget--${state.edge}${state.expanded ? ' is-expanded' : ''}${dragging ? ' is-dragging' : ''}`}
      onMouseEnter={() => clearTimeout(timers.current.leave)}
      onMouseLeave={leave}
      onDragEnter={(event) => {
        if (event.dataTransfer.types.includes('Files')) {
          event.preventDefault()
          setDragging(true)
          expand(true)
        }
      }}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes('Files')) {
          event.preventDefault()
          event.dataTransfer.dropEffect = 'copy'
          setDragging(true)
          expand(true)
        }
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) leave()
      }}
      onDrop={(event) => {
        event.preventDefault()
        setDragging(false)
        void accept(event.dataTransfer.files)
      }}
    >
      <button
        type="button"
        className="receipt-widget__droplet"
        aria-label="Belegwidget aufklappen"
        aria-expanded={state.expanded}
        title="Beleg ablegen · Zum Verschieben ziehen"
        onPointerDown={startMove}
        onPointerMove={move}
        onPointerUp={endMove}
        onPointerCancel={endMove}
        onLostPointerCapture={endMove}
        onClick={() => {
          if (!suppressClick.current) expand(!requestedExpanded.current)
        }}
      >
        <IconFilePlus size={22} />
      </button>
      <section className="receipt-widget__panel" aria-hidden={!state.expanded}>
        <header className="receipt-widget__header">
          <button
            type="button"
            tabIndex={state.expanded ? 0 : -1}
            aria-label="Widget verschieben"
            title="Zum Verschieben ziehen"
            onPointerDown={startMove}
            onPointerMove={move}
            onPointerUp={endMove}
            onPointerCancel={endMove}
            onLostPointerCapture={endMove}
          >
            <IconGripVertical size={16} />
          </button>
          <strong title={organization}>{organization || 'VereinO'}</strong>
          <button
            type="button"
            tabIndex={state.expanded ? 0 : -1}
            aria-label="VereinO öffnen"
            title="VereinO öffnen"
            onClick={() => void window.api.receiptWidget.showMain()}
          >
            <IconArrowUpRight size={17} />
          </button>
          <button
            type="button"
            tabIndex={state.expanded ? 0 : -1}
            aria-label="Belegwidget schließen"
            title="Belegwidget schließen"
            onClick={() => void window.api.receiptWidget.close()}
          >
            <IconX size={17} />
          </button>
        </header>
        <button
          className="receipt-widget__drop"
          tabIndex={state.expanded ? 0 : -1}
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          <IconFilePlus size={27} />
          <strong>{busy ? 'Beleg wird geöffnet …' : 'Beleg ablegen'}</strong>
          <span>PDF oder Bild · auch per Klick</span>
        </button>
        {error ? (
          <div className="receipt-widget__error" role="alert">
            {error}
          </div>
        ) : (
          <button
            type="button"
            tabIndex={state.expanded ? 0 : -1}
            className="receipt-widget__collapse"
            onClick={() => expand(false)}
          >
            {state.edge === 'right' ? (
              <IconChevronRight size={14} />
            ) : (
              <IconChevronLeft size={14} />
            )}
            Einklappen
          </button>
        )}
      </section>
      <input
        ref={input}
        type="file"
        hidden
        accept=".pdf,.png,.jpg,.jpeg,.webp"
        onChange={(event) => void accept(event.target.files)}
      />
    </main>
  )
}
