import type { RendererApi } from '../../../types/api'
import type { TMemberCreateInput, TMemberUpdateInput } from '../../../../electron/main/ipc/schemas'
import { dispatchDataChanged } from '../../utils/refresh'
import type { AiMessage } from './aiChat'
import type { AiMemberImportState, AiMemberUpdateState, MemberRow, Notify } from './aiViewTypes'
import type { useAiReviewState } from './useAiReviewState'
import {
  buildMemberUpdateDraft,
  displayMemberValue,
  parseContributionHint,
  parseMemberDraftsFromText,
  sanitizeMemberDrafts,
  wantsApplyPendingMemberUpdates,
  wantsCreatePendingMembers
} from './aiMemberDomain'
import { formatIsoDate, normalizeLookup } from './aiText'

const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })

type MemberReviewState = Pick<
  ReturnType<typeof useAiReviewState>,
  'pendingMembers' | 'setPendingMembers' | 'pendingMemberUpdates' | 'setPendingMemberUpdates'
>

export type AiMemberWorkflowDependencies = MemberReviewState & {
  members: Pick<RendererApi['members'], 'list' | 'create' | 'update'>
  pushMessage: (message: Omit<AiMessage, 'id' | 'displayBody' | 'isStreaming'>) => void
  notify: Notify
  setBusy: (busy: boolean) => void
}

// Review state remains owned by useAiReviewState, so chat restoration and routing
// share the same draft as these member commands. Recreate with each render's state.
export function createAiMemberWorkflow({
  members,
  pendingMembers,
  setPendingMembers,
  pendingMemberUpdates,
  setPendingMemberUpdates,
  pushMessage,
  notify,
  setBusy
}: AiMemberWorkflowDependencies) {
  const prepareMemberCreation = async (userPrompt: string) => {
    const parsed = parseMemberDraftsFromText(userPrompt)
    if (!parsed) return false
    setPendingMembers(parsed)
    const missingContribution = parsed.members.some(
      (member) => !member.contributionAmount || !member.contributionInterval
    )
    pushMessage({
      role: 'assistant',
      title: 'Mitgliederanlage vorbereitet',
      body: `${parsed.members.length} Mitglied(er) wurden aus deiner Nachricht erkannt. Bitte prüfe die Vorschau unten${missingContribution ? ' und ergänze den Beitrag.' : '.'}`,
      meta: missingContribution ? 'Beitrag fehlt noch' : 'Bereit zum Anlegen'
    })
    return true
  }

  const applyMemberFollowup = async (userPrompt: string) => {
    if (!pendingMembers || pendingMembers.status === 'CREATED') return false
    const contribution = parseContributionHint(userPrompt)
    if (contribution.amount || contribution.interval) {
      const nextState: AiMemberImportState = {
        ...pendingMembers,
        members: sanitizeMemberDrafts(pendingMembers.members).map((member) => ({
          ...member,
          contributionAmount: contribution.amount ?? member.contributionAmount,
          contributionInterval: contribution.interval || member.contributionInterval
        }))
      }
      setPendingMembers(nextState)
      const firstMember = nextState.members[0]
      pushMessage({
        role: 'assistant',
        title: 'Beitrag übernommen',
        body: `Der Beitrag wurde für die vorbereiteten Mitglieder gesetzt: ${firstMember?.contributionAmount ? euro.format(firstMember.contributionAmount) : 'Betrag offen'}${firstMember?.contributionInterval === 'YEARLY' ? ' · jährlich' : firstMember?.contributionInterval ? ` · ${firstMember.contributionInterval}` : ''}.`
      })
      return true
    }
    if (wantsCreatePendingMembers(userPrompt)) {
      await createPendingMembers()
      return true
    }
    return false
  }

  const nextMemberNumbers = async (count: number) => {
    const result = await members.list({ limit: 200, sortBy: 'memberNo', sort: 'DESC' })
    const numeric = (result.rows || [])
      .map((member) => Number(String(member.memberNo || '').trim()))
      .filter((value) => Number.isFinite(value) && value > 0)
    const start = numeric.length ? Math.max(...numeric) + 1 : 1
    return Array.from({ length: count }, (_, idx) => String(start + idx).padStart(4, '0'))
  }

  const createPendingMembers = async (stateOverride?: AiMemberImportState) => {
    const memberState = stateOverride || pendingMembers
    if (!memberState || memberState.status === 'CREATED') return
    const missing = memberState.members.filter(
      (member) =>
        !member.name ||
        !member.joinDate ||
        !member.contributionAmount ||
        !member.contributionInterval
    )
    if (missing.length) {
      pushMessage({
        role: 'assistant',
        title: 'Mitgliederanlage noch unvollständig',
        body: `Es fehlen noch Pflichtangaben bei ${missing.map((member) => member.name).join(', ')}. Bitte ergänze Beitrag und Eintrittsdatum.`
      })
      return
    }
    setBusy(true)
    try {
      const numbers = await nextMemberNumbers(memberState.members.length)
      const created = []
      for (let idx = 0; idx < memberState.members.length; idx += 1) {
        const member = memberState.members[idx]
        const payload: TMemberCreateInput = {
          memberNo: numbers[idx],
          name: member.name,
          status: 'ACTIVE',
          boardRole: member.boardRole || null,
          join_date: member.joinDate,
          contribution_amount: member.contributionAmount ?? null,
          contribution_interval: member.contributionInterval || null,
          next_due_date: member.nextDueDate || null,
          notes: member.birthDate ? `Geburtsdatum: ${formatIsoDate(member.birthDate)}` : null
        }
        const result = await members.create(payload)
        created.push({ ...member, createdId: result.id, createdMemberNo: numbers[idx] })
      }
      setPendingMembers({ ...memberState, status: 'CREATED', members: created })
      pushMessage({
        role: 'assistant',
        title: 'Mitglieder angelegt',
        body: `${created.length} Mitglied(er) wurden angelegt:\n${created.map((member) => `- ${member.createdMemberNo} · ${member.name}`).join('\n')}`,
        meta: 'VereinO-Daten geändert'
      })
      dispatchDataChanged(['members'])
      notify('success', `${created.length} Mitglieder angelegt.`)
    } catch (error: any) {
      notify('error', error?.message || String(error))
      pushMessage({
        role: 'assistant',
        title: 'Mitgliederanlage fehlgeschlagen',
        body: error?.message || String(error)
      })
    } finally {
      setBusy(false)
    }
  }

  const loadAllMembers = async () => {
    const rows: MemberRow[] = []
    let offset = 0
    const limit = 200
    while (true) {
      const result = await members.list({
        limit,
        offset,
        status: 'ALL',
        sortBy: 'name',
        sort: 'ASC'
      })
      rows.push(...(result.rows || []))
      if ((result.rows || []).length < limit) break
      offset += limit
    }
    return rows
  }

  const prepareMemberUpdate = async (userPrompt: string) => {
    const members = await loadAllMembers()
    const draft = buildMemberUpdateDraft(userPrompt, members)
    if (!draft) {
      pushMessage({
        role: 'assistant',
        title: 'Mitgliederänderung nicht eindeutig',
        body: 'Ich konnte keine eindeutigen Mitgliedsänderungen ableiten. Nenne bitte Zielgruppe oder Namen und die gewünschten Felder, z.B. „Setze bei allen aktiven Mitgliedern den Beitrag auf 20 € monatlich“.'
      })
      return true
    }
    setPendingMemberUpdates(draft)
    pushMessage({
      role: 'assistant',
      title: 'Mitgliederänderung vorbereitet',
      body: `${draft.changes.length} Änderung(en) für ${new Set(draft.changes.map((change) => change.memberId)).size} Mitglied(er) vorbereitet. Bitte prüfe die Vorschau unten.`,
      meta: 'Review erforderlich'
    })
    return true
  }

  const applyMemberUpdateFollowup = async (userPrompt: string) => {
    if (!pendingMemberUpdates || pendingMemberUpdates.status === 'APPLIED') return false
    if (wantsApplyPendingMemberUpdates(userPrompt)) {
      await applyPendingMemberUpdates()
      return true
    }
    const normalized = normalizeLookup(userPrompt)
    const wantsLowercase = /(klein|kleinschreib|lowercase|lower case|minuskel)/.test(normalized)
    const wantsUppercase = /(gross|groß|uppercase|upper case|majusk)/.test(normalized)
    const wantsEmailTransform =
      /(email|e mail|mail|adresse|adressen)/.test(normalized) ||
      pendingMemberUpdates.changes.some(
        (change) => change.field === 'email' && change.selected && !change.applied
      )
    if ((wantsLowercase || wantsUppercase) && wantsEmailTransform) {
      let changed = 0
      setPendingMemberUpdates((current) =>
        current
          ? {
              ...current,
              changes: current.changes.map((change) => {
                if (
                  change.applied ||
                  change.field !== 'email' ||
                  typeof change.newValue !== 'string'
                )
                  return change
                const nextValue = wantsLowercase
                  ? change.newValue.toLowerCase()
                  : change.newValue.toUpperCase()
                if (nextValue === change.newValue) return change
                changed += 1
                return {
                  ...change,
                  newValue: nextValue,
                  newDisplay: displayMemberValue(change.field, nextValue),
                  selected: true
                }
              })
            }
          : current
      )
      pushMessage({
        role: 'assistant',
        title: 'Mitgliederänderung angepasst',
        body: changed
          ? `${changed} E-Mail-Änderung(en) im offenen Review wurden ${wantsLowercase ? 'kleingeschrieben' : 'großgeschrieben'}. Bitte prüfe die Vorschau unten.`
          : `Die E-Mail-Änderungen im offenen Review waren bereits ${wantsLowercase ? 'kleingeschrieben' : 'großgeschrieben'}.`
      })
      return true
    }
    const contribution = parseContributionHint(userPrompt)
    if (!contribution.amount && !contribution.interval) return false
    setPendingMemberUpdates((current) =>
      current
        ? {
            ...current,
            changes: current.changes.map((change) => {
              if (change.applied) return change
              if (change.field === 'contribution_amount' && contribution.amount != null) {
                return {
                  ...change,
                  newValue: contribution.amount,
                  newDisplay: displayMemberValue(change.field, contribution.amount),
                  selected: true
                }
              }
              if (change.field === 'contribution_interval' && contribution.interval) {
                return {
                  ...change,
                  newValue: contribution.interval,
                  newDisplay: displayMemberValue(change.field, contribution.interval),
                  selected: true
                }
              }
              return change
            })
          }
        : current
    )
    pushMessage({
      role: 'assistant',
      title: 'Mitgliederänderung angepasst',
      body: 'Ich habe den Beitrag/Intervall im offenen Änderungsvorschlag aktualisiert. Bitte prüfe die Vorschau unten.'
    })
    return true
  }

  const toggleMemberUpdateChange = (id: string) => {
    setPendingMemberUpdates((current) =>
      current
        ? {
            ...current,
            changes: current.changes.map((change) =>
              change.id === id && !change.applied
                ? { ...change, selected: !change.selected }
                : change
            )
          }
        : current
    )
  }

  const applyPendingMemberUpdates = async () => {
    if (!pendingMemberUpdates || pendingMemberUpdates.status === 'APPLIED') return
    const selected = pendingMemberUpdates.changes.filter(
      (change) => change.selected && !change.applied
    )
    if (!selected.length) {
      notify('info', 'Keine Mitgliederänderungen ausgewählt.')
      return
    }
    setBusy(true)
    try {
      const grouped = new Map<number, TMemberUpdateInput>()
      for (const change of selected) {
        const payload = grouped.get(change.memberId) || { id: change.memberId }
        Object.assign(payload, { [change.field]: change.newValue ?? null })
        grouped.set(change.memberId, payload)
      }
      for (const payload of grouped.values()) {
        await members.update(payload)
      }
      const appliedIds = new Set(selected.map((change) => change.id))
      const nextState: AiMemberUpdateState = {
        ...pendingMemberUpdates,
        status: 'APPLIED',
        changes: pendingMemberUpdates.changes.map((change) =>
          appliedIds.has(change.id) ? { ...change, applied: true } : change
        )
      }
      setPendingMemberUpdates(nextState)
      pushMessage({
        role: 'assistant',
        title: 'Mitglieder geändert',
        body: `${selected.length} Änderung(en) bei ${grouped.size} Mitglied(er)n übernommen.`,
        meta: 'VereinO-Daten geändert'
      })
      dispatchDataChanged(['members'])
      notify('success', `${selected.length} Mitgliederänderungen übernommen.`)
    } catch (error: any) {
      notify('error', error?.message || String(error))
      pushMessage({
        role: 'assistant',
        title: 'Mitgliederänderung fehlgeschlagen',
        body: error?.message || String(error)
      })
    } finally {
      setBusy(false)
    }
  }

  return {
    prepareMemberCreation,
    applyMemberFollowup,
    createPendingMembers,
    loadAllMembers,
    prepareMemberUpdate,
    applyMemberUpdateFollowup,
    toggleMemberUpdateChange,
    applyPendingMemberUpdates
  }
}
