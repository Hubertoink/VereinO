import { ViewportPopover } from './ViewportPopover'
import { AiAssistantHeader } from '../../src/renderer/views/AI/AiAssistantHeader'
import { AiComposer } from '../../src/renderer/views/AI/AiComposer'
import type { AiDrawer } from '../../src/renderer/views/AI/aiViewReducer'
import AiSettingsPane from './settings/AiSettingsPane'
import WebInvoiceCapture from './WebInvoiceCapture'
import './webAI.css'
import React, { useEffect, useRef, useState } from 'react'
import { IconSparkles } from '@tabler/icons-react'
import { AiMarkdown } from '../../src/renderer/views/AI/AiMarkdown'
import '../../src/renderer/views/AI/AIView.css'
import { webFetch, api, ApiError, type User, type Fields } from './api'
import BookingEditor from './BookingEditor'
import { dispatchDataChanged } from '../../src/renderer/utils/refresh'
export default function DesktopAI({
  user,
  onSessionExpired,
  onCapture
}: {
  onCapture?: React.ComponentProps<typeof WebInvoiceCapture>['onCapture']
  user: User
  onSessionExpired: () => void
}) {
  const [drawer, setDrawer] = useState<AiDrawer | null>(null)
  const [hasApiKey, setHasApiKey] = useState(false)
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null)
  const historyButtonRef = useRef<HTMLButtonElement>(null),
    agentContextButtonRef = useRef<HTMLButtonElement>(null),
    settingsButtonRef = useRef<HTMLButtonElement>(null),
    rulesButtonRef = useRef<HTMLButtonElement>(null)
  const promptInputRef = useRef<HTMLTextAreaElement>(null),
    fileInputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    void api<{ hasApiKey: boolean; enabled: boolean }>('/ai/settings')
      .then((settings) => setHasApiKey(settings.hasApiKey && settings.enabled))
      .catch(() => {})
  }, [drawer])
  const [prompt, setPrompt] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false)
  const [messages, setMessages] = useState<
    Array<{ role: 'user' | 'assistant'; text: string; scope?: string }>
  >([])
  const [files, setFiles] = useState<File[]>([])
  const [queue, setQueue] = useState<
    Array<{
      documentId: string
      fileName: string
      fields: Partial<Fields> & { warnings?: string[] }
    }>
  >([])
  async function loadQueue() {
    try {
      const result = await api<{ rows: typeof queue }>('/ai/documents')
      setQueue(result.rows || [])
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) onSessionExpired()
      else
        setError(cause instanceof Error ? cause.message : 'Prüfliste konnte nicht geladen werden.')
    }
  }
  useEffect(() => {
    void loadQueue()
  }, [])
  async function discard(id: string) {
    try {
      await api(`/ai/documents/${id}`, 'DELETE')
      await loadQueue()
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) onSessionExpired()
      else setError(cause instanceof Error ? cause.message : 'Beleg konnte nicht entfernt werden.')
    }
  }
  const [documentId, setDocumentId] = useState<string>()
  const [candidate, setCandidate] = useState<Fields | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const pending = useRef(false)
  function reviewFields(fields: Partial<Fields> & { warnings?: string[] }, id?: string) {
    setDocumentId(id)
    setWarnings([
      ...(fields.warnings || []),
      ...(!fields.date ? ['Datum wurde nicht erkannt. Bitte eintragen.'] : []),
      ...(!fields.grossAmountCents ? ['Betrag wurde nicht erkannt. Bitte eintragen.'] : [])
    ])
    setCandidate({
      date: fields.date || '',
      description: fields.description || '',
      counterparty: fields.counterparty,
      grossAmountCents: fields.grossAmountCents ?? 0,
      type: fields.type || 'OUT',
      sphere: fields.sphere || 'IDEELL',
      primaryClassificationValueId: fields.primaryClassificationValueId,
      paymentMethod: 'BANK'
    })
  }
  async function propose() {
    if (pending.current || !prompt.trim()) return
    pending.current = true
    setBusy(true)
    setError('')
    try {
      const result = await api<{ fields: Partial<Fields> & { warnings?: string[] } }>(
        '/ai/booking-proposal',
        'POST',
        { prompt: prompt.trim() }
      )
      reviewFields(result.fields)
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) onSessionExpired()
      else setError(cause instanceof Error ? cause.message : 'Buchungsvorschlag fehlgeschlagen.')
    } finally {
      pending.current = false
      setBusy(false)
    }
  }
  async function analyze() {
    if (!files.length || pending.current) return
    pending.current = true
    setBusy(true)
    setError('')
    setWarnings([])
    const failures: string[] = []
    try {
      for (const file of files) {
        try {
          const form = new FormData()
          form.append('file', file)
          const response = await webFetch('/api/ai/invoice', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'X-VereinO-Request': '1' },
            body: form
          })
          const result = await response.json()
          if (!response.ok)
            throw new ApiError(
              response.status,
              result.message || result.error || 'Analyse fehlgeschlagen.'
            )
          if (files.length === 1) reviewFields(result.fields, result.documentId)
        } catch (cause) {
          if (cause instanceof ApiError && cause.status === 401) {
            onSessionExpired()
            break
          }
          failures.push(
            `${file.name}: ${cause instanceof Error ? cause.message : 'Analyse fehlgeschlagen.'}`
          )
        }
      }
      await loadQueue()
      if (failures.length) setError(failures.join(' · '))
    } finally {
      pending.current = false
      setBusy(false)
    }
  }
  async function send(event?: React.FormEvent) {
    event?.preventDefault()
    if (pending.current || !prompt.trim()) return
    pending.current = true
    setBusy(true)
    setError('')
    const question = prompt.trim()
    try {
      const result = await api<{ text: string; scope: string }>('/ai/assistant', 'POST', {
        prompt: question,
        history: messages.slice(-10).map(({ role, text }) => ({ role, text: text.slice(0, 16000) }))
      })
      setMessages((previous) => [
        ...previous,
        { role: 'user', text: question },
        { role: 'assistant', text: result.text, scope: result.scope }
      ])
      setPrompt('')
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) onSessionExpired()
      else setError(cause instanceof Error ? cause.message : 'KI-Anfrage fehlgeschlagen.')
    } finally {
      pending.current = false
      setBusy(false)
    }
  }
  const composer = (
    <AiComposer
      maxLength={8000}
      placement={messages.length ? 'followup' : 'initial'}
      busy={busy}
      prompt={prompt}
      files={files}
      filePreviews={files.map((file, index) => ({
        key: String(index),
        name: file.name,
        url: null,
        badge: file.type === 'application/pdf' ? 'PDF' : 'Bild'
      }))}
      visibleMentions={[]}
      isDraggingFiles={false}
      promptInputRef={promptInputRef}
      fileInputRef={fileInputRef}
      acceptedFiles=".pdf,image/png,image/jpeg,image/webp"
      onPromptChange={(value) => setPrompt(value)}
      onCursorSync={() => {}}
      onSubmit={() => {
        if (files.length === 1) setInvoiceFile(files[0])
        else if (files.length > 1) void analyze()
        else void send()
      }}
      onAppendFiles={(selected) => {
        const added = Array.from(selected || [])
        setFiles((previous) => [...previous, ...added])
      }}
      onRemoveFile={(key) =>
        setFiles((previous) => previous.filter((_, index) => String(index) !== key))
      }
      onInsertMention={() => {}}
      onDragEnter={(event) => event.preventDefault()}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={() => {}}
      onDrop={(event) => {
        event.preventDefault()
        const added = Array.from(event.dataTransfer.files)
        setFiles((previous) => [...previous, ...added])
      }}
    />
  )
  useEffect(() => {
    if (candidate && onCapture) {
      onCapture(candidate, documentId, warnings)
      setCandidate(null)
    }
  }, [candidate, onCapture, documentId, warnings])
  return (
    <div className="page-content ai-page ai-assistant-page">
      <AiAssistantHeader
        busy={busy}
        hasPendingReview={queue.length > 0}
        avatarFrame={busy ? 'thinking' : 'default'}
        hasApiKey={hasApiKey}
        chatStarted={messages.length > 0}
        onNewChat={() => setMessages([])}
        onToggleDrawer={(value) => setDrawer((previous) => (previous === value ? null : value))}
        historyButtonRef={historyButtonRef}
        agentContextButtonRef={agentContextButtonRef}
        settingsButtonRef={settingsButtonRef}
        rulesButtonRef={rulesButtonRef}
      />
      {drawer && (
        <ViewportPopover className="web-ai-panel" anchor={(drawer === 'settings' ? settingsButtonRef : drawer === 'history' ? historyButtonRef : drawer === 'rules' ? rulesButtonRef : agentContextButtonRef).current} onClose={() => setDrawer(null)}>
          <header className="flex justify-between items-center">
            <h2>
              {drawer === 'settings'
                ? 'KI-Einstellungen'
                : drawer === 'history'
                  ? 'KI-Verlauf'
                  : drawer === 'rules'
                    ? 'Regeln'
                    : 'Agent-Kontext'}
            </h2>
            <button
              className="btn icon-btn"
              aria-label="Bereich schließen"
              onClick={() => setDrawer(null)}
            >
              ✕
            </button>
          </header>
          {drawer === 'settings' ? (
            <AiSettingsPane readOnly={user.role !== 'ADMIN'} onSessionExpired={onSessionExpired} />
          ) : drawer === 'history' ? (
            <>
              <p>
                {messages.length
                  ? `${messages.length} Nachrichten im aktuellen Gespräch.`
                  : 'Noch kein Gespräch gestartet.'}
              </p>
              <button className="btn" disabled={busy} onClick={() => setMessages([])}>
                Verlauf leeren
              </button>
            </>
          ) : drawer === 'rules' ? (
            <p>
              Vorschläge werden vor dem Speichern geprüft. User erstellen Entwürfe; Admin und Editor
              können Entwürfe freigeben. Die KI führt keine Änderungen oder Löschungen selbstständig
              aus.
            </p>
          ) : (
            <p>
              {user.role === 'USER'
                ? 'Der KI stehen bis zu 50 eigene Entwürfe zur Verfügung.'
                : 'Der KI stehen die Summen und bis zu 100 aktuelle Buchungen der aktiven Organisation zur Verfügung.'}{' '}
              Fragen und die letzten zehn Gesprächsnachrichten werden an den eingerichteten Anbieter
              übermittelt.
            </p>
          )}
        </ViewportPopover>
      )}
      <div className="ai-assistant-layout">
        <main className="ai-chat-surface">
          {!messages.length && (
            <section className="ai-welcome">
              <h2>Schön, dich zu sehen. Was möchtest du erledigen?</h2>
            </section>
          )}
          {!messages.length && composer}
          {!messages.length && (
            <div className="ai-prompt-examples">
              <button onClick={() => fileInputRef.current?.click()}>
                Lies diese Rechnung aus und erstelle einen Buchungsvorschlag.
              </button>
              {[
                'Wie verteilen sich unsere Einnahmen und Ausgaben?',
                'Welche Entwürfe stehen zur Prüfung an?',
                'Erstelle einen Buchungsvorschlag für Büromaterial.'
              ].map((example) => (
                <button
                  key={example}
                  onClick={() => {
                    setPrompt(example)
                    promptInputRef.current?.focus()
                  }}
                >
                  {example}
                </button>
              ))}
            </div>
          )}
          <div className="ai-message-list">
            {messages.map((message, index) => (
              <article key={index} className={`ai-message ai-message--${message.role}`}>
                <div className="ai-message-head">
                  <strong>{message.role === 'user' ? 'Du' : 'VereinO KI'}</strong>
                </div>
                <AiMarkdown text={message.text} />
                {message.scope && <p className="helper">{message.scope}</p>}
              </article>
            ))}
          </div>
          {messages.length > 0 && composer}
          {prompt.trim() && (
            <div className="web-ai-proposal">
              <button className="btn" disabled={busy} onClick={() => void propose()}>
                Buchung vorschlagen
              </button>
            </div>
          )}
          {error && (
            <p role="alert" className="error-text">
              {error}
            </p>
          )}
          {queue.length > 0 && (
            <section className="card">
              <h3>Belege zur Prüfung ({queue.length})</h3>
              <p className="helper">
                Noch nicht übernommene Analysen bleiben 24 Stunden verfügbar.
              </p>
              {queue.map((item) => (
                <div className="web-ai-review-row" key={item.documentId}>
                  <strong>{item.fileName}</strong>
                  <button
                    className="btn"
                    disabled={busy}
                    onClick={() => reviewFields(item.fields, item.documentId)}
                  >
                    Prüfen
                  </button>
                  <button
                    className="btn"
                    disabled={busy}
                    onClick={() => void discard(item.documentId)}
                  >
                    Verwerfen
                  </button>
                </div>
              ))}
            </section>
          )}
        </main>
      </div>
      {invoiceFile && (
        <WebInvoiceCapture
          onCapture={onCapture}
          user={user}
          onSessionExpired={onSessionExpired}
          initialFile={invoiceFile}
          onClose={() => {
            setInvoiceFile(null)
            setFiles([])
            void loadQueue()
          }}
        />
      )}
      {candidate && !onCapture && (
        <BookingEditor
          aiDocumentId={documentId}
          reviewWarnings={warnings}
          initialFields={candidate}
          mode={user.role === 'USER' ? 'drafts' : 'bookings'}
          user={user}
          onSessionExpired={onSessionExpired}
          onClose={() => setCandidate(null)}
          onSaved={() => {
            setCandidate(null)
            void loadQueue()
            dispatchDataChanged(['vouchers'])
          }}
        />
      )}
    </div>
  )
}
