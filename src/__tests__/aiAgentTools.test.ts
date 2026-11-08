jest.mock('electron', () => ({
  BrowserWindow: jest.fn()
}))
jest.mock('../../electron/main/services/aiReporting', () => ({
  getDefaultReportScope: () => ({ from: '2026-01-01', to: '2026-11-07' }),
  generateReportAnswer: jest.fn(async () => ({ report: { title: 'Testbericht' }, usage: {} }))
}))
jest.mock('../../electron/main/db/database', () => ({ getDb: jest.fn(), withTransaction: jest.fn() }))
jest.mock('../../electron/main/services/settings', () => ({ getSetting: jest.fn() }))

jest.mock('../../electron/main/repositories/bankTransactions', () => ({
  listBankTransactions: jest.fn(),
  findBankTransactionMatches: jest.fn(({ id }: { id: number }) => id === 24 ? [{
    matchKind: 'RECURRING',
    recurringBookingId: 7,
    recurringBookingName: 'Vereinssoftware',
    occurrenceId: 71,
    scheduledDate: '2026-07-07',
    date: '2026-07-07',
    type: 'OUT',
    description: 'Software-Abo',
    score: 95
  }] : []),
  getBankTransaction: jest.fn((id: number) => ({
    id,
    status: 'OPEN',
    bookingDate: '2026-07-07',
    direction: 'OUT',
    amount: id === 23 ? 111 : 117.56,
    counterparty: 'Marc Reiner',
    purpose: id === 23 ? 'Zirkus Trolori 7-9' : 'Einkaufen für Förderverein',
    bankReference: `REF-${id}`,
    paymentAccountId: 1,
    counterpartyIban: 'DE12500105170648489890',
    paymentAccountName: 'Bank'
  }))
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

jest.mock('../../electron/main/repositories/parties', () => ({
  listParties: jest.fn(() => [])
}))

jest.mock('../../electron/main/repositories/recurringBookings', () => ({
  listRecurringBookings: jest.fn(() => [{
    id: 7,
    name: 'Vereinssoftware',
    status: 'ACTIVE',
    nextDueDate: '2026-08-07',
    dueCount: 1
  }]),
  listDueRecurringOccurrences: jest.fn(() => ({
    recurringBookingId: 7,
    recurringBookingName: 'Vereinssoftware',
    type: 'OUT',
    amountMode: 'GROSS',
    amount: 25,
    grossAmount: 25,
    vatRate: 0,
    paymentAccountId: 1,
    paymentAccountName: 'Bank',
    occurrences: [
      { occurrenceId: 71, scheduledDate: '2026-07-07', amount: 25, grossAmount: 25 },
      { occurrenceId: 72, scheduledDate: '2026-08-07', amount: 25, grossAmount: 25 }
    ],
    totalAmount: 50
  })),
  recurringBookingsSummary: jest.fn(() => ({ due: 1, upcoming: 1, active: 1, paused: 0 }))
}))

jest.mock('../../electron/main/repositories/tags', () => ({
  listTags: jest.fn(() => [])
}))

jest.mock('../../electron/main/repositories/vouchers', () => ({
  cashBalance: jest.fn(() => ({})),
  listVouchersAdvanced: jest.fn(() => []),
  listVouchersAdvancedPaged: jest.fn((input?: { voucherIds?: number[] }) => {
    const rows = [
      {
        id: 49,
        voucherNo: '2026-07-07_00044',
        date: '2026-07-07',
        description: 'Mitgliedsbeitrag 2026-04',
        grossAmount: 20
      },
      {
        id: 48,
        voucherNo: '2026-07-07_00048',
        date: '2026-07-07',
        type: 'OUT',
        sphere: 'IDEELL',
        description: 'Zirkus Trolori 7-9',
        grossAmount: 111,
        vatRate: 0,
        paymentMethod: 'BANK',
        paymentAccountId: 1,
        paymentAccountName: 'Bank',
        tags: ['Zirkus']
      }
    ]
    const wanted = new Set((input?.voucherIds || []).map(Number))
    return { rows: wanted.size ? rows.filter((row) => wanted.has(Number(row.id))) : rows }
  }),
  monthlyVouchers: jest.fn(() => []),
  summarizeVouchers: jest.fn(() => ({}))
}))

import { createAiAgentTools } from '../../electron/main/services/aiAgentTools'

test('the report tool passes the same organization rules to its narrative model', async () => {
  const aiRules = [{ id: 7, name: 'Vorstand', scope: 'ALL', instruction: 'Verwende einfache Sprache.' }] as const
  const tool = createAiAgentTools({ context: { aiRules: [...aiRules] } }).find(item => item.name === 'reports_answer')!
  await tool.run({ question: 'Unsere Finanzlage?', from: null, to: null })
  expect(jest.requireMock('../../electron/main/services/aiReporting').generateReportAnswer).toHaveBeenCalledWith(
    { question: 'Unsere Finanzlage?', from: '2026-01-01', to: '2026-11-07' }, aiRules
  )
})

describe('booking draft tool contract', () => {
  const context = { organization: { profile: 'GENERAL' }, primaryClassifications: [{ id: 5, name: 'Material', isActive: true }, { id: 6, name: 'Alt', isActive: false }] } as any
  const args = { date: '2026-07-07', type: 'OUT', description: 'Einkauf', grossAmount: 111, primaryClassificationValueId: 5, bankTransactionId: 23 }

  it('exposes the required category to the model and carries bank source/link/IBAN into the real draft', async () => {
    const tool = createAiAgentTools({ context }).find(item => item.name === 'booking_draft_prepare')!
    expect(tool.parameters.properties).toMatchObject({ primaryClassificationValueId: expect.any(Object), bankTransactionId: expect.any(Object) })
    const result = await tool.run(args)
    expect(result.ok).toBe(true)
    expect(result.draft).toMatchObject({ kind: 'booking', payload: { qa: {
      primaryClassificationValueId: 5, bankTransactionId: 23, paymentAccountId: 1, paymentMethod: 'BANK',
      bankReviewSource: { transactionId: 23, amount: 111, counterparty: 'Marc Reiner', counterpartyIban: 'DE12500105170648489890' },
      partyCreationSource: { name: 'Marc Reiner', iban: 'DE12500105170648489890' }
    } } })
  })

  it('only includes model-generated comments after explicit opt-in', async () => {
    const getSetting = jest.requireMock('../../electron/main/services/settings').getSetting as jest.Mock
    const tool = createAiAgentTools({ context }).find(item => item.name === 'booking_draft_prepare')!
    getSetting.mockReturnValue(undefined)
    expect((await tool.run({ ...args, note: 'Referenz BREF-123' })).draft?.payload).toMatchObject({ qa: { note: '' } })
    getSetting.mockReturnValue(true)
    expect((await tool.run({ ...args, note: 'Referenz BREF-123' })).draft?.payload).toMatchObject({ qa: { note: 'Referenz BREF-123' } })
    getSetting.mockReturnValue(undefined)
  })

  it('returns available categories for correcting arguments instead of diagnosing broken settings', async () => {
    const tools = createAiAgentTools({ context })
    const tool = tools.find(item => item.name === 'booking_draft_prepare')!
    for (const id of [null, 6, 99]) {
      const result = await tool.run({ ...args, primaryClassificationValueId: id })
      expect(result.ok).toBe(false)
      expect(result.warning).toContain('"id":5,"name":"Material"')
      expect(result.warning).not.toContain('"name":"Alt"')
    }
    const data = await tools.find(item => item.name === 'master_data_list')!.run({})
    expect(data.data).toMatchObject({ primaryClassifications: [{ id: 5, name: 'Material' }] })
  })

  it('does not prepare a bank-linked draft with a conflicting amount, direction, account or closed bank source', async () => {
    const tool = createAiAgentTools({ context }).find(item => item.name === 'booking_draft_prepare')!
    for (const patch of [{ grossAmount: 112 }, { type: 'IN' }, { paymentAccountId: 99 }]) {
      expect((await tool.run({ ...args, ...patch })).ok).toBe(false)
    }
    jest.requireMock('../../electron/main/repositories/bankTransactions').getBankTransaction.mockReturnValueOnce({ id: 23, status: 'LINKED' })
    expect((await tool.run(args)).ok).toBe(false)
  })
})

describe('createAiAgentTools', () => {
  it('requests all due periods unless a specific period is requested', async () => {
    const payments = jest.requireMock('../../electron/main/repositories/members_payments')
    const tool = createAiAgentTools({ context: {} as any }).find(item => item.name === 'payments_due')!
    await tool.run({ interval: 'MONTHLY', memberId: 7 })
    expect(payments.listDue).toHaveBeenLastCalledWith(expect.objectContaining({ dueThroughToday: true, memberId: 7 }))
    await tool.run({ interval: 'MONTHLY', periodKey: '2026-09' })
    expect(payments.listDue).toHaveBeenLastCalledWith(expect.objectContaining({ dueThroughToday: false, periodKey: '2026-09' }))
  })

  it('prepares a business partner review draft instead of a booking', async () => {
    const tools = createAiAgentTools({ context: {} as any })
    const tool = tools.find((item) => item.name === 'party_change_draft_prepare')

    expect(tool).toBeTruthy()

    const result = await tool!.run({
      changes: [{
        action: 'CREATE',
        name: 'Musterhandel GmbH',
        role: 'SUPPLIER',
        city: 'Köln'
      }]
    })

    expect(result.ok).toBe(true)
    expect(result.draft?.kind).toBe('partyChange')
    expect(result.draft?.payload).toMatchObject({
      changes: [{
        action: 'CREATE',
        name: 'Musterhandel GmbH',
        payload: { role: 'SUPPLIER', city: 'Köln' }
      }]
    })
  })

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

  it('prepares bank transaction link drafts without rebooking vouchers', async () => {
    const tools = createAiAgentTools({ context: {} as any })
    const tool = tools.find((item) => item.name === 'bank_transaction_link_draft_prepare')

    expect(tool).toBeTruthy()

    const result = await tool!.run({
      links: [{ bankTransactionId: 23, voucherId: 48 }],
      reason: 'Bankimportbeleg mit vorhandener Buchung verknüpfen'
    })

    expect(result.ok).toBe(true)
    expect(result.draft?.kind).toBe('bankLink')
    expect((result.draft?.payload as any).changes).toMatchObject([
      {
        bankTransactionId: 23,
        voucherId: 48,
        voucherNo: '2026-07-07_00048',
        bankCounterparty: 'Marc Reiner',
        bankPurpose: 'Zirkus Trolori 7-9',
        selected: true
      }
    ])
  })

  it('lists recurring bookings with their due summary', async () => {
    const tools = createAiAgentTools({ context: {} as any })
    const tool = tools.find((item) => item.name === 'recurring_bookings_list')

    expect(tool).toBeTruthy()
    const result = await tool!.run({ status: 'ACTIVE' })

    expect(result.ok).toBe(true)
    expect(result.data).toMatchObject({
      summary: { due: 1, active: 1 },
      count: 1,
      rows: [{ id: 7, name: 'Vereinssoftware' }]
    })
  })

  it('prepares a recurring occurrence and bank transaction as one review', async () => {
    const tools = createAiAgentTools({ context: {} as any })
    const tool = tools.find((item) => item.name === 'bank_transaction_link_draft_prepare')

    const result = await tool!.run({
      links: [{ bankTransactionId: 24, recurringBookingId: 7, occurrenceId: 71 }],
      reason: 'Bankbeleg mit Dauerbuchung zusammenführen'
    })

    expect(result.ok).toBe(true)
    expect(result.draft?.kind).toBe('bankLink')
    expect((result.draft?.payload as any).changes).toMatchObject([{
      targetKind: 'RECURRING',
      bankTransactionId: 24,
      recurringBookingId: 7,
      recurringBookingName: 'Vereinssoftware',
      occurrenceId: 71,
      scheduledDate: '2026-07-07',
      selected: true
    }])
  })

  it('prepares all open recurring occurrences as one review', async () => {
    const tools = createAiAgentTools({ context: {} as any })
    const tool = tools.find((item) => item.name === 'recurring_booking_draft_prepare')

    expect(tool).toBeTruthy()
    const result = await tool!.run({ recurringBookingId: 7, bookingDate: '2026-09-04' })

    expect(result.ok).toBe(true)
    expect(result.draft?.kind).toBe('recurringBooking')
    expect(result.draft?.payload).toMatchObject({
      recurringBookingId: 7,
      bookingDate: '2026-09-04',
      totalAmount: 50,
      occurrences: [
        { occurrenceId: 71, scheduledDate: '2026-07-07' },
        { occurrenceId: 72, scheduledDate: '2026-08-07' }
      ]
    })
  })

  it('blocks rebook drafts for pure bank transaction linking requests', async () => {
    const tools = createAiAgentTools({ context: {} as any })
    const tool = tools.find((item) => item.name === 'voucher_rebook_draft_prepare')

    expect(tool).toBeTruthy()

    const result = await tool!.run({
      originalVoucherId: 48,
      newType: 'OUT',
      bankTransactionId: 23,
      reason: 'Bankbeleg 23 mit der vorhandenen Buchung verknüpfen'
    })

    expect(result.ok).toBe(false)
    expect(result.warning).toContain('reiner Bankbeleg-Verknüpfung')
  })
})


test('free booking drafts carry counterparty source data into central partner creation', async () => {
  const tool = createAiAgentTools({ context: {} as any }).find(item => item.name === 'booking_draft_prepare')!
  const result = await tool.run({ date: '2026-08-17', type: 'OUT', description: 'Werkzeug', grossAmount: 119,
    counterparty: 'OBI GmbH', counterpartyIban: 'DE12500105170648489890' })
  expect(result.ok).toBe(true)
  expect(result.draft?.payload).toMatchObject({ qa: {
    counterparty: 'OBI GmbH', partyCreationSource: { name: 'OBI GmbH', iban: 'DE12500105170648489890' }
  } })
})
