import { getActiveOrganization } from '../db/database'
import { listBindings } from '../repositories/bindings'
import { listBudgets } from '../repositories/budgets'
import { listInvoicesPaged, summarizeInvoices } from '../repositories/invoices'
import { listMembers } from '../repositories/members'
import * as mp from '../repositories/members_payments'
import { listPaymentAccounts } from '../repositories/paymentAccounts'
import { listTags } from '../repositories/tags'
import {
  cashBalance,
  listVoucherYears,
  listVouchersAdvanced,
  monthlyVouchers,
  summarizeVouchers
} from '../repositories/vouchers'
import type { AiContext } from './ai'

function budgetLabelForAi(budget: any) {
  if (budget.label) return budget.label
  if (budget.name) return budget.name
  if (budget.categoryName) return `${budget.year} - ${budget.categoryName}`
  if (budget.projectName) return `${budget.year} - ${budget.projectName}`
  return `Budget #${budget.id}`
}

function roundMoney(value: unknown) {
  return Math.round(Number(value || 0) * 100) / 100
}

function dateRangeForYear(year: number, today: string) {
  return {
    from: `${year}-01-01`,
    to: year === Number(today.slice(0, 4)) ? today : `${year}-12-31`
  }
}

function compactReportSummary(filters: any = {}) {
  const summary = summarizeVouchers(filters)
  return {
    totals: {
      net: roundMoney(summary.totals?.net),
      vat: roundMoney(summary.totals?.vat),
      gross: roundMoney(summary.totals?.gross)
    },
    byType: (summary.byType || []).map((row: any) => ({
      type: row.key,
      net: roundMoney(row.net),
      vat: roundMoney(row.vat),
      gross: roundMoney(row.gross)
    })),
    bySphere: (summary.bySphere || []).map((row: any) => ({
      sphere: row.key,
      gross: roundMoney(row.gross)
    })),
    byPaymentAccount: (summary.byPaymentAccount || []).map((row: any) => ({
      accountId: row.accountId,
      name: row.key,
      kind: row.kind,
      gross: roundMoney(row.gross)
    }))
  }
}

function compactVoucherForAi(row: any) {
  return {
    id: row.id,
    voucherNo: row.voucherNo,
    date: row.date,
    type: row.type,
    sphere: row.sphere,
    description: row.description,
    counterparty: row.counterparty,
    grossAmount: roundMoney(row.grossAmount),
    paymentMethod: row.paymentMethod,
    paymentAccountId: row.paymentAccountId,
    paymentAccountName: row.paymentAccountName,
    budgetId: row.budgetId,
    budgetLabel: row.budgetLabel,
    earmarkId: row.earmarkId,
    earmarkCode: row.earmarkCode,
    tags: row.tags || []
  }
}

export function buildAiContext(): AiContext {
  const today = new Date().toISOString().slice(0, 10)
  const currentYear = Number(today.slice(0, 4))
  const organization = (() => {
    try {
      const active = getActiveOrganization() as any
      return {
        name: active?.name ?? active?.displayName ?? null,
        activeName: active?.name ?? active?.displayName ?? null
      }
    } catch {
      return undefined
    }
  })()
  const paymentAccounts = listPaymentAccounts({ activeOnly: true } as any) || []
  const budgets = listBudgets({ includeArchived: true } as any) || []
  const earmarks = listBindings({} as any) || []
  const tags = listTags({ includeUsage: true } as any) || []
  const members = listMembers({ status: 'ALL', limit: 2000, sortBy: 'name', sort: 'ASC' } as any)
  const memberStatusCounts = members.rows.reduce<Record<string, number>>((acc, member: any) => {
    acc[member.status] = (acc[member.status] || 0) + 1
    return acc
  }, {})
  const years = Array.from(new Set([currentYear, ...listVoucherYears()]))
    .filter((year) => Number.isFinite(Number(year)))
    .map(Number)
    .sort((a, b) => b - a)
    .slice(0, 8)
  const currentRange = dateRangeForYear(currentYear, today)
  const currentYearIncome = summarizeVouchers({ ...currentRange, type: 'IN' } as any).totals
  const currentYearExpenses = summarizeVouchers({ ...currentRange, type: 'OUT' } as any).totals
  const latestVouchers = listVouchersAdvanced({ limit: 500, sort: 'DESC' } as any).map(
    compactVoucherForAi
  )
  const currentYearVouchers = listVouchersAdvanced({
    ...currentRange,
    limit: 1000,
    sort: 'DESC'
  } as any).map(compactVoucherForAi)
  const invoiceSummary = summarizeInvoices({} as any)
  const openInvoiceSummary = summarizeInvoices({ status: 'OPEN' } as any)
  const openInvoices = listInvoicesPaged({
    status: 'OPEN',
    limit: 200,
    sortBy: 'due',
    sort: 'ASC'
  } as any).rows.map((invoice: any) => ({
    id: invoice.id,
    invoiceNo: invoice.invoiceNo,
    date: invoice.date,
    dueDate: invoice.dueDate,
    party: invoice.party,
    description: invoice.description,
    grossAmount: roundMoney(invoice.grossAmount),
    paidSum: roundMoney(invoice.paidSum),
    status: invoice.status,
    voucherType: invoice.voucherType,
    sphere: invoice.sphere,
    budgetId: invoice.budgetId,
    tags: invoice.tags || []
  }))
  return {
    organization,
    generatedAt: today,
    paymentAccounts: paymentAccounts.map((account: any) => ({
      id: account.id,
      name: account.name,
      kind: account.kind,
      ibanLast4: account.iban ? String(account.iban).replace(/\s+/g, '').slice(-4) : null,
      color: account.color,
      sortOrder: account.sortOrder,
      isActive: account.isActive
    })),
    budgets: budgets.map((budget: any) => ({
      id: budget.id,
      label: budgetLabelForAi(budget),
      year: budget.year,
      sphere: budget.sphere,
      categoryName: budget.categoryName,
      projectName: budget.projectName,
      amountPlanned: budget.amountPlanned,
      isArchived: budget.isArchived
    })),
    earmarks: earmarks.map((earmark: any) => ({
      id: earmark.id,
      code: earmark.code,
      name: earmark.name,
      isActive: earmark.isActive
    })),
    tags: tags.map((tag: any) => ({
      id: tag.id,
      name: tag.name,
      color: tag.color,
      usage: Number(tag.usage || 0)
    })),
    members: {
      total: members.total,
      byStatus: memberStatusCounts,
      contributionDue: mp.dueSummary(),
      rows: members.rows.map((member: any) => ({
        id: member.id,
        memberNo: member.memberNo,
        name: member.name,
        email: member.email,
        phone: member.phone,
        status: member.status,
        boardRole: member.boardRole,
        tags: member.tags || [],
        contributionAmount: member.contribution_amount,
        contributionInterval: member.contribution_interval,
        joinDate: member.join_date,
        leaveDate: member.leave_date,
        nextDueDate: member.next_due_date,
        notes: member.notes,
        hasIban: !!member.iban,
        hasMandate: !!member.mandate_ref
      }))
    },
    reports: {
      currentDate: today,
      currentYear,
      allTime: compactReportSummary({ includeInternalVouchers: true }),
      currentYearToDate: compactReportSummary(currentRange),
      currentYearIncomeGross: roundMoney(currentYearIncome?.gross),
      currentYearExpenseGross: roundMoney(currentYearExpenses?.gross),
      cashBalance: cashBalance({ to: today } as any),
      monthlyCurrentYearNet: monthlyVouchers(currentRange as any),
      monthlyCurrentYearIncome: monthlyVouchers({ ...currentRange, type: 'IN' } as any),
      monthlyCurrentYearExpenses: monthlyVouchers({ ...currentRange, type: 'OUT' } as any),
      yearly: years.map((year) => {
        const range = dateRangeForYear(year, today)
        const income = summarizeVouchers({ ...range, type: 'IN' } as any).totals
        const expenses = summarizeVouchers({ ...range, type: 'OUT' } as any).totals
        return {
          year,
          range,
          summary: compactReportSummary(range),
          incomeGross: roundMoney(income?.gross),
          expenseGross: roundMoney(expenses?.gross)
        }
      }),
      latestVouchers,
      currentYearVouchers
    },
    invoices: {
      summary: {
        count: invoiceSummary.count,
        gross: roundMoney(invoiceSummary.gross),
        paid: roundMoney(invoiceSummary.paid),
        remaining: roundMoney(invoiceSummary.remaining),
        grossIn: roundMoney(invoiceSummary.grossIn),
        grossOut: roundMoney(invoiceSummary.grossOut)
      },
      openSummary: {
        count: openInvoiceSummary.count,
        gross: roundMoney(openInvoiceSummary.gross),
        paid: roundMoney(openInvoiceSummary.paid),
        remaining: roundMoney(openInvoiceSummary.remaining),
        grossIn: roundMoney(openInvoiceSummary.grossIn),
        grossOut: roundMoney(openInvoiceSummary.grossOut)
      },
      openRows: openInvoices
    }
  }
}
