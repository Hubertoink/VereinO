import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { IconSparkles } from '@tabler/icons-react'
import CompactPopover from '../../components/CompactPopover'

type Anchor = { x: number; y: number; trigger: HTMLButtonElement }
const title = 'Nachricht mit KI formulieren'

export default function MemberInviteMessageField({ value, onChange }: { value: string; onChange: (text: string) => void }) {
  const [available, setAvailable] = useState(false)
  const [anchor, setAnchor] = useState<Anchor | null>(null)
  const message = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    let live = true
    window.api.ai?.settings.get().then(settings => {
      if (live) setAvailable(settings.hasApiKey)
    }).catch(() => { /* The message field also works offline. */ })
    return () => { live = false }
  }, [])

  return <div className="compact-booking-field invite-grid-span">
    <span className="invite-message-heading">
      <label htmlFor="member-invite-message">Nachricht</label>
      {available && <button type="button" className="ai-field-action" aria-label={title} title={title} aria-haspopup="dialog" aria-expanded={!!anchor}
        onClick={event => {
          const trigger = event.currentTarget
          const rect = trigger.getBoundingClientRect()
          setAnchor(anchor ? null : { trigger, x: rect.left, y: rect.bottom + 4 })
        }}><IconSparkles size={13} stroke={2} aria-hidden="true" /></button>}
    </span>
    <textarea ref={message} id="member-invite-message" className="input invite-message-input" rows={6} value={value} onChange={event => onChange(event.target.value)} />
    {anchor && <InvitationPrompt anchor={anchor} onClose={() => setAnchor(null)} onGenerated={body => {
      onChange(body)
      setAnchor(null)
      message.current?.focus()
    }} />}
  </div>
}

function InvitationPrompt({ anchor, onClose, onGenerated }: { anchor: Anchor; onClose: () => void; onGenerated: (body: string) => void }) {
  const [prompt, setPrompt] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const input = useRef<HTMLTextAreaElement>(null)
  const request = useRef(0)
  useLayoutEffect(() => {
    input.current?.focus()
    return () => { request.current++ }
  }, [])

  async function generate() {
    if (busy || !prompt.trim()) return
    const current = ++request.current
    setBusy(true)
    setError('')
    try {
      const result = await window.api.ai.text.generate({ type: 'INVITATION', prompt: prompt.trim(), includeOrganizationContext: false })
      if (request.current !== current) return
      const body = result.body.trim()
      if (!body) throw new Error('Die KI hat keinen Nachrichtentext geliefert. Bitte versuche es erneut.')
      onGenerated(body)
    } catch (err) {
      if (request.current === current) {
        setError(err instanceof Error ? err.message : 'Die Nachricht konnte nicht formuliert werden.')
        setBusy(false)
      }
    }
  }

  return <CompactPopover label={title} anchor={anchor} onClose={onClose} className="invite-ai-prompt">
    <form onSubmit={event => { event.preventDefault(); void generate() }}>
      <label htmlFor="invite-ai-instructions">Was soll in der E-Mail stehen?</label>
      <textarea ref={input} id="invite-ai-instructions" className="input" rows={3} value={prompt} readOnly={busy}
        placeholder="Zum Sommerfest am 20. Juni einladen und um Rückmeldung bitten"
        onChange={event => setPrompt(event.target.value)}
        onKeyDown={event => {
          if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); void generate() }
        }} />
      {error && <div role="alert">{error}</div>}
      <button type="submit" className="btn primary" disabled={busy || !prompt.trim()}>{busy ? 'Wird formuliert …' : 'Nachricht formulieren'}</button>
    </form>
  </CompactPopover>
}
