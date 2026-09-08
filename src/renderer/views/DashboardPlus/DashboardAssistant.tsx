import React, { useEffect, useRef, useState } from 'react'
import { IconArrowUp, IconSparkles, IconMessagePlus } from '@tabler/icons-react'
import { addDataChangedListener } from '../../utils/refresh'
type Answer = { question: string; title: string; body: string; notes: string[] }
export default function DashboardAssistant({ context, onSetup }: { context: string; onSetup: () => void }) {
  const [ready, setReady] = useState<boolean | null>(null)
  const [question, setQuestion] = useState('')
  const [answers, setAnswers] = useState<Answer[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const generation = useRef(0)
  const sending = useRef(false)
  useEffect(() => {
    let alive = true
    const load = () => { window.api.ai.settings.get().then(settings => { if (alive) setReady(settings.hasApiKey) }).catch(() => { if (alive) setReady(false) }) }
    load()
    const off = addDataChangedListener(['settings'], load)
    const reset = window.api.organizations.onSwitched(() => { generation.current++; sending.current = false; setBusy(false); setAnswers([]); setQuestion(''); setError(''); load() })
    return () => { alive = false; generation.current++; off(); reset?.() }
  }, [])
  const newChat = () => {
    generation.current++
    sending.current = false
    setBusy(false); setAnswers([]); setQuestion(''); setError('')
  }
  const ask = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!question.trim() || !ready || sending.current) return
    sending.current = true; setBusy(true); setError('')
    const ticket = generation.current
    const sent = question.trim()
    try {
      const result = await window.api.ai.text.generate({ type: 'REPORT_TEXT', tone: 'präzise, verständlich, sachlich', audience: 'Kassier und Vorstand', prompt: `Beantworte eine Reporting-/Controlling-Frage zu den Vereinsfinanzen. Nutze für Zeitraumfragen die folgenden Dashboarddaten; unterscheide gebuchte Werte, offene Posten und Stichtagswerte. Erfinde keine Zahlen. Wenn Daten fehlen, benenne das.
Dashboarddaten: ${context}
Bisherige Rückfragen: ${JSON.stringify(answers.slice(-3))}
Frage: ${sent}` })
      if (generation.current === ticket) { setAnswers(previous => [...previous, { question: sent, ...result }]); setQuestion('') }
    } catch (reason) { if (generation.current === ticket) setError(reason instanceof Error ? reason.message : 'Die KI konnte nicht antworten. Bitte erneut versuchen.') }
    finally { if (generation.current === ticket) { sending.current = false; setBusy(false) } }
  }
  return <section className="dp-assistant" aria-label="Dashboard KI"><div className="dp-assistant-toolbar">{(answers.length > 0 || question || error || busy) && <button type="button" className="btn ghost" onClick={newChat}><IconMessagePlus size={17} />Neuer Chat</button>}</div><div className="dp-assistant-intro"><IconSparkles size={23} /><h2>Deine Zahlen. Deine Fragen.</h2><p>Reporting und Controlling direkt aus deinem Dashboard.</p></div>
    {ready === false ? <div className="dp-assistant-setup"><p>Hinterlege deinen KI-Zugang, um Fragen zu deinen Vereinsdaten zu stellen.</p><button className="btn" onClick={onSetup}>KI einrichten</button></div> : <><form onSubmit={ask}><input aria-label="Frage zu Reporting oder Controlling" placeholder="Wie stehen wir finanziell da?" value={question} onChange={event => setQuestion(event.target.value)} disabled={busy || ready === null} maxLength={4000} /><button type="submit" aria-label="Frage senden" disabled={!question.trim() || busy || !ready}><IconArrowUp size={20} /></button></form><div className="dp-assistant-suggestions">{['Wie hat sich unser Saldo entwickelt?', 'Welche Ausgaben fallen besonders auf?', 'Fasse die Finanzlage für den Vorstand zusammen.'].map(text => <button key={text} disabled={busy} onClick={() => setQuestion(text)}>{text}</button>)}</div></>}
    {busy && <p role="status">Die KI wertet deine Frage aus …</p>}{error && <p className="dp-ai-error" role="alert">{error}</p>}
    {answers.length > 0 && <div className="dp-ai-answers" aria-live="polite">{answers.map((answer, index) => <article key={index}><p>{answer.question}</p><h3>{answer.title}</h3><div>{answer.body}</div>{answer.notes.length > 0 && <ul>{answer.notes.map((note, i) => <li key={i}>{note}</li>)}</ul>}</article>)}</div>}
  </section>
}
