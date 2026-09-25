import { prepareAiAgentDraft } from '../renderer/views/AI/aiAgentDrafts'

function dependencies() {
  const calls: Record<string, unknown[]> = {}
  const setter = (name: string) => (value: unknown) => {
    calls[name] = [...(calls[name] || []), value]
  }
  const messages: unknown[] = []
  return {
    calls,
    messages,
    input: {
      pushMessage: (message: unknown) => messages.push(message),
      setPendingRecurringBooking: setter('recurring'),
      setPendingVoucherReverse: setter('reverse'),
      setPendingVoucherRebook: setter('rebook'),
      setPendingBankLinks: setter('bankLinks'),
      setPendingVoucherUpdates: setter('voucherUpdates'),
      setPendingMemberUpdates: setter('memberUpdates'),
      setPendingContributionLinks: setter('contributionLinks'),
      setPendingInvoiceActions: setter('invoiceActions'),
      setPendingTagActions: setter('tagActions'),
      setPendingPartyActions: setter('partyActions'),
      setPendingReimbursements: setter('reimbursements'),
      setPendingBudgetActions: setter('budgetActions'),
      setPendingEarmarkActions: setter('earmarkActions')
    }
  }
}

describe('agent draft mapping', () => {
  it('preserves reimbursement previews and stale-data checks in the review state', () => {
    const { calls, input } = dependencies()
    const preview = { command: { action: 'LINK', id: 7, voucherId: 9, role: 'PAYMENT', amountCents: 6000 }, before: { title: 'Sommerfest' }, voucher: { voucherNo: 'E9' }, expectedState: 'snapshot' }
    prepareAiAgentDraft({ ...input, userPrompt: 'Ordne die Rückzahlung zu', draft: { kind: 'reimbursementAction', title: 'Erstattung', payload: { changes: [preview] } } })
    expect(calls.reimbursements[0]).toMatchObject({ status: 'DRAFT', changes: [{ ...preview, selected: true }] })
  })
  it('creates a selected member review and records the agent rule in its message', () => {
    const { calls, messages, input } = dependencies()
    prepareAiAgentDraft({
      ...input,
      userPrompt: 'Setze den Beitrag',
      draft: {
        kind: 'memberUpdate',
        title: 'Beitrag ändern',
        payload: { changes: [{ id: '1', selected: false }] },
        autoApproval: { ruleNames: ['Mitgliederregel'] }
      } as any
    })
    expect(calls.memberUpdates).toEqual([
      {
        changes: [{ id: '1', selected: false }],
        sourcePrompt: 'Setze den Beitrag',
        status: 'DRAFT'
      }
    ])
    expect(messages).toEqual([
      expect.objectContaining({ meta: 'Agent-Review · Auto-Regel: Mitgliederregel' })
    ])
  })

  it('does not create a review for an incomplete draft', () => {
    const { calls, messages, input } = dependencies()
    prepareAiAgentDraft({
      ...input,
      userPrompt: 'Storniere',
      draft: { kind: 'voucherReverse', title: 'Storno', payload: {} } as any
    })
    expect(calls).toEqual({})
    expect(messages).toEqual([])
  })
})
