import path from 'node:path'

jest.mock('../../electron/main/services/reportPdf', () => ({ writeReportPdf: jest.fn() }))
jest.mock('../../electron/main/services/exportPaths', () => ({ createExportPath: jest.fn(), createExportStamp: jest.fn() }))
jest.mock('../../electron/main/services/settings', () => ({ getSetting: jest.fn() }))
jest.mock('../../electron/main/repositories/vouchers', () => ({
  summarizeVouchers: jest.fn(), listVouchersAdvanced: jest.fn(), cashBalance: jest.fn()
}))
jest.mock('../../electron/main/repositories/bindings', () => ({ listBindings: jest.fn(), bindingUsage: jest.fn() }))
jest.mock('../../electron/main/repositories/budgets', () => ({ listBudgets: jest.fn(), budgetUsage: jest.fn() }))
jest.mock('../../electron/main/repositories/activityReports', () => ({ getActivityReport: jest.fn(), validateActivityReport: jest.fn() }))
jest.mock('../../electron/main/repositories/members', () => ({ listMembers: jest.fn() }))
jest.mock('../../electron/main/repositories/cashChecks', () => ({ listCashChecks: jest.fn() }))
jest.mock('../../electron/main/repositories/invoices', () => ({ summarizeInvoices: jest.fn() }))

import { generateFiscalReportPDF } from '../../electron/main/services/fiscalReport'
import { generateTreasurerReportPDF } from '../../electron/main/services/treasurerReport'
import { writeReportPdf } from '../../electron/main/services/reportPdf'
import { createExportPath, createExportStamp } from '../../electron/main/services/exportPaths'
import { getSetting } from '../../electron/main/services/settings'
import { cashBalance, listVouchersAdvanced, summarizeVouchers } from '../../electron/main/repositories/vouchers'
import { listCashChecks } from '../../electron/main/repositories/cashChecks'

const period = { from: '2026-01-01', to: '2026-12-31' }
const options = {
  fiscalYear: 2026, ...period, cashBalanceDate: '2026-12-31',
  includeMembers: false, includeInvoices: false, includeBindings: false,
  includeBudgets: false, includeVoucherList: true
}
const voucher = {
  date: '2026-02-01', voucherNo: '2026-001', type: 'OUT', sphere: 'IDEELL',
  description: ' <Material> & "Verein" ', grossAmount: 25,
  paymentMethod: 'BANK', paymentAccountName: 'Konto & Verein', tags: ['Projekt & Team'],
  originalId: 5, originalVoucherNo: '2025-<005>'
}
const reportHtml = () => {
  const calls = jest.mocked(writeReportPdf).mock.calls
  return calls[calls.length - 1][0].html
}
const compactHtml = () => reportHtml().replace(/\s+/g, ' ')

beforeEach(() => {
  jest.resetAllMocks()
  jest.mocked(writeReportPdf).mockResolvedValue(undefined)
  jest.mocked(createExportStamp).mockReturnValue('fixed-stamp')
  jest.mocked(createExportPath).mockImplementation(name => path.join('mock-exports', name))
  const settings: Record<string, string> = {
    'org.name': 'Verein <Test> & Co', 'org.cashier': 'Anna & Bea',
    'org.logoDataUrl': 'data:image/png;base64,test'
  }
  jest.mocked(getSetting).mockImplementation(key => settings[key])
  jest.mocked(cashBalance).mockReturnValue({
    BAR: 100, BANK: 200,
    accounts: [{ name: 'Kasse', kind: 'CASH', balance: 200 }, { name: 'Konto & Verein', kind: 'BANK', balance: 500 }]
  } as ReturnType<typeof cashBalance>)
  jest.mocked(summarizeVouchers).mockImplementation(filters => ({
    byType: !filters?.sphere || filters.sphere === 'IDEELL'
      ? [{ key: 'IN', gross: 1200, net: 1000, vat: 200 }, { key: 'OUT', gross: -450, net: -400, vat: -50 }]
      : []
  }) as ReturnType<typeof summarizeVouchers>)
  jest.mocked(listVouchersAdvanced).mockReturnValue([
    { ...voucher },
    { ...voucher, voucherNo: '2026-002', originalId: null, description: ' ', reversedById: 9, reversedByVoucherNo: '2026-"009"' },
    { ...voucher, type: 'INTERNAL', description: 'interne Zuordnung', tags: ['Nur intern'] }
  ])
  jest.mocked(listCashChecks).mockReturnValue({ rows: [] } as unknown as ReturnType<typeof listCashChecks>)
})

describe.each([
  { name: 'fiscal', generate: generateFiscalReportPDF, filename: 'Finanzamt' },
  { name: 'treasurer', generate: generateTreasurerReportPDF, filename: 'Kassierbericht' }
])('$name annual PDF payload', ({ generate, filename }) => {
  it('preserves export path, print layout, escaped voucher statuses and year filters', async () => {
    const filePath = path.join('mock-exports', `${filename}_2026_fixed-stamp.pdf`)
    await expect(generate(options)).resolves.toEqual({ filePath })
    expect(createExportPath).toHaveBeenCalledWith(`${filename}_2026_fixed-stamp.pdf`)
    expect(writeReportPdf).toHaveBeenCalledTimes(1)
    expect(writeReportPdf).toHaveBeenCalledWith({
      html: expect.any(String), filePath,
      windowOptions: { height: 10000, webPreferences: { offscreen: true } },
      printOptions: { margins: { top: 0, bottom: 0, left: 0, right: 0 } }
    })
    expect(summarizeVouchers).toHaveBeenCalledTimes(5)
    expect(summarizeVouchers).toHaveBeenCalledWith({ ...period, includeInternalVouchers: false })
    for (const sphere of ['IDEELL', 'ZWECK', 'VERMOEGEN', 'WGB']) {
      expect(summarizeVouchers).toHaveBeenCalledWith({ ...period, sphere, includeInternalVouchers: false })
    }
    expect(listVouchersAdvanced).toHaveBeenCalledWith({ ...period, limit: 100000, sort: 'ASC' })
    const html = reportHtml()
    expect(html).toContain('Verein &lt;Test&gt; &amp; Co')
    expect(html).toContain('src="data:image/png;base64,test"')
    expect(html).toContain('&lt;Material&gt; &amp; &quot;Verein&quot;<div class="voucher-status voucher-status-storno">Stornobuchung zu #2025-&lt;005&gt;</div>')
    expect(html).toContain('—<div class="voucher-status voucher-status-storniert">Storniert durch #2026-&quot;009&quot;</div>')
    expect(html).toContain('<tr class="voucher-row-storno">')
    expect(html).toContain('<tr class="voucher-row-storniert">')
    expect(html).not.toContain('interne Zuordnung')
    expect(html).toContain('<div class="page-break"></div>')
    expect(html).toContain('break-inside: avoid')
    expect(html).not.toMatch(/NaN|Infinity/)
  })

  it('keeps internal vouchers when explicitly requested and propagates rendering failure', async () => {
    jest.mocked(writeReportPdf).mockRejectedValueOnce(new Error('print failed'))
    await expect(generate({ ...options, includeInternalVouchers: true })).rejects.toThrow('print failed')
    expect(reportHtml()).toContain('interne Zuordnung')
    expect(summarizeVouchers).toHaveBeenCalledWith({ ...period, includeInternalVouchers: true })
  })
})

it('fiscal PDF keeps opening/year/closing balances and dated section labels', async () => {
  await generateFiscalReportPDF(options)
  expect(cashBalance).toHaveBeenCalledWith({ to: '2025-12-31' })
  const html = compactHtml()
  expect(html).toContain('Wirtschaftsjahr: 2026 (2026-01-01 bis 2026-12-31)')
  expect(html).toContain('Anfangsbestand (01.01.2026):</span> <span class="summary-value">300,00 €')
  expect(html).toContain('Einnahmen gesamt (Brutto):</span> <span class="summary-value positive">+ 1.200,00 €')
  expect(html).toContain('Ausgaben gesamt (Brutto):</span> <span class="summary-value negative">− 450,00 €')
  expect(html).toContain('Endbestand (31.12.2026):</span> <span class="summary-value positive">1.050,00 €')
  expect(html).toContain('Insgesamt 2 Beleg(e)')
})

it('treasurer PDF keeps account totals, cash cutoff, annual KPIs and optional tag columns', async () => {
  await generateTreasurerReportPDF({ ...options, includeTags: true })
  expect(cashBalance).toHaveBeenCalledWith({ to: '2026-12-31' })
  const html = compactHtml()
  expect(html).toContain('Berichtszeitraum: 01.01.2026 – 31.12.2026 (Geschäftsjahr 2026)')
  expect(html).toContain('Kassenstand zum Stichtag: 31.12.2026')
  expect(html).toContain('Kassier: Anna &amp; Bea')
  expect(html).toContain('Gesamt</div> <div class="kpi-value kpi-big positive">700,00 €')
  expect(html).toContain('Einnahmen</div> <div class="kpi-value positive">1.200,00 €')
  expect(html).toContain('Ausgaben</div> <div class="kpi-value negative">450,00 €')
  expect(html).toContain('Saldo</div> <div class="kpi-value kpi-big positive">750,00 €')
  expect(html).toContain('@page { margin: 14mm 12mm; }')
  expect(html).toContain('2 Buchung(en), sortiert aufsteigend nach Datum')
  expect(html).toContain('<th>Tags</th>')
  expect(html).toContain('<td>Projekt &amp; Team</td>')
  expect(html).toContain('Konto &amp; Verein')
})

describe('treasurer request-local voucher reuse', () => {
  const tagged = { ...options, includeTagSummary: true }

  it.each([{}, { voucherListFrom: period.from, voucherListTo: period.to, voucherListSort: 'ASC' as const }])(
    'loads identical tag/list requests once and preserves both sections (%j)', async overrides => {
      await generateTreasurerReportPDF({ ...tagged, ...overrides })
      expect(listVouchersAdvanced).toHaveBeenCalledTimes(1)
      expect(reportHtml()).toContain('Auswertung nach Tags (2026)')
      expect(reportHtml()).toContain('Anhang: Einzelbuchungen')
      expect(reportHtml()).not.toContain('Nur intern')
      expect(compactHtml()).toContain('🏷️ Projekt &amp; Team</td> <td class="number positive">0,00 €</td> <td class="number negative">50,00 €')
    }
  )

  it.each([
    { voucherListFrom: '2026-02-01' }, { voucherListTo: '2026-11-30' }, { voucherListSort: 'DESC' as const }
  ])('keeps a separate query for different period or ordering (%j)', async overrides => {
    jest.mocked(listVouchersAdvanced).mockReturnValueOnce([{ ...voucher, tags: ['Nur Tags'] }])
      .mockReturnValueOnce([{ ...voucher, description: 'Nur Belegliste', tags: ['Nur Belege'] }])
    await generateTreasurerReportPDF({ ...tagged, ...overrides })
    expect(jest.mocked(listVouchersAdvanced).mock.calls).toEqual([
      [{ ...period, limit: 100000, sort: 'ASC' }],
      [{ from: overrides.voucherListFrom || period.from, to: overrides.voucherListTo || period.to,
        limit: 100000, sort: overrides.voucherListSort || 'ASC' }]
    ])
    expect(reportHtml()).toContain('🏷️ Nur Tags')
    expect(reportHtml()).toContain('Nur Belegliste')
    expect(reportHtml()).not.toContain('🏷️ Nur Belege')
  })

  it('reuses empty results but never shares data between exports', async () => {
    jest.mocked(listVouchersAdvanced).mockReturnValueOnce([])
    await generateTreasurerReportPDF(tagged)
    expect(listVouchersAdvanced).toHaveBeenCalledTimes(1)
    expect(reportHtml()).not.toContain('Anhang: Einzelbuchungen')
    await generateTreasurerReportPDF(tagged)
    expect(listVouchersAdvanced).toHaveBeenCalledTimes(2)
    expect(reportHtml()).toContain('Anhang: Einzelbuchungen')
  })

  it('still retries the mandatory voucher query after the optional tag query fails', async () => {
    jest.mocked(listVouchersAdvanced).mockImplementationOnce(() => { throw new Error('tag query failed') })
    await generateTreasurerReportPDF(tagged)
    expect(listVouchersAdvanced).toHaveBeenCalledTimes(2)
    expect(reportHtml()).not.toContain('Auswertung nach Tags (2026)')
    expect(reportHtml()).toContain('Anhang: Einzelbuchungen')
  })
})
