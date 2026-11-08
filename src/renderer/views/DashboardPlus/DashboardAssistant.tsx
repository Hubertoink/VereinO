import React, { useEffect, useRef, useState } from 'react'
import { IconArrowUp, IconSparkles, IconMessagePlus } from '@tabler/icons-react'
import type { ReportBookingSource, ReportScope } from '../../../../shared/aiReporting'
import type { TAiAgentRunOutput } from '../../../../electron/main/ipc/schemas'
import ReportAnswerCard from '../../components/ai/ReportAnswerCard'
import { addDataChangedListener } from '../../utils/refresh'
import { AiMarkdown } from '../AI/AiMarkdown'
import { openAgentReview } from '../../utils/aiAgentHandoff'
import { reportSupplement } from '../../../../shared/aiVisibleText'

type Answer = {
  question: string
  result: TAiAgentRunOutput
  organizationId: string
  revision: number
}
export default function DashboardAssistant({
  from,
  to,
  onSetup,
  onSource
}: ReportScope & {
  onSetup: () => void
  onSource: (source: ReportBookingSource) => void
}) {
  const [ready, setReady] = useState<boolean | null>(null)
  const [scope, setScope] = useState({ from, to })
  const [question, setQuestion] = useState('')
  const [answers, setAnswers] = useState<Answer[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const generation = useRef(0)
  const session = useRef<string>()
  const sending = useRef(false)
  const questionInput = useRef<HTMLInputElement>(null)
  const prepareQuestion = (text: string, selectedScope?: ReportScope) => {
    setQuestion(text)
    setError('')
    if (selectedScope) setScope(selectedScope)
    questionInput.current?.focus()
    questionInput.current?.scrollIntoView({ block: 'nearest' })
  }
  const validRange = Boolean(scope.from && scope.to && scope.from <= scope.to)
  useEffect(() => setScope({ from, to }), [from, to])
  useEffect(() => {
    let alive = true
    const load = () => {
      window.api.ai.settings
        .get()
        .then((settings) => {
          if (alive) setReady(settings.hasApiKey)
        })
        .catch(() => {
          if (alive) setReady(false)
        })
    }
    load()
    const off = addDataChangedListener(['settings'], load)
    const changed = addDataChangedListener(['vouchers', 'invoices', 'members'], () =>
      setRevision((value) => value + 1)
    )
    const reset = window.api.organizations.onSwitched(() => {
      generation.current++
      session.current = undefined
      sending.current = false
      setBusy(false)
      setAnswers([])
      setQuestion('')
      setError('')
      load()
    })
    return () => {
      alive = false
      generation.current++
      off()
      changed()
      reset?.()
    }
  }, [])
  const newChat = () => {
    generation.current++
    session.current = undefined
    sending.current = false
    setBusy(false)
    setAnswers([])
    setQuestion('')
    setError('')
    setScope({ from, to })
  }
  const askQuestion = async (prompt: string, selectedScope = scope) => {
    if (
      !prompt.trim() ||
      !ready ||
      sending.current ||
      !selectedScope.from ||
      !selectedScope.to ||
      selectedScope.from > selectedScope.to
    )
      return
    sending.current = true
    setBusy(true)
    setError('')
    setScope(selectedScope)
    const ticket = generation.current
    const sent = prompt.trim()
    try {
      const active = await window.api.organizations.active()
      if (generation.current !== ticket) return
      if (!active.organization) throw new Error('Bitte einen Verein auswählen.')
      const result = await window.api.ai.agent.run({
        sessionId: session.current,
        prompt: sent,
        uiContext: { activeArea: 'Dashboard', reportingScope: selectedScope }
      })
      if (generation.current === ticket) {
        session.current = result.sessionId
        setAnswers((previous) => [
          ...previous,
          { question: sent, result, organizationId: active.organization!.id, revision }
        ])
        setQuestion('')
      }
    } catch (reason) {
      if (generation.current === ticket) {
        setQuestion(sent)
        setError(
          reason instanceof Error
            ? reason.message
            : 'Die KI konnte nicht antworten. Bitte erneut versuchen.'
        )
      }
    } finally {
      if (generation.current === ticket) {
        sending.current = false
        setBusy(false)
      }
    }
  }
  return (
    <section className="dp-assistant" aria-label="Dashboard KI">
      <div className="dp-assistant-intro">
        <IconSparkles size={23} className={busy ? 'dp-assistant-icon--busy' : undefined} aria-hidden="true" />
        <div className="dp-assistant-heading">
          <h2>Deine Zahlen. Deine Fragen.</h2>
          {(answers.length > 0 || question || error || busy) && (
            <button type="button" className="btn ghost dp-assistant-new-chat" onClick={newChat} aria-label="Neuer Chat" title="Neuer Chat">
              <IconMessagePlus size={17} aria-hidden="true" />
              <span>Neuer Chat</span>
            </button>
          )}
        </div>
        <p>Reporting und Controlling direkt aus deinem Dashboard.</p>
      </div>
      {error && (
        <p className="dp-ai-error" role="alert">
          {error}
        </p>
      )}
      {answers.length > 0 && (
        <div className="dp-ai-answers">
          {answers.map((answer, index) => (
            <div key={index}>
              {answer.revision !== revision && (
                <p className="dp-ai-stale">
                  Die Daten wurden inzwischen geändert. Diese Antwort zeigt den Stand der damaligen
                  Abfrage; Quellenlinks öffnen die aktuellen Buchungen.
                </p>
              )}
              {answer.result.reports?.map((report, reportIndex) => (
                <ReportAnswerCard
                  key={reportIndex}
                  answer={report}
                  question={answer.question}
                  onSource={onSource}
                  busy={busy}
                  onFollowUp={prepareQuestion}
                />
              ))}
              {reportSupplement(answer.result.answer, answer.result.reports) && (
                <article className={answer.result.reports?.length ? 'ai-report-addendum' : 'ai-report-answer'}>
                  {!answer.result.reports?.length && <header className="ai-report-heading">
                    <p className="ai-report-question">{answer.question}</p>
                    <h3>{answer.result.title || 'VereinO KI'}</h3>
                  </header>}
                  <AiMarkdown
                    text={reportSupplement(answer.result.answer, answer.result.reports)}
                    onOpenVoucher={(mention) =>
                      window.dispatchEvent(
                        new CustomEvent('apply-voucher-jump', {
                          detail: { ...mention, voucherId: mention.id }
                        })
                      )
                    }
                  />
                </article>
              )}
              {!!answer.result.drafts.length && (
                <div className="ai-report-answer">
                  <strong>Vorschläge zur Prüfung</strong>
                  <ul>
                    {answer.result.drafts.map((draft, index) => (
                      <li key={index}>{draft.title}</li>
                    ))}
                  </ul>
                  <button className="btn" type="button" onClick={() => openAgentReview(answer)}>
                    Vorschläge im KI-Bereich prüfen
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {busy && <div className="dp-assistant-pending" aria-label="Gesendete Frage">{question}</div>}
      {ready === false ? (
        <div className="dp-assistant-setup">
          <p>Hinterlege deinen KI-Zugang, um Fragen zu deinen Vereinsdaten zu stellen.</p>
          <button className="btn" onClick={onSetup}>
            KI einrichten
          </button>
        </div>
      ) : (
        <>
          <form
            onSubmit={(event) => {
              event.preventDefault()
              void askQuestion(question)
            }}
          >
            <input
              ref={questionInput}
              aria-label="Frage zu Reporting oder Controlling"
              placeholder="Wie stehen wir finanziell da?"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              disabled={busy || ready === null}
              maxLength={4000}
            />
            <button
              type="submit"
              aria-label="Frage senden"
              disabled={!question.trim() || busy || !ready || !validRange}
            >
              <IconArrowUp size={20} />
            </button>
          </form>
          <div className="dp-assistant-period" role="group" aria-label="Zeitraum der KI-Auswertung">
            <span>Auswertungszeitraum</span>
            <label>
              Von
              <input
                type="date"
                aria-label="Auswertung von"
                value={scope.from}
                max={scope.to || undefined}
                disabled={busy}
                onChange={(event) =>
                  setScope((current) => ({ ...current, from: event.target.value }))
                }
              />
            </label>
            <label>
              Bis
              <input
                type="date"
                aria-label="Auswertung bis"
                value={scope.to}
                min={scope.from || undefined}
                disabled={busy}
                onChange={(event) =>
                  setScope((current) => ({ ...current, to: event.target.value }))
                }
              />
            </label>
          </div>
          {!validRange && (
            <p className="dp-ai-error" role="alert">
              Bitte einen gültigen Zeitraum auswählen.
            </p>
          )}
          <div className="dp-assistant-suggestions">
            {[
              'Wie hat sich unser Saldo entwickelt?',
              'Wie stehen Einnahmen und Ausgaben zueinander?',
              'Fasse die Finanzlage für den Vorstand zusammen.'
            ].map((text) => (
              <button
                key={text}
                type="button"
                disabled={busy || !ready}
                onClick={() => prepareQuestion(text)}
              >
                {text}
              </button>
            ))}
          </div>
        </>
      )}
      <span className="sr-only" aria-live="polite">
        {busy ? 'Die KI bearbeitet deine Frage.' : answers.length ? 'Die Auswertung ist bereit.' : ''}
      </span>
    </section>
  )
}
