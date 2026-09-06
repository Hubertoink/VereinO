import type { TTagsListOutput, TVouchersListOutput } from '../../../../electron/main/ipc/schemas'
import { normalizeLookup } from './aiText'
import type { parseReportExportRequest } from './aiPromptIntents'
import type { VoucherRow } from './aiViewTypes'

type ReportRequest = ReturnType<typeof parseReportExportRequest>

type ContributionData = {
  openContributions: unknown[]
  summary: { openAmount: number }
}

export async function loadReportVouchers(from: string, to: string): Promise<VoucherRow[]> {
  const rows: VoucherRow[] = []
  let offset = 0
  const limit = 100
  while (true) {
    const result = await window.api.vouchers.list({
      from,
      to,
      limit,
      offset,
      sortBy: 'date',
      sort: 'ASC'
    })
    rows.push(...(result.rows || []))
    if ((result.rows || []).length < limit) break
    offset += limit
  }
  return rows
}

export async function buildReportKpiData(
  request: ReportRequest,
  filePath: string,
  loadTags: () => Promise<TTagsListOutput['rows']>,
  buildContributionDueData: () => Promise<ContributionData>
) {
  const [summary, monthly, cashBalance, vouchers, tags, contributionData] = await Promise.all([
    window.api.reports.summary({ from: request.payload.from, to: request.payload.to }),
    window.api.reports.monthly({ from: request.payload.from, to: request.payload.to }),
    window.api.reports.cashBalance({ to: request.payload.to }),
    loadReportVouchers(request.payload.from, request.payload.to),
    loadTags(),
    buildContributionDueData()
  ])

  const incomeGross = Number(summary.byType.find((row) => row.key === 'IN')?.gross || 0)
  const expenseGross = Math.abs(Number(summary.byType.find((row) => row.key === 'OUT')?.gross || 0))
  const resultGross = incomeGross - expenseGross
  const donationGross = vouchers
    .filter((voucher) => voucher.type === 'IN')
    .filter(
      (voucher) =>
        (voucher.tags || []).some((tag) => /spende/i.test(tag)) ||
        /spende|zuwendung|donation/i.test(voucher.description || '')
    )
    .reduce((sum, voucher) => sum + Math.abs(Number(voucher.grossAmount || 0)), 0)

  const expenseTagTotals = new Map<string, { tag: string; gross: number; count: number }>()
  vouchers
    .filter((voucher) => voucher.type === 'OUT')
    .forEach((voucher) => {
      const voucherTags = (voucher.tags || []).length ? voucher.tags || [] : ['Ohne Tag']
      voucherTags.forEach((tag) => {
        const current = expenseTagTotals.get(normalizeLookup(tag)) || { tag, gross: 0, count: 0 }
        current.gross += Math.abs(Number(voucher.grossAmount || 0))
        current.count += 1
        expenseTagTotals.set(normalizeLookup(tag), current)
      })
    })

  return {
    export: { filePath, label: request.label, payload: request.payload },
    period: { from: request.payload.from, to: request.payload.to },
    kpis: {
      incomeGross,
      expenseGross,
      resultGross,
      donationGross,
      donationShareOfIncome: incomeGross ? donationGross / incomeGross : null,
      voucherCount: vouchers.length,
      openContributionCount: contributionData.openContributions.length,
      openContributionAmount: contributionData.summary.openAmount
    },
    summary,
    monthly,
    cashBalance,
    paymentAccountBalances: cashBalance.accounts || summary.byPaymentAccount || [],
    topExpenseTags: Array.from(expenseTagTotals.values())
      .sort((a, b) => b.gross - a.gross)
      .slice(0, 5),
    openContributions: contributionData.openContributions,
    tags,
    sampleVouchers: vouchers.slice(0, 80)
  }
}
