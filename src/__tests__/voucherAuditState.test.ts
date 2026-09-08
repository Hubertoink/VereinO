import { voucherAuditState } from '../../electron/main/repositories/voucherAuditState'
const state = (row = {}, tags: string[] = [], budgets: Array<{ budgetId: number; amount: number }> = [], earmarks: Array<{ earmarkId: number; amount: number }> = []) => voucherAuditState(row, tags, budgets, earmarks)
test('empty form values and reordered assignment sets do not create an audit change', () => {
 expect(state({ note: null, budget_id: 1 }, ['B', 'A'], [{ budgetId: 1, amount: 10 }, { budgetId: 2, amount: 20 }])).toBe(state({ note: '', budget_id: 2 }, ['A', 'B'], [{ budgetId: 2, amount: 20 }, { budgetId: 1, amount: 10 }]))
})
test('real comment, tag, assignment and accounting changes are retained', () => {
 const original = state()
 expect(state({ note: 'Kommentar' })).not.toBe(original)
 expect(state({}, ['Neu'])).not.toBe(original)
 expect(state({}, [], [{ budgetId: 1, amount: 10 }])).not.toBe(original)
 expect(state({}, [], [], [{ earmarkId: 1, amount: 10 }])).not.toBe(original)
 expect(state({ gross_amount: 10 })).not.toBe(state({ gross_amount: 20 }))
 expect(state({ payment_account_id: 1 })).not.toBe(state({ payment_account_id: 2 }))
})
