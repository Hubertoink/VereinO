jest.mock('electron', () => ({
  BrowserWindow: jest.fn()
}))

jest.mock('../../electron/main/repositories/bankTransactions', () => ({
  listBankTransactions: jest.fn(),
  findBankTransactionMatches: jest.fn(() => [])
}))

jest.mock('../../electron/main/repositories/bindings', () => ({
  listBindings: jest.fn(() => [])
}))

jest.mock('../../electron/main/repositories/budgets', () => ({
  listBudgets: jest.fn(() => [])
}))

jest.mock('../../electron/main/repositories/invoices', () => ({
  listInvoicesPaged: jest.fn(() => ({ rows: [], total: 0 })),
  summarizeInvoices: jest.fn(() => ({}))
}))

jest.mock('../../electron/main/repositories/members', () => ({
  listMembers: jest.fn(() => ({
    rows: [
      {
        id: 7,
        name: 'Max Mustermann',
        contribution_amount: 20,
        contribution_interval: 'MONTHLY'
      }
    ]
  }))
}))

jest.mock('../../electron/main/repositories/aiAgentKnowledge', () => ({
  listAiAgentAutoRules: jest.fn(() => []),
  listAiAgentMemory: jest.fn(() => []),
  upsertAiAgentAutoRule: jest.fn(),
  upsertAiAgentMemory: jest.fn()
}))

jest.mock('../../electron/main/repositories/members_payments', () => ({
  listDue: jest.fn(() => ({
    rows: [
      {
        memberId: 7,
        name: 'Max Mustermann',
        periodKey: '2026-04',
        interval: 'MONTHLY',
        amount: 20,
        paid: 0,
        voucherId: null,
        verified: 0
      }
    ]
  })),
  dueSummary: jest.fn(() => ({ dueMembers: 1, duePeriods: 1 }))
}))

jest.mock('../../electron/main/repositories/paymentAccounts', () => ({
  listPaymentAccounts: jest.fn(() => [])
}))

jest.mock('../../electron/main/repositories/tags', () => ({
  listTags: jest.fn(() => [])
}))

jest.mock('../../electron/main/repositories/vouchers', () => ({
  cashBalance: jest.fn(() => ({})),
  listVouchersAdvanced: jest.fn(() => []),
  listVouchersAdvancedPaged: jest.fn(() => ({
    rows: [
      {
        id: 49,
        voucherNo: '2026-07-07_00044',
        date: '2026-07-07',
        description: 'Mitgliedsbeitrag 2026-04',
        grossAmount: 20
      }
    ]
  })),
  monthlyVouchers: jest.fn(() => []),
  summarizeVouchers: jest.fn(() => ({}))
}))

import { createAiAgentTools } from '../../electron/main/services/aiAgentTools'

describe('createAiAgentTools', () => {
  it('prepares a contribution payment link draft for existing vouchers', async () => {
    const tools = createAiAgentTools({ context: {} as any })
    const tool = tools.find((item) => item.name === 'contribution_payment_link_draft_prepare')

    expect(tool).toBeTruthy()

    const result = await tool!.run({
      links: [{ memberId: 7, periodKey: '2026-04', voucherId: 49 }],
      reason: 'Max Mustermann Beiträge verknüpfen'
    })

    expect(result.ok).toBe(true)
    expect(result.draft?.kind).toBe('contributionPaymentLink')
    expect((result.draft?.payload as any).changes).toMatchObject([
      {
        memberId: 7,
        memberName: 'Max Mustermann',
        periodKey: '2026-04',
        voucherId: 49,
        voucherNo: '2026-07-07_00044',
        selected: true
      }
    ])
  })

  it('prepares voucher update drafts with full gross amounts for budgets and earmarks', async () => {
    const tools = createAiAgentTools({ context: {} as any })
    const tool = tools.find((item) => item.name === 'voucher_update_draft_prepare')

    expect(tool).toBeTruthy()

    const result = await tool!.run({
      voucherIds: [49],
      budgetId: 5,
      earmarkId: 9,
      reason: 'Buchung Budget und Zweckbindung zuordnen'
    })

    expect(result.ok).toBe(true)
    expect(result.draft?.kind).toBe('voucherUpdate')
    expect((result.draft?.payload as any).changes).toMatchObject([
      {
        voucherId: 49,
        grossAmount: 20,
        newBudgetId: 5,
        newBudgetAmount: 20,
        newEarmarkId: 9,
        newEarmarkAmount: 20,
        selected: true
      }
    ])
  })

  it('prepares one voucher update draft with multiple budget assignments', async () => {
    const tools = createAiAgentTools({ context: {} as any })
    const tool = tools.find((item) => item.name === 'voucher_update_draft_prepare')

    expect(tool).toBeTruthy()

    const result = await tool!.run({
      voucherIds: [49],
      budgetAssignments: [
        { budgetId: 5, amount: 12.5 },
        { budgetId: 6, amount: 7.5 }
      ],
      reason: 'Buchung auf zwei Budgets aufteilen'
    })

    expect(result.ok).toBe(true)
    expect((result.draft?.payload as any).changes).toMatchObject([
      {
        voucherId: 49,
        newBudgetLabel: '2 Budgets',
        newBudgets: [
          { budgetId: 5, label: 'Budget #5', amount: 12.5 },
          { budgetId: 6, label: 'Budget #6', amount: 7.5 }
        ],
        selected: true
      }
    ])
  })
})
