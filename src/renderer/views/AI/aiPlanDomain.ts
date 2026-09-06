import type { TAiActionPlan, TMemberCreateInput } from '../../../../electron/main/ipc/schemas'
import type { AiMemberDraft, AiMemberImportState } from './aiViewTypes'
import { normalizeLookup, parseGermanDate } from './aiText'
import { boardRoleFromText, parseMemberContributionAmount, sanitizeMemberDrafts } from './aiMemberDomain'

export type AiPlanValue = TAiActionPlan['changes'][number]['value']

export function planValueList(value: AiPlanValue | undefined): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item)).filter(Boolean)
  if (value == null || value === '') return []
  return [String(value)]
}

export function planValueString(value: AiPlanValue | undefined) {
  return planValueList(value)[0] || ''
}

export function normalizePlanKey(value: string) {
  return normalizeLookup(value).replace(/\s+/g, '_')
}

export function findPlanFilter(plan: TAiActionPlan, fields: string[]) {
  const wanted = new Set(fields.map(normalizePlanKey))
  return plan.filters.find((filter) => wanted.has(normalizePlanKey(filter.field)))?.value
}

export function findPlanChange(plan: TAiActionPlan, fields: string[], modes?: string[]) {
  const wanted = new Set(fields.map(normalizePlanKey))
  const allowedModes = modes ? new Set(modes.map(normalizePlanKey)) : null
  return plan.changes.find(
    (change) =>
      wanted.has(normalizePlanKey(change.field)) &&
      (!allowedModes || allowedModes.has(normalizePlanKey(change.mode)))
  )?.value
}

export function findPlanArg(plan: TAiActionPlan, keys: string[]) {
  const wanted = new Set(keys.map(normalizePlanKey))
  return plan.args.find((arg) => wanted.has(normalizePlanKey(arg.key)))?.value
}

export function planItemValue(item: TAiActionPlan['items'][number], keys: string[]) {
  const wanted = new Set(keys.map(normalizePlanKey))
  return item.values.find((entry) => wanted.has(normalizePlanKey(entry.key)))?.value
}

export function parsePlanDate(value: AiPlanValue | undefined) {
  const raw = planValueString(value)
  if (!raw) return null
  const iso = raw.match(/\b(20\d{2}|19\d{2})-(\d{2})-(\d{2})\b/)
  if (iso) return iso[0]
  return parseGermanDate(raw)
}

export function parsePlanAmount(value: AiPlanValue | undefined) {
  if (typeof value === 'number') return value > 0 && value <= 1000 ? value : null
  const raw = planValueString(value)
  if (!raw) return null
  const parsed = parseMemberContributionAmount(raw.includes('€') ? raw : `${raw} €`)
  return parsed != null ? parsed : null
}

export function parsePlanInterval(
  value: AiPlanValue | undefined
): TMemberCreateInput['contribution_interval'] | null {
  const normalized = normalizeLookup(planValueString(value))
  if (!normalized) return null
  if (/yearly|jahr|jaehr|jahrlich|jährlich/.test(normalized)) return 'YEARLY'
  if (/quarterly|quartal/.test(normalized)) return 'QUARTERLY'
  if (/monthly|monat/.test(normalized)) return 'MONTHLY'
  return null
}

export function parsePlanBoardRole(
  value: AiPlanValue | undefined
): TMemberCreateInput['boardRole'] | null {
  const raw = planValueString(value)
  if (!raw) return null
  if (/^(V1|V2|KASSIER|SCHRIFT|KASSENPR1|KASSENPR2)$/.test(raw))
    return raw as TMemberCreateInput['boardRole']
  return boardRoleFromText(raw)
}

export function memberStateFromPlan(
  plan: TAiActionPlan,
  sourcePrompt: string
): AiMemberImportState | null {
  const globalAmount = parsePlanAmount(
    findPlanChange(plan, [
      'contributionAmount',
      'contribution_amount',
      'beitrag',
      'mitgliedsbeitrag'
    ])
  )
  const globalInterval = parsePlanInterval(
    findPlanChange(plan, [
      'contributionInterval',
      'contribution_interval',
      'intervall',
      'beitragsintervall'
    ])
  )
  const globalNextDue = parsePlanDate(
    findPlanChange(plan, [
      'nextDueDate',
      'next_due_date',
      'ersteZahlungsfrist',
      'zahlungsfrist',
      'frist'
    ])
  )

  const members = plan.items.map((item) => {
    const name = planValueString(
      planItemValue(item, ['name', 'memberName', 'mitglied', 'vollerName'])
    )
    const birthDate = parsePlanDate(
      planItemValue(item, ['birthDate', 'birth_date', 'geburtsdatum', 'geburt'])
    )
    const joinDate = parsePlanDate(
      planItemValue(item, ['joinDate', 'join_date', 'eintritt', 'eintrittsdatum'])
    )
    const contributionAmount =
      parsePlanAmount(
        planItemValue(item, [
          'contributionAmount',
          'contribution_amount',
          'beitrag',
          'mitgliedsbeitrag'
        ])
      ) ?? globalAmount
    const contributionInterval =
      parsePlanInterval(
        planItemValue(item, [
          'contributionInterval',
          'contribution_interval',
          'intervall',
          'beitragsintervall'
        ])
      ) || globalInterval
    const nextDueDate =
      parsePlanDate(
        planItemValue(item, [
          'nextDueDate',
          'next_due_date',
          'ersteZahlungsfrist',
          'zahlungsfrist',
          'frist'
        ])
      ) || globalNextDue
    return {
      name,
      birthDate,
      joinDate: joinDate || '',
      boardRole: parsePlanBoardRole(
        planItemValue(item, ['boardRole', 'board_role', 'rolle', 'vorstandsrolle'])
      ),
      contributionAmount,
      contributionInterval,
      nextDueDate
    } satisfies AiMemberDraft
  })

  const sanitized = sanitizeMemberDrafts(members)
  return sanitized.length ? { members: sanitized, sourcePrompt, status: 'DRAFT' } : null
}
