import { openingDraft, parseOpening, type OpeningDraft } from '../../utils/accountOpening'
import type { TSetupAccountsInput } from '../../../../electron/main/ipc/schemas'

type AccountRow = Awaited<ReturnType<typeof window.api.paymentAccounts.list>>['rows'][number]
export type SetupAccount = {
  name: string
  kind: AccountRow['kind']
  selected: boolean
  opening: OpeningDraft
  existing?: AccountRow
}

export function setupAccountChoices(rows: AccountRow[]): SetupAccount[] {
  const choices: SetupAccount[] = rows.map(existing => ({
    name: existing.name, kind: existing.kind, selected: !!existing.isActive, opening: openingDraft(existing), existing
  }))
  const suggestions = [{ name: 'Bar', kind: 'CASH' }, { name: 'Bank', kind: 'BANK' }] as const
  for (const suggestion of suggestions) {
    if (!choices.some(account => account.name.toLocaleLowerCase('de') === suggestion.name.toLocaleLowerCase('de'))) {
      choices.push({ ...suggestion, selected: false, opening: openingDraft({}) })
    }
  }
  return choices
}

export function setupAccountChanges(accounts: SetupAccount[]): TSetupAccountsInput {
  const changes: TSetupAccountsInput = { create: [], activation: [], openings: [] }
  for (const { existing, name, kind, selected, opening: draft } of accounts) {
    if (existing && selected !== !!existing.isActive) changes.activation.push({ accountId: existing.id, active: selected })
    if (!selected) continue
    let opening
    try { opening = parseOpening(draft) }
    catch (cause) { throw new Error(`${name} · ${cause instanceof Error ? cause.message : String(cause)}`) }
    if (!existing) {
      changes.create.push({ name, kind, opening })
    } else {
      const previous = parseOpening(openingDraft(existing))
      if (opening?.date !== previous?.date || opening?.amountCents !== previous?.amountCents) {
        changes.openings.push({ accountId: existing.id, previous, opening })
      }
    }
  }
  return changes
}
