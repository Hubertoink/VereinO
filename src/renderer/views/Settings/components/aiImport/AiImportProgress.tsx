import { IconAlertTriangle, IconCheck, IconCircleDashed, IconLoader2, IconPlayerPause } from '@tabler/icons-react'
import type { AiImportSession } from '../../../../../../shared/aiImport'
import { analysisPhases, phaseLabels, statusLabels } from './model'

export function AiImportProgress({ session }: { session: AiImportSession }) {
  const running = session.status === 'running'
  const current = analysisPhases.indexOf(session.phase as typeof analysisPhases[number])
  const partial = session.phase === 'classify' && session.total ? session.completed / session.total : 0
  const percent = Math.round(((Math.max(0, current) + partial) / analysisPhases.length) * 100)
  const CurrentIcon = running ? IconLoader2 : session.status === 'failed' ? IconAlertTriangle : IconPlayerPause

  return <div className="ai-import-progress" role="status">
    <div className="ai-import-progress__head">
      <span className={`ai-import-progress__icon is-${session.status}`}><CurrentIcon size={22} aria-hidden="true" className={running ? 'ai-import-spin' : undefined} /></span>
      <div><strong>{statusLabels[session.status]} · {phaseLabels[session.phase]}</strong>
        <span>{session.rows.length ? `${session.rows.length} Buchungen erkannt` : `${session.total} Quellzeilen`}{session.model ? ` · ${session.model}` : ''}{session.tokens ? ` · ${session.tokens.toLocaleString('de-DE')} Tokens` : ''}</span></div>
      <b className="ai-import-progress__percent">{percent} %</b>
    </div>
    <progress aria-label="Analysefortschritt" max={100} value={percent} />
    <ol className="ai-import-phases">{analysisPhases.map((phase, i) => {
      const state = i < current ? 'done' : i === current ? 'active' : 'pending'
      return <li key={phase} className={`is-${state}`} aria-current={state === 'active' ? 'step' : undefined}>
        {state === 'done' ? <IconCheck size={14} aria-hidden="true" /> : state === 'active' ? <CurrentIcon size={14} aria-hidden="true" className={running ? 'ai-import-spin' : undefined} /> : <IconCircleDashed size={14} aria-hidden="true" />}
        {phaseLabels[phase]}{phase === 'classify' && state === 'active' && session.total ? ` (${session.completed}/${session.total})` : ''}
      </li>
    })}</ol>
    {session.error && <p className="ai-import-callout is-danger"><IconAlertTriangle size={16} aria-hidden="true" />{session.error}</p>}
    <p className="ai-import-muted">Du kannst dieses Fenster schließen. Der Auftrag wird gespeichert und ist unter „Gespeicherte Importaufträge“ wieder erreichbar. Pause stoppt nach dem aktuellen Schritt; ein noch auslaufendes Ergebnis wird verworfen.</p>
  </div>
}
