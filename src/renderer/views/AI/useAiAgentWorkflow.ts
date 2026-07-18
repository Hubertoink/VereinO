import { useState } from 'react'
import type { TAiAgentRunOutput } from '../../../../electron/main/ipc/schemas'

type AgentMessage = {
  role: 'assistant'
  title?: string
  body: string
  meta?: string
  bookingDraft?: {
    agentDraftId?: string
    title?: string
    qa: Record<string, unknown>
    files?: unknown[]
    status?: 'OPEN' | 'SAVED'
    voucherId?: number | null
    voucherNo?: string | null
  }
}

type UseAiAgentWorkflowInput = {
  initialSessionId?: string | null
  filesLength: number
  hasOpenReviewWorkflow: () => boolean
  selectedJobId: number | null
  selectedCandidate: number
  formatUsage: (usage?: TAiAgentRunOutput['usage'] | null) => string
  pushMessage: (message: AgentMessage) => void
  prepareAgentDraft: (draft: TAiAgentRunOutput['drafts'][number], userPrompt: string) => void
  onTrace: (trace: TAiAgentRunOutput['trace']) => void
  getUiContext?: () => Record<string, unknown>
}

function normalizeLookup(value: unknown) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function mergeAgentDrafts(drafts: TAiAgentRunOutput['drafts']) {
  const merged: TAiAgentRunOutput['drafts'] = []
  const mergeableKinds = new Set(['memberUpdate', 'contributionPaymentLink', 'tagChange', 'partyChange', 'voucherUpdate', 'budgetChange', 'earmarkChange'])
  const byKind = new Map<string, TAiAgentRunOutput['drafts'][number]>()

  for (const draft of drafts) {
    const payload = draft.payload as any
    if (!mergeableKinds.has(draft.kind) || !Array.isArray(payload?.changes)) {
      merged.push(draft)
      continue
    }
    const existing = byKind.get(draft.kind)
    if (!existing) {
      const clone = {
        ...draft,
        payload: {
          ...payload,
          changes: [...payload.changes]
        }
      }
      byKind.set(draft.kind, clone)
      merged.push(clone)
      continue
    }
    const existingPayload = existing.payload as any
    const existingChanges = Array.isArray(existingPayload?.changes) ? existingPayload.changes : []
    const seen = new Set(existingChanges.map((change: any) => [
      change.memberId,
      change.voucherId,
      change.periodKey,
      change.tagId,
      change.partyId,
      change.budgetId,
      change.earmarkId,
      change.field,
      change.action,
      change.name
    ].filter((value) => value != null && value !== '').join(':')))
    for (const change of payload.changes) {
      const key = [
        change.memberId,
        change.voucherId,
        change.periodKey,
        change.tagId,
        change.partyId,
        change.budgetId,
        change.earmarkId,
        change.field,
        change.action,
        change.name
      ].filter((value) => value != null && value !== '').join(':')
      if (key && seen.has(key)) continue
      if (key) seen.add(key)
      existingChanges.push(change)
    }
    existingPayload.changes = existingChanges
    existing.title = existingPayload.reason || `${existingChanges.length} Änderung(en)`
  }
  return merged
}

export function useAiAgentWorkflow(input: UseAiAgentWorkflowInput) {
  const [agentSessionId, setAgentSessionId] = useState<string | null>(input.initialSessionId || null)

  const resetAgentSession = () => setAgentSessionId(null)

  const shouldUseAgentRuntime = (userPrompt: string) => {
    if (input.filesLength) return false
    const normalized = normalizeLookup(userPrompt)
    const wantsRebook = /(storn|korrekt|falsch|statt).*(buchung|beleg|in|out)|(?:in|out).*(statt|sollte|muss).*(in|out)|neu buchen|neu anlegen/.test(normalized)
    const wantsWrite = /(leg|erstell|erstelle|aender|ander|aktualisier|setze|setz|ordne|zuord|buche|buchen|verbuch|uebernehm|ubernehm|speicher|loesch|losch|markier|verknuepf|verknupf|importier|storn|korrekt|korrigier|eintrag|eintragen|trag ein|hinterleg|hinterlegen|fueg|fug|füge|hinzufueg|hinzufug|hinzufügen|ergänz|ergaenz)/.test(normalized)
    const wantsReportExport = /(export|exportier|speicher|erstelle|erzeuge|download).*(report|bericht|controlling|journal|auswertung|finanz|kassier|jahresabschluss|pdf|csv|xlsx|excel)|(report|bericht|controlling|journal|auswertung|finanz|kassier|jahresabschluss).*(export|pdf|csv|xlsx|excel|datei)/.test(normalized)
    const wantsContentPdfExport = /\bpdf\b|als datei|datei geben|speicher/.test(normalized) && /(diese|diesen|dieses|tabelle|antwort|liste|inhalt|oben|vorherig|vorige|chat)/.test(normalized)
    const wantsExploration = /(zeig|zeige|liste|list|such|find|pruef|pruf|analysier|auswert|welche|welcher|welches|wie viele|status|offen|faellig|fallig|report|bericht|saldo|kontostand|uebersicht|ubersicht|warum|was|wer)/.test(normalized)
    const wantsVereinoData = /(geschaftspartner|lieferant|kunde|kunden|handler|zahlungsempfanger|zahlungspflichtiger|buchung|buchungen|beleg|belege|journal|budget|tag|tags|zweck|zweckbindung|konto|zahlungskonto|bank|mitglied|mitglieder|beitrag|beitraege|rechnung|rechnungen|rechnungsnummer|forderung|forderungen|verbindlichkeit|verbindlichkeiten|offener posten|offene posten|zahlung|zahlungen|sphaere|sphare|out|in|report|bericht|controlling|auswertung|pdf|csv|xlsx|excel)/.test(normalized)
    const wantsSpecificAgentTask = (wantsWrite || wantsReportExport) && wantsVereinoData && /(geschaftspartner|lieferant|kunde|kunden|handler|zahlungsempfanger|zahlungspflichtiger|mitglied|mitglieder|budget|budgets|zweck|zweckbindung|tag|tags|buchung|buchungen|bank|bankimport|zahlungskonto|konto|beitrag|beitraege|rechnung|rechnungen|rechnungsnummer|forderung|forderungen|verbindlichkeit|verbindlichkeiten|offener posten|offene posten|sphaere|sphare|report|bericht|controlling|journal|auswertung|pdf|csv|xlsx|excel)/.test(normalized)
    const hasOpenReview = input.hasOpenReviewWorkflow()
    const wantsOpenReviewFollowup = hasOpenReview && !!agentSessionId && (wantsWrite || wantsVereinoData || (normalized.length > 0 && normalized.length <= 80))
    if (hasOpenReview && !wantsRebook && !wantsSpecificAgentTask && !wantsOpenReviewFollowup) return false
    return wantsReportExport || wantsContentPdfExport || wantsExploration || (wantsWrite && wantsVereinoData) || (!!agentSessionId && wantsVereinoData) || wantsOpenReviewFollowup
  }

  const openAgentDrafts = (drafts: TAiAgentRunOutput['drafts'], userPrompt: string) => {
    for (const draft of drafts) {
      const payload = draft.payload as any
      if (draft.kind !== 'booking') {
        input.prepareAgentDraft(draft, userPrompt)
        continue
      }
      const qa = payload?.qa || payload
      if (!qa) continue
      const agentDraftId = `agent-booking-${Date.now()}-${Math.random().toString(36).slice(2)}`
      const qaWithAgentDraft = { ...qa, agentDraftId }
      window.dispatchEvent(new CustomEvent('ai:open-booking-draft', {
        detail: { qa: qaWithAgentDraft, files: payload?.files || [], agentDraftId }
      }))
      input.pushMessage({
        role: 'assistant',
        title: 'Buchungsentwurf geöffnet',
        body: `Der Agent hat "${draft.title}" als bearbeitbaren Buchungsentwurf geöffnet.`,
        meta: 'Agent-Draft',
        bookingDraft: {
          agentDraftId,
          title: draft.title,
          qa: qaWithAgentDraft,
          files: payload?.files || [],
          status: 'OPEN'
        }
      })
    }
  }

  const runAgentRuntime = async (userPrompt: string) => {
    const result = await window.api.ai.agent.run({
      sessionId: agentSessionId || undefined,
      prompt: userPrompt,
      uiContext: {
        activeArea: 'AI',
        selectedJobId: input.selectedJobId,
        selectedCandidate: input.selectedCandidate,
        ...(input.getUiContext ? input.getUiContext() : {})
      }
    })
    setAgentSessionId(result.sessionId)
    input.onTrace(result.trace || [])
    input.pushMessage({
      role: 'assistant',
      title: result.title || 'VereinO Agent',
      body: result.answer,
      meta: [
        result.toolCalls.length ? `${result.toolCalls.length} Tool-Aufruf(e)` : 'Agent',
        input.formatUsage(result.usage)
      ].filter(Boolean).join(' · ')
    })
    openAgentDrafts(mergeAgentDrafts(result.drafts), userPrompt)
    return true
  }

  return {
    agentSessionId,
    resetAgentSession,
    shouldUseAgentRuntime,
    runAgentRuntime
  }
}
