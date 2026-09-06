import { STATIC_AI_MENTIONS } from './aiMentions'
import type { AiMentionOption, TagRow } from './aiViewTypes'
import type { PaymentAccountOption } from './aiBooking'

type ReferenceRows = {
  tags: TagRow[]
  budgets: any[]
  bindings: any[]
  accounts: PaymentAccountOption[]
}

export function buildAiMentionOptions({ tags, budgets, bindings, accounts }: ReferenceRows) {
  const dynamic: AiMentionOption[] = [
    ...tags.slice(0, 80).map((tag) => ({
      id: `tag-${tag.id}`,
      label: tag.name,
      insert: `Tag:${tag.name}`,
      scope: 'Tag' as const,
      description: tag.usage != null ? `${tag.usage} Nutzung(en)` : 'VereinO-Tag',
      plannerHint: `Tag "${tag.name}" gezielt als Filter oder Änderung verwenden.`
    })),
    ...budgets.slice(0, 80).map((budget) => {
      const label =
        budget.categoryName || budget.projectName || budget.name || `Budget ${budget.id}`
      return {
        id: `budget-${budget.id}`,
        label,
        insert: `Budget:${label}`,
        scope: 'Kategorie' as const,
        description: budget.archived ? 'Archiviertes Budget/Kategorie' : 'Budget/Kategorie',
        plannerHint: `Budget/Kategorie "${label}" gezielt verwenden.`
      }
    }),
    ...bindings.slice(0, 80).map((binding) => ({
      id: `binding-${binding.id}`,
      label: binding.code ? `${binding.code} · ${binding.name}` : binding.name,
      insert: `Zweck:${binding.code || binding.name}`,
      scope: 'Zweckbindung' as const,
      description: binding.isActive ? 'Aktive Zweckbindung' : 'Inaktive Zweckbindung',
      plannerHint: `Zweckbindung "${binding.code || binding.name}" gezielt verwenden.`
    })),
    ...accounts.slice(0, 40).map((account) => ({
      id: `account-${account.id}`,
      label: account.name,
      insert: `Konto:${account.name}`,
      scope: 'Zahlungskonto' as const,
      description: account.kind,
      plannerHint: `Zahlungskonto "${account.name}" mit paymentAccountId ${account.id} gezielt verwenden.`
    }))
  ]
  return [...STATIC_AI_MENTIONS, ...dynamic]
}
