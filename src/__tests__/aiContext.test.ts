jest.mock('../../electron/main/services/settings', () => ({ getSetting: jest.fn() }))
jest.mock('../../electron/main/db/database', () => ({ getActiveOrganization: jest.fn() }))
jest.mock('../../electron/main/repositories/bindings', () => ({ listBindings: jest.fn() }))
jest.mock('../../electron/main/repositories/budgets', () => ({ listBudgets: jest.fn() }))
jest.mock('../../electron/main/repositories/invoices', () => ({ listInvoicesPaged: jest.fn(), summarizeInvoices: jest.fn() }))
jest.mock('../../electron/main/repositories/members', () => ({ listMembers: jest.fn() }))
jest.mock('../../electron/main/repositories/members_payments', () => ({ dueSummary: jest.fn() }))
jest.mock('../../electron/main/repositories/paymentAccounts', () => ({ listPaymentAccounts: jest.fn() }))
jest.mock('../../electron/main/repositories/parties', () => ({ listParties: jest.fn() }))
jest.mock('../../electron/main/repositories/recurringBookings', () => ({ listRecurringBookings: jest.fn(), recurringBookingsSummary: jest.fn() }))
jest.mock('../../electron/main/repositories/tags', () => ({ listTags: jest.fn() }))
jest.mock('../../electron/main/repositories/aiAgentKnowledge', () => ({ listAiKnowledgeRules: jest.fn() }))
jest.mock('../../electron/main/repositories/classifications', () => ({
  getOrganizationProfile: jest.fn(), getOrganizationProfileDefinition: jest.fn(), listPrimaryClassificationValues: jest.fn()
}))
jest.mock('../../electron/main/repositories/vouchers', () => ({
  cashBalance: jest.fn(), listVoucherYears: jest.fn(), listVouchersAdvanced: jest.fn(), monthlyVouchers: jest.fn(), summarizeVouchers: jest.fn()
}))

import { buildAiContext, buildAiInvoiceContext } from '../../electron/main/services/aiContext'
import { getSetting } from '../../electron/main/services/settings'
import { getActiveOrganization } from '../../electron/main/db/database'
import { listBindings } from '../../electron/main/repositories/bindings'
import { listBudgets } from '../../electron/main/repositories/budgets'
import { listInvoicesPaged, summarizeInvoices } from '../../electron/main/repositories/invoices'
import { listMembers } from '../../electron/main/repositories/members'
import { dueSummary } from '../../electron/main/repositories/members_payments'
import { listPaymentAccounts } from '../../electron/main/repositories/paymentAccounts'
import { listParties } from '../../electron/main/repositories/parties'
import { listRecurringBookings, recurringBookingsSummary } from '../../electron/main/repositories/recurringBookings'
import { listTags } from '../../electron/main/repositories/tags'
import { listAiKnowledgeRules } from '../../electron/main/repositories/aiAgentKnowledge'
import { getOrganizationProfile, getOrganizationProfileDefinition, listPrimaryClassificationValues } from '../../electron/main/repositories/classifications'
import { cashBalance, listVoucherYears, listVouchersAdvanced, monthlyVouchers, summarizeVouchers } from '../../electron/main/repositories/vouchers'
import { ORGANIZATION_PROFILE_DEFINITIONS } from '../../shared/classification'

const today = '2026-11-17'
const currentRange = { from: '2026-01-01', to: today }
const accountIban = 'DE89 3704 0044 0532 0130 00'
const partyIban = 'DE12 3456 7890 1234 5678 90'
const rules = [
  { id: 1, name: 'Global', scope: 'ALL', instruction: 'Global rule', enabled: 1 },
  { id: 2, name: 'Invoices', scope: 'INVOICES', instruction: 'Invoice rule', enabled: 1 },
  { id: 3, name: 'Bookings', scope: 'BOOKINGS', instruction: 'Booking rule', enabled: 1 }
] as ReturnType<typeof listAiKnowledgeRules>

beforeEach(() => {
  jest.resetAllMocks()
  jest.useFakeTimers().setSystemTime(new Date(`${today}T12:00:00Z`))
  jest.mocked(getSetting).mockReturnValue('Configured organisation')
  jest.mocked(getActiveOrganization).mockReturnValue({ id: 'org-1', name: 'Active organisation' } as ReturnType<typeof getActiveOrganization>)
  jest.mocked(getOrganizationProfileDefinition).mockReturnValue(ORGANIZATION_PROFILE_DEFINITIONS.GENERAL)
  jest.mocked(listPrimaryClassificationValues).mockReturnValue([{
    id: 8, schemeId: 2, stableKey: 'ops', name: 'Operations', color: '#123456', icon: 'briefcase',
    isActive: true, isSystem: false, description: 'Private description', sortOrder: 1
  }])
  jest.mocked(listPaymentAccounts).mockReturnValue([
    { id: 1, name: 'Bank', kind: 'BANK', iban: accountIban, color: '#abc', sortOrder: 2, isActive: 1, openingCents: null, openingDate: null, bookingCount: 99 },
    { id: 2, name: 'Cash', kind: 'CASH', iban: null, sortOrder: 3, isActive: 1, openingCents: null, openingDate: null, bookingCount: 0 }
  ])
  jest.mocked(listBudgets).mockReturnValue([
    { id: 1, label: 'Explicit', name: 'Ignored', year: 2026, sphere: 'IDEELL', categoryName: 'Category', projectName: 'Project', amountPlanned: 250, isArchived: 0 },
    { id: 2, name: 'Named', year: 2026, categoryName: 'Ignored', isArchived: 0 },
    { id: 3, year: 2026, categoryName: 'Category', projectName: 'Ignored', isArchived: 0 },
    { id: 4, year: 2026, projectName: 'Project', isArchived: 0 },
    { id: 5 },
    { id: 6, label: 'Archived', isArchived: 1 }
  ])
  jest.mocked(listBindings).mockReturnValue([
    { id: 1, code: 'ON', name: 'Active', isActive: 1, description: 'Not projected' },
    { id: 2, code: 'OFF', name: 'Inactive', isActive: 0 },
    { id: 3, code: 'LEGACY', name: 'Unspecified' }
  ])
  jest.mocked(listTags).mockReturnValue(Array.from({ length: 122 }, (_, id) => ({
    id, name: `Tag ${id}`, color: '#def', usage: id ? String(id) : null, privateField: 'Not projected'
  })))
  jest.mocked(listParties).mockReturnValue([
    { id: 1, name: 'Supplier', legalName: 'Supplier Ltd', role: 'SUPPLIER', city: 'Berlin', email: 'supplier@example.org', iban: partyIban, vatId: 'DE123', isActive: 1 },
    { id: 2, name: 'No bank', iban: '' }
  ])
  jest.mocked(listAiKnowledgeRules).mockImplementation((opts) => rules.filter(rule => !opts?.scope || rule.scope === 'ALL' || rule.scope === opts.scope))
  jest.mocked(listMembers).mockReturnValue({ total: 1, rows: [
    { id: 1, name: 'Member', status: 'ACTIVE', iban: accountIban, mandate_ref: 'Private mandate', contribution_amount: 12, contribution_interval: 'MONTHLY' }
  ] } as ReturnType<typeof listMembers>)
  jest.mocked(dueSummary).mockReturnValue({ dueMembers: 1, duePeriods: 1, dueAmount: 12 })
  jest.mocked(listVoucherYears).mockReturnValue([2026, 2025])
  jest.mocked(summarizeVouchers).mockImplementation((filters = {}) => ({
    totals: { net: 10.124, vat: 2.456, gross: filters.type === 'IN' ? 100.126 : filters.type === 'OUT' ? 40.124 : 60.002 },
    classificationProfile: 'GENERAL', primaryClassificationLabel: 'Kategorie',
    byType: [{ key: 'IN', net: 10.124, vat: 2.456, gross: 12.58 }],
    byPrimaryClassification: [{ key: 'Operations', color: '#123456', gross: 60.002 }],
    bySphere: [{ key: 'IDEELL', gross: 999 }],
    byPaymentAccount: [{ accountId: 1, key: 'Bank', kind: 'BANK', gross: 60.002 }]
  } as ReturnType<typeof summarizeVouchers>))
  jest.mocked(listVouchersAdvanced).mockReturnValue([{ id: 10, grossAmount: 1.234, tags: null }] as ReturnType<typeof listVouchersAdvanced>)
  jest.mocked(summarizeInvoices).mockImplementation((filters = {}) => ({
    count: filters.status === 'OPEN' ? 1 : 2, gross: 10.124, paid: 2, remaining: 8.124, grossIn: 10.124, grossOut: 0,
    remainingIn: 8.124, remainingOut: 0, overdueAmount: 0, overdueCount: 0
  }))
  jest.mocked(listInvoicesPaged).mockReturnValue({ total: 1, rows: [{ id: 20, grossAmount: 1.234, paidSum: 0, tags: null }] } as ReturnType<typeof listInvoicesPaged>)
  jest.mocked(listRecurringBookings).mockReturnValue([{ id: 30, amount: 1.234, variableAmount: true }] as ReturnType<typeof listRecurringBookings>)
  jest.mocked(recurringBookingsSummary).mockReturnValue({ due: 1, active: 1, paused: 0, upcoming: 0 })
  jest.mocked(monthlyVouchers).mockReturnValue([])
  jest.mocked(cashBalance).mockReturnValue({ BAR: 42, BANK: 0, accounts: [] })
})

afterEach(() => jest.useRealTimers())

describe('AI context master data', () => {
  it.each([buildAiInvoiceContext, buildAiContext])('projects safe, identical DTO fields in %p', (build) => {
    const context = build()
    expect(context.generatedAt).toBe(today)
    expect(context.paymentAccounts).toEqual([
      { id: 1, name: 'Bank', kind: 'BANK', ibanLast4: '3000', color: '#abc', sortOrder: 2, isActive: 1 },
      { id: 2, name: 'Cash', kind: 'CASH', ibanLast4: null, color: undefined, sortOrder: 3, isActive: 1 }
    ])
    expect(context.primaryClassifications).toEqual([{ id: 8, name: 'Operations', stableKey: 'ops', color: '#123456', icon: 'briefcase', isActive: true }])
    expect(context.budgets?.slice(0, 5).map(row => row.label)).toEqual(['Explicit', 'Named', '2026 - Category', '2026 - Project', 'Budget #5'])
    expect(context.budgets?.[0]).toEqual({ id: 1, label: 'Explicit', year: 2026, sphere: 'IDEELL', categoryName: 'Category', projectName: 'Project', amountPlanned: 250, isArchived: 0 })
    expect(context.earmarks?.[0]).toEqual({ id: 1, code: 'ON', name: 'Active', isActive: 1 })
    expect(context.tags?.slice(0, 2)).toEqual([{ id: 0, name: 'Tag 0', color: '#def', usage: 0 }, { id: 1, name: 'Tag 1', color: '#def', usage: 1 }])
    expect(context.parties?.[0]).toEqual({ id: 1, name: 'Supplier', legalName: 'Supplier Ltd', role: 'SUPPLIER', city: 'Berlin', email: 'supplier@example.org', ibanLast4: '7890', vatId: 'DE123', isActive: 1 })
    expect(context.parties?.[1].ibanLast4).toBeNull()
    expect(JSON.stringify(context)).not.toContain(accountIban)
    expect(JSON.stringify(context)).not.toContain(partyIban)
    expect(JSON.stringify(context)).not.toContain('Private mandate')
    expect(listPaymentAccounts).toHaveBeenCalledWith({ activeOnly: true })
    expect(listBudgets).toHaveBeenCalledWith({ includeArchived: true })
    expect(listTags).toHaveBeenCalledWith({ includeUsage: true })
    expect(listParties).toHaveBeenCalledWith({ activeOnly: true, limit: 500 })
    expect(getOrganizationProfileDefinition).toHaveBeenCalledTimes(1)
    expect(getOrganizationProfile).not.toHaveBeenCalled()
  })

  it('keeps invoice-only filters, tag limit and knowledge-rule scope', () => {
    const context = buildAiInvoiceContext()
    expect(context.budgets?.map(row => row.id)).toEqual([1, 2, 3, 4, 5])
    expect(context.earmarks?.map(row => row.id)).toEqual([1, 3])
    expect(context.tags).toHaveLength(120)
    expect(context.tags?.[119].id).toBe(119)
    expect(listBindings).toHaveBeenCalledWith({ activeOnly: true })
    expect(listAiKnowledgeRules).toHaveBeenCalledWith({ enabledOnly: true, scope: 'INVOICES' })
    expect(context.aiRules?.map(rule => rule.scope)).toEqual(['ALL', 'INVOICES'])
    for (const section of ['members', 'reports', 'invoices', 'recurringBookings']) expect(context).not.toHaveProperty(section)
    for (const query of [listMembers, listVoucherYears, summarizeVouchers, listVouchersAdvanced, summarizeInvoices, listInvoicesPaged, listRecurringBookings]) expect(query).not.toHaveBeenCalled()
  })

  it('keeps archived budgets, inactive earmarks, all tags and all rule scopes in the full context', () => {
    const context = buildAiContext()
    expect(context.budgets).toHaveLength(6)
    expect(context.budgets?.[5].isArchived).toBe(1)
    expect(context.earmarks?.map(row => row.id)).toEqual([1, 2, 3])
    expect(context.tags).toHaveLength(122)
    expect(listBindings).toHaveBeenCalledWith({})
    expect(listAiKnowledgeRules).toHaveBeenCalledWith({ enabledOnly: true })
    expect(context.aiRules).toEqual(rules)
  })
})

describe('AI context organization sources', () => {
  it('prefers the setting for invoices and the active organization for the full context', () => {
    expect(buildAiInvoiceContext().organization).toEqual({ name: 'Configured organisation', profile: 'GENERAL', primaryClassificationLabel: 'Kategorie' })
    expect(getActiveOrganization).not.toHaveBeenCalled()
    jest.mocked(getSetting).mockClear()
    expect(buildAiContext().organization).toEqual({ name: 'Active organisation', activeName: 'Active organisation', profile: 'GENERAL', primaryClassificationLabel: 'Kategorie' })
    expect(getSetting).not.toHaveBeenCalled()
  })

  it('falls back to active organization for invoices when the setting is empty', () => {
    jest.mocked(getSetting).mockReturnValue('')
    expect(buildAiInvoiceContext().organization?.name).toBe('Active organisation')
    jest.mocked(getActiveOrganization).mockReturnValue(null)
    expect(buildAiInvoiceContext().organization?.name).toBeNull()
  })

  it('preserves the legacy displayName fallback and absent organization on lookup failure', () => {
    jest.mocked(getActiveOrganization).mockReturnValue({ displayName: 'Legacy name' } as unknown as ReturnType<typeof getActiveOrganization>)
    expect(buildAiContext().organization).toMatchObject({ name: 'Legacy name', activeName: 'Legacy name' })
    jest.mocked(getActiveOrganization).mockImplementation(() => { throw new Error('No active database') })
    expect(buildAiContext().organization).toBeUndefined()
  })
})

describe('AI full-context reports and limits', () => {
  it('reuses current-year summaries while preserving all distinct query filters and payloads', () => {
    const context = buildAiContext()
    expect(summarizeVouchers).toHaveBeenCalledTimes(7)
    for (const filter of [currentRange, { ...currentRange, type: 'IN' }, { ...currentRange, type: 'OUT' }]) {
      expect(jest.mocked(summarizeVouchers).mock.calls.filter(([actual]) => JSON.stringify(actual) === JSON.stringify(filter))).toHaveLength(1)
    }
    expect(summarizeVouchers).toHaveBeenCalledWith({ includeInternalVouchers: true })
    expect(context.reports.currentYearToDate).toEqual({
      totals: { net: 10.12, vat: 2.46, gross: 60 }, byType: [{ type: 'IN', net: 10.12, vat: 2.46, gross: 12.58 }],
      primaryClassificationLabel: 'Kategorie', byPrimaryClassification: [{ name: 'Operations', color: '#123456', gross: 60 }],
      byPaymentAccount: [{ accountId: 1, name: 'Bank', kind: 'BANK', gross: 60 }]
    })
    expect(context.reports.yearly[0]).toEqual({ year: 2026, range: currentRange, summary: context.reports.currentYearToDate, incomeGross: 100.13, expenseGross: 40.12 })
    expect(context.reports.currentYearIncomeGross).toBe(100.13)
    expect(context.reports.currentYearExpenseGross).toBe(40.12)
    expect(listVouchersAdvanced).toHaveBeenNthCalledWith(1, { limit: 500, sort: 'DESC' })
    expect(listVouchersAdvanced).toHaveBeenNthCalledWith(2, { ...currentRange, limit: 1000, sort: 'DESC' })
    expect(context.reports.latestVouchers[0]).toMatchObject({ id: 10, grossAmount: 1.23, tags: [], primaryClassificationValueId: null, primaryClassificationName: null })
    expect(monthlyVouchers).toHaveBeenCalledTimes(3)
    expect(monthlyVouchers).toHaveBeenCalledWith(currentRange)
    expect(monthlyVouchers).toHaveBeenCalledWith({ ...currentRange, type: 'IN' })
    expect(monthlyVouchers).toHaveBeenCalledWith({ ...currentRange, type: 'OUT' })
    expect(cashBalance).toHaveBeenCalledWith({ to: today })
    expect(listMembers).toHaveBeenCalledWith({ status: 'ALL', limit: 2000, sortBy: 'name', sort: 'ASC' })
    expect(context.members).toMatchObject({ total: 1, byStatus: { ACTIVE: 1 }, rows: [{ hasIban: true, hasMandate: true, contributionAmount: 12, contributionInterval: 'MONTHLY' }] })
    expect(summarizeInvoices).toHaveBeenCalledTimes(2)
    expect(summarizeInvoices).toHaveBeenCalledWith({})
    expect(summarizeInvoices).toHaveBeenCalledWith({ status: 'OPEN' })
    expect(listInvoicesPaged).toHaveBeenCalledWith({ status: 'OPEN', limit: 200, sortBy: 'due', sort: 'ASC' })
    expect(context.invoices).toMatchObject({ summary: { count: 2, gross: 10.12 }, openSummary: { count: 1, gross: 10.12 }, openRows: [{ id: 20, grossAmount: 1.23, tags: [] }] })
    expect(context.recurringBookings.rows).toEqual([expect.objectContaining({ id: 30, amount: 1.23, variableAmount: true })])
  })

  it('preserves descending unique years, the eight-year limit and historical/future end dates', () => {
    jest.mocked(listVoucherYears).mockReturnValue([2027, 2026, 2025, 2025, 2024, 2023, 2022, 2021, 2020, 2019, Number.NaN])
    const context = buildAiContext()
    expect(context.reports.yearly.map((row: { year: number }) => row.year)).toEqual([2027, 2026, 2025, 2024, 2023, 2022, 2021, 2020])
    expect(context.reports.yearly[0].range).toEqual({ from: '2027-01-01', to: '2027-12-31' })
    expect(context.reports.yearly[1].range).toEqual(currentRange)
    expect(context.reports.yearly[2].range).toEqual({ from: '2025-01-01', to: '2025-12-31' })
    expect(summarizeVouchers).toHaveBeenCalledTimes(25)
  })

  it('retains nonprofit sphere summaries and profile labels', () => {
    jest.mocked(getOrganizationProfileDefinition).mockReturnValue(ORGANIZATION_PROFILE_DEFINITIONS.NONPROFIT)
    const generalSummary = summarizeVouchers({})
    jest.mocked(summarizeVouchers).mockReturnValue({ ...generalSummary, classificationProfile: 'NONPROFIT', primaryClassificationLabel: '' })
    const context = buildAiContext()
    expect(context.organization).toMatchObject({ profile: 'NONPROFIT', primaryClassificationLabel: 'Sphäre' })
    expect(context.reports.currentYearToDate.primaryClassificationLabel).toBe('Sphäre')
    expect(context.reports.currentYearToDate.byPrimaryClassification).toEqual([{ name: 'IDEELL', color: null, gross: 999 }])
  })
})
