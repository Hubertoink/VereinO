import type { BookingAISuggestion } from '../../src/renderer/utils/bookingAiPatterns'

/** Keep only proposals the current web form can persist. */
export function webBookingSuggestions(suggestions: BookingAISuggestion[], general: boolean, assignments: boolean, budgetIds: number[], earmarkIds: number[]): BookingAISuggestion[] {
  return suggestions.filter(item => !item.type || item.type === 'IN' || item.type === 'OUT').map(item => ({
    ...item,
    tags: item.tags,
    sphere: general ? undefined : item.sphere,
    transferFromAccountId: undefined,
    transferToAccountId: undefined,
    paymentAccountId: item.paymentAccountId === 1 || item.paymentAccountId === 2 ? item.paymentAccountId : undefined,
    budgets: assignments ? item.budgets?.filter(value => budgetIds.includes(value.id)) : [],
    earmarks: assignments ? item.earmarks?.filter(value => earmarkIds.includes(value.id)) : []
  })).filter(item => item.type || item.sphere || item.paymentAccountId || item.budgets?.length || item.earmarks?.length || item.tags?.length)
}
