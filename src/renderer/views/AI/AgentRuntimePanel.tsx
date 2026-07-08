import type { TAiAgentAutoRulesListOutput, TAiAgentMemoryListOutput, TAiAgentTraceEvent } from '../../../../electron/main/ipc/schemas'

type Props = {
  trace: TAiAgentTraceEvent[]
  memory: TAiAgentMemoryListOutput['rows']
  autoRules: TAiAgentAutoRulesListOutput['rows']
}

function traceLabel(kind: TAiAgentTraceEvent['kind']) {
  if (kind === 'tool_call') return 'Tool'
  if (kind === 'tool_result') return 'Result'
  if (kind === 'draft') return 'Draft'
  if (kind === 'memory') return 'Memory'
  if (kind === 'rule') return 'Regel'
  return 'Agent'
}

function draftKindLabel(kind: string) {
  if (kind === 'voucherUpdate') return 'Buchungen'
  if (kind === 'voucherReverse') return 'Storno'
  if (kind === 'voucherRebook') return 'Umbuchung'
  if (kind === 'bankLink') return 'Bankbelege'
  if (kind === 'memberUpdate') return 'Mitglieder'
  if (kind === 'tagChange') return 'Tags'
  if (kind === 'budgetChange') return 'Budgets'
  if (kind === 'earmarkChange') return 'Zweckbindungen'
  return kind || 'Regel'
}

function autoRuleActionLabel(action: string) {
  if (action === 'AUTO_APPLY_SAFE') return 'Auto-Apply'
  if (action === 'AUTO_PRESELECT') return 'Vorauswahl'
  return action || 'Regel'
}

export function AgentRuntimePanel({ trace, memory, autoRules }: Props) {
  return (
    <section className="card ai-agent-runtime-panel">
      <div className="ai-section-head">
        <strong>Agent-Kontext</strong>
        <span>{trace.length} Trace · {memory.length} Memory · {autoRules.length} Regeln</span>
      </div>
      <p className="ai-agent-runtime-hint">
        Hier siehst du, was die KI über VereinO dauerhaft behalten darf, welche Auto-Regeln gelten und welche Tools der letzte Agent-Lauf benutzt hat.
      </p>
      {trace.length > 0 ? (
        <div className="ai-agent-trace-list">
          {trace.slice(-10).map((event) => (
            <article key={event.id} className={`ai-agent-trace-row ${event.ok === false ? 'is-error' : ''}`}>
              <span>{traceLabel(event.kind)}</span>
              <strong>{event.title}</strong>
              {event.detail && <em>{event.detail}</em>}
            </article>
          ))}
        </div>
      ) : (
        <div className="ai-agent-empty">Noch kein Agent-Run in diesem Chat. Sobald die KI Tools nutzt, erscheint hier der Trace.</div>
      )}
      <div className="ai-agent-knowledge-grid">
        <div className="ai-agent-knowledge-card">
          <div className="ai-agent-knowledge-head">
            <strong>Memory</strong>
            {memory.length > 0 && <span>{memory.length}</span>}
          </div>
          {memory.length ? (
            <div className="ai-agent-knowledge-list">
              {memory.slice(0, 12).map((item) => (
                <article key={item.id} className="ai-agent-memory-item">
                  <span>{item.key}</span>
                  <p>{item.value}</p>
                </article>
              ))}
              {memory.length > 12 && <em className="ai-agent-knowledge-more">+ {memory.length - 12} weitere Memory-Einträge</em>}
            </div>
          ) : (
            <p className="ai-agent-knowledge-empty">Keine aktiven Memory-Einträge. Sag z.B. „Merke dir: Fördermittel immer taggen“, dann kann der Agent daraus Kontext machen.</p>
          )}
        </div>
        <div className="ai-agent-knowledge-card">
          <div className="ai-agent-knowledge-head">
            <strong>Auto-Approve-Regeln</strong>
            {autoRules.length > 0 && <span>{autoRules.length}</span>}
          </div>
          {autoRules.length ? (
            <div className="ai-agent-knowledge-list">
              {autoRules.slice(0, 12).map((rule) => (
                <article key={rule.id} className="ai-agent-rule-item">
                  <div>
                    <strong>{rule.name}</strong>
                    <span>{draftKindLabel(rule.draftKind)} · {autoRuleActionLabel(rule.action)}</span>
                  </div>
                </article>
              ))}
              {autoRules.length > 12 && <em className="ai-agent-knowledge-more">+ {autoRules.length - 12} weitere Regeln</em>}
            </div>
          ) : (
            <p className="ai-agent-knowledge-empty">Keine aktiven Regeln. Sichere Standardfälle bleiben daher bewusst im Review.</p>
          )}
        </div>
      </div>
    </section>
  )
}
