import { createAiAgentTools, type AiAgentDraft, type AiAgentTool } from './aiAgentTools'
import { compactContext, createClient, extractOutputText, getAiSettings, normalizeUsage, type AiContext, type AiUsage } from './ai'
import {
  appendAiAgentEvent,
  getOrCreateAiAgentSession,
  listAiAgentEvents,
  updateAiAgentSession,
  type AiAgentEventRow
} from '../repositories/aiAgentSessions'
import { listAiAgentAutoRules, listAiAgentMemory, matchingAiAgentAutoRules } from '../repositories/aiAgentKnowledge'

export type AiAgentToolTrace = {
  name: string
  args: unknown
  ok: boolean
  summary?: string | null
}

export type AiAgentTraceEvent = {
  id: string
  kind: 'tool_call' | 'tool_result' | 'draft' | 'memory' | 'rule' | 'message'
  title: string
  detail?: string | null
  ok?: boolean
  payload?: unknown
}

export type AiAgentRunResult = {
  sessionId: string
  title?: string | null
  answer: string
  model: string
  toolCalls: AiAgentToolTrace[]
  trace: AiAgentTraceEvent[]
  drafts: AiAgentDraft[]
  usage: AiUsage
}

function emptyUsage(model: string): AiUsage {
  return {
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    totalTokens: 0,
    estimatedCostUsd: 0,
    pricingNote: `Keine OpenAI-Nutzung fuer Modell ${model}.`
  }
}

function mergeUsage(current: AiUsage, next: AiUsage): AiUsage {
  const estimatedCostUsd = current.estimatedCostUsd == null || next.estimatedCostUsd == null
    ? null
    : Math.round((current.estimatedCostUsd + next.estimatedCostUsd) * 1_000_000) / 1_000_000
  return {
    inputTokens: current.inputTokens + next.inputTokens,
    cachedInputTokens: current.cachedInputTokens + next.cachedInputTokens,
    outputTokens: current.outputTokens + next.outputTokens,
    reasoningTokens: current.reasoningTokens + next.reasoningTokens,
    totalTokens: current.totalTokens + next.totalTokens,
    estimatedCostUsd,
    pricingNote: next.pricingNote || current.pricingNote
  }
}

function eventForPrompt(event: AiAgentEventRow) {
  const label = event.role === 'tool'
    ? `Tool ${event.toolName || event.kind}`
    : event.role === 'assistant'
      ? 'VereinO KI'
      : event.role === 'system'
        ? 'System'
        : 'Nutzer'
  const payload = event.payload == null ? '' : `\nPayload: ${JSON.stringify(event.payload).slice(0, 2500)}`
  return `${label} (${event.kind}): ${event.content || ''}${payload}`.slice(0, 3500)
}

function toolDefinitions(tools: AiAgentTool[]) {
  return tools.map((tool) => ({
    type: 'function',
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
    strict: false
  }))
}

function parseToolArguments(value: unknown) {
  if (typeof value !== 'string') return value || {}
  if (!value.trim()) return {}
  return JSON.parse(value)
}

function summarizeToolResult(value: unknown) {
  const text = JSON.stringify(value)
  return text.length > 800 ? `${text.slice(0, 800)}...` : text
}

function collectDrafts(result: any) {
  const drafts: AiAgentDraft[] = []
  if (result?.draft) drafts.push(result.draft)
  if (Array.isArray(result?.drafts)) drafts.push(...result.drafts)
  return drafts
}

function draftAutoApprovalPayload(draft: AiAgentDraft) {
  const payload = draft.payload as any
  return {
    ...payload,
    title: draft.title,
    kind: draft.kind,
    changeCount: Array.isArray(payload?.changes) ? payload.changes.length : undefined,
    reason: payload?.reason
  }
}

function applyAutoApproval(draft: AiAgentDraft): AiAgentDraft {
  const rules = matchingAiAgentAutoRules(draft.kind, draftAutoApprovalPayload(draft))
  if (!rules.length) return draft
  return {
    ...draft,
    autoApproval: {
      action: rules.some((rule) => rule.action === 'AUTO_APPLY_SAFE') ? 'AUTO_APPLY_SAFE' : 'AUTO_PRESELECT',
      ruleIds: rules.map((rule) => rule.id),
      ruleNames: rules.map((rule) => rule.name)
    }
  }
}

function responseFunctionCalls(response: any) {
  return (response?.output || []).filter((item: any) => item?.type === 'function_call')
}

function buildAgentInstructions() {
  return [
    'Du bist der autonome VereinO Agent fuer Vereinsverwaltung und Vereinsfinanzen.',
    'Arbeite agentisch: Nutze Tools, wenn du VereinO-Daten brauchst. Antworte nicht aus Vermutungen, wenn ein Tool die Daten liefern kann.',
    'Du darfst READ_ONLY-Tools selbststaendig ausfuehren. Schreibende Aenderungen duerfen nur als Entwurf vorbereitet werden; finale Speicherung braucht Review/Freigabe in VereinO.',
    'Wenn im UI-Kontext bereits ein offener Review-Draft existiert und der Nutzer Details nachbessern, ergaenzen oder korrigieren will, erstelle einen neuen passenden Review-Draft mit den vorhandenen Daten plus den gewuenschten Aenderungen. Sage nicht, dass die Entitaet nicht unterstuetzt ist, wenn ein Draft-Tool dafuer existiert.',
    'Wenn du nach einer Pruefung konkrete bestehende Buchungen, Mitglieder, Tags oder andere Datensaetze aendern sollst, bereite immer einen passenden Review-Entwurf per Tool vor, statt nur eine Checkliste zu schreiben.',
    'Beispiel: Wenn Buchungen einem Budget oder einer Zweckbindung zugeordnet werden sollen, nutze nach der Suche voucher_update_draft_prepare mit den gefundenen voucherIds und der Ziel-ID. Wenn das Budget/die Zweckbindung erst im selben Ablauf als Review angelegt wird und noch keine ID hat, nutze budgetName bzw. earmarkName mit exakt demselben Namen.',
    'Beispiel: Wenn Budgets/Kategorien angelegt, umbenannt, archiviert oder geloescht werden sollen, nutze budget_change_draft_prepare. Wenn Zweckbindungen angelegt, geaendert, deaktiviert oder geloescht werden sollen, nutze earmark_change_draft_prepare.',
    'Beispiel: Wenn der Nutzer Dubletten/Duplikate stornieren will oder "storniere diese Buchung(en)" sagt, nutze voucher_reverse_draft_prepare. Das ist ein reiner Storno-Review ohne Ersatzbuchung.',
    'Beispiel: Wenn eine Buchung wegen Buchungsregeln nicht direkt bearbeitbar ist (z.B. IN soll OUT werden), nutze voucher_rebook_draft_prepare: Storno des Originals plus korrigierte Ersatzbuchung als Review-Entwurf.',
    'Wenn der Nutzer stornieren UND korrigiert neu als OUT/IN buchen oder mit einer Banktransaktion verknuepfen sagt: Nutze voucher_rebook_draft_prepare. Verwende booking_draft_prepare dafuer nicht alleine.',
    'Verwende voucher_update_draft_prepare niemals fuer Storno, Duplikat/Dublette, falsch IN/OUT oder Richtungs-/Typkorrekturen.',
    'Beispiel: Wenn Mitglieder geaendert werden sollen und alle Zielmitglieder denselben Wert bekommen, nutze member_update_draft_prepare. Wenn jedes Mitglied eigene Werte bekommt (z.B. individuelle E-Mail, Telefon, Beitrag, Notiz, Frist), nutze member_bulk_update_draft_prepare.',
    'Beispiel: Wenn fehlende Mitglieder-E-Mail-Adressen nach Namensschema gesetzt werden sollen, nutze member_email_draft_prepare oder bereite individuelle Werte mit member_bulk_update_draft_prepare vor.',
    'Beispiel: Wenn der Nutzer eine Forderung, Rechnung, Verbindlichkeit oder einen offenen Posten anlegen oder einen vorbereiteten Forderungs-/Verbindlichkeits-Draft nachbessern will, nutze invoice_action_draft_prepare. Forderungen sind voucherType IN, Verbindlichkeiten sind voucherType OUT. Speichere nicht direkt; bereite einen Review-Entwurf vor.',
    'Beispiel: Wenn der Nutzer einen normalen Controllingbericht exportieren, speichern, als PDF/Excel/CSV ausgeben oder eine Datei erstellen will, nutze reports_export. Bei "Controllingbericht" ohne genauere Typauswahl nimm BUDGET_VS_ACTUAL; bei "umfangreich" aktiviere KPIs, Diagramme und Buchungsauszug. Antworte nicht, dass du keinen Export ausloesen kannst.',
    'Beispiel: Wenn der Nutzer explizit Finanzamt/Jahresabschluss/§64 AO sagt, nutze reports_export_fiscal. Wenn der Nutzer Kassierbericht/Mitgliederversammlung/Kassenbericht sagt, nutze reports_export_treasurer.',
    'Wenn Tags angelegt/umbenannt/geloescht werden sollen, nutze tag_change_draft_prepare.',
    'Persistentes Memory darfst du nur speichern, wenn der Nutzer eine Regel oder Praeferenz klar formuliert oder bestaetigt. Nutze memory_list, um bekannte Vereinslogik zu beruecksichtigen.',
    'Auto-Approve-Regeln markieren sichere Drafts, ersetzen aber keine Nutzer-Freigabe fuer riskante Aenderungen.',
    'Wenn ein Nutzer eine weitreichende Aufgabe stellt, zerlege sie in Schritte, rufe die passenden Tools auf und fasse dann den naechsten sicheren Schritt zusammen.',
    'Nenne konkrete Zahlen, Namen, IDs oder Belegnummern aus den Tool-Ergebnissen. Erfinde keine VereinO-Daten.',
    'Wenn Informationen fehlen oder mehrere Ziele plausibel sind, stelle eine kurze Rueckfrage.',
    'Schreibe auf Deutsch, knapp und handlungsorientiert.'
  ].join('\n')
}

export async function runAiAgent(input: {
  sessionId?: string | null
  prompt: string
  context: AiContext
  uiContext?: unknown
  model?: string | null
  maxSteps?: number
}): Promise<AiAgentRunResult> {
  const settings = getAiSettings()
  const model = input.model || settings.textModel
  const session = getOrCreateAiAgentSession({
    sessionId: input.sessionId || null,
    title: input.prompt.slice(0, 80)
  })
  if (!session.title) updateAiAgentSession({ sessionId: session.id, title: input.prompt.slice(0, 80) })

  appendAiAgentEvent(session.id, {
    role: 'user',
    kind: 'message',
    content: input.prompt,
    payload: input.uiContext ? { uiContext: input.uiContext } : undefined
  })

  const tools = createAiAgentTools({ context: input.context })
  const toolByName = new Map(tools.map((tool) => [tool.name, tool]))
  const history = listAiAgentEvents(session.id, 36)
  const memory = listAiAgentMemory({ activeOnly: true, limit: 80 })
  const autoRules = listAiAgentAutoRules({ enabledOnly: true, limit: 80 })
  const prompt = [
    'VereinO-Basiskontext:',
    JSON.stringify(compactContext(input.context)),
    '',
    'Persistentes VereinO-Agent-Memory:',
    JSON.stringify(memory.map((item) => ({ scope: item.scope, key: item.key, value: item.value, confidence: item.confidence })).slice(0, 80)),
    '',
    'Aktive Auto-Approve-Regeln:',
    JSON.stringify(autoRules.map((rule) => ({ id: rule.id, name: rule.name, draftKind: rule.draftKind, action: rule.action, conditions: rule.conditions })).slice(0, 80)),
    '',
    input.uiContext ? `Aktueller UI-Kontext:\n${JSON.stringify(input.uiContext)}` : '',
    '',
    'Persistente Sitzung bisher:',
    history.map(eventForPrompt).join('\n\n') || '-',
    '',
    'Aktuelle Nutzernachricht:',
    input.prompt
  ].filter(Boolean).join('\n')

  let usage = emptyUsage(model)
  const drafts: AiAgentDraft[] = []
  const toolCalls: AiAgentToolTrace[] = []
  const trace: AiAgentTraceEvent[] = [
    {
      id: `memory-${Date.now()}`,
      kind: 'memory',
      title: 'Memory geladen',
      detail: `${memory.length} Memory-Eintrag(e), ${autoRules.length} Auto-Regel(n)`,
      ok: true,
      payload: { memory, autoRules }
    }
  ]
  const client = createClient()
  const baseRequest = {
    model,
    instructions: buildAgentInstructions(),
    tools: toolDefinitions(tools),
    reasoning: { effort: settings.defaultReasoningEffort },
    text: { verbosity: 'medium' }
  }

  let response = await client.responses.create({
    ...baseRequest,
    input: [
      {
        role: 'user',
        content: [{ type: 'input_text', text: prompt }]
      }
    ]
  } as any)
  usage = mergeUsage(usage, normalizeUsage(response, model))

  const maxSteps = Math.max(1, Math.min(8, Number(input.maxSteps || 5)))
  for (let step = 0; step < maxSteps; step += 1) {
    const calls = responseFunctionCalls(response)
    if (!calls.length) break

    const outputs = []
    for (const call of calls) {
      const tool = toolByName.get(call.name)
      const args = parseToolArguments(call.arguments)
      if (!tool) {
        const missing = { ok: false, error: `Unbekanntes Tool: ${call.name}` }
        outputs.push({ type: 'function_call_output', call_id: call.call_id, output: JSON.stringify(missing) })
        toolCalls.push({ name: call.name, args, ok: false, summary: missing.error })
        continue
      }

      appendAiAgentEvent(session.id, {
        role: 'tool',
        kind: 'call',
        toolName: tool.name,
        content: tool.description,
        payload: { args, readOnly: tool.readOnly }
      })
      trace.push({
        id: `tool-call-${step}-${toolCalls.length}-${Date.now()}`,
        kind: 'tool_call',
        title: tool.name,
        detail: tool.description,
        ok: true,
        payload: { args, readOnly: tool.readOnly }
      })

      try {
        const result = await tool.run(args)
        const nextDrafts = collectDrafts(result).map(applyAutoApproval)
        drafts.push(...nextDrafts)
        for (const draft of nextDrafts) {
          trace.push({
            id: `draft-${draft.kind}-${drafts.length}-${Date.now()}`,
            kind: 'draft',
            title: draft.title,
            detail: draft.autoApproval ? `Auto-Regel: ${draft.autoApproval.ruleNames.join(', ')}` : draft.kind,
            ok: true,
            payload: { kind: draft.kind, autoApproval: draft.autoApproval || null }
          })
        }
        outputs.push({ type: 'function_call_output', call_id: call.call_id, output: JSON.stringify(result) })
        toolCalls.push({ name: tool.name, args, ok: !!result.ok, summary: summarizeToolResult(result) })
        trace.push({
          id: `tool-result-${step}-${toolCalls.length}-${Date.now()}`,
          kind: 'tool_result',
          title: tool.name,
          detail: result.ok ? 'Tool erfolgreich ausgeführt.' : result.warning || 'Tool mit Hinweis beendet.',
          ok: !!result.ok,
          payload: result
        })
        appendAiAgentEvent(session.id, {
          role: 'tool',
          kind: 'result',
          toolName: tool.name,
          content: result.ok ? 'Tool erfolgreich ausgeführt.' : result.warning || 'Tool mit Hinweis beendet.',
          payload: result
        })
      } catch (error: any) {
        const result = { ok: false, error: error?.message || String(error) }
        outputs.push({ type: 'function_call_output', call_id: call.call_id, output: JSON.stringify(result) })
        toolCalls.push({ name: tool.name, args, ok: false, summary: result.error })
        trace.push({
          id: `tool-error-${step}-${toolCalls.length}-${Date.now()}`,
          kind: 'tool_result',
          title: tool.name,
          detail: result.error,
          ok: false,
          payload: result
        })
        appendAiAgentEvent(session.id, {
          role: 'tool',
          kind: 'error',
          toolName: tool.name,
          content: result.error,
          payload: { args }
        })
      }
    }

    response = await client.responses.create({
      ...baseRequest,
      previous_response_id: response.id,
      input: outputs
    } as any)
    usage = mergeUsage(usage, normalizeUsage(response, model))
  }

  const answer = extractOutputText(response) || 'Ich habe die Aufgabe verarbeitet, aber keine ausformulierte Antwort erhalten.'
  trace.push({
    id: `message-${Date.now()}`,
    kind: 'message',
    title: 'Agent-Antwort',
    detail: answer.slice(0, 300),
    ok: true
  })
  appendAiAgentEvent(session.id, {
    role: 'assistant',
    kind: 'message',
    content: answer,
    payload: {
      toolCalls: toolCalls.map((call) => ({ name: call.name, ok: call.ok })),
      drafts: drafts.map((draft) => ({ kind: draft.kind, title: draft.title }))
    }
  })

  return {
    sessionId: session.id,
    title: session.title,
    answer,
    model,
    toolCalls,
    trace,
    drafts,
    usage
  }
}
