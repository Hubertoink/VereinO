import path from 'node:path'
import fsp from 'node:fs/promises'
import { BrowserWindow } from 'electron'

jest.mock('electron', () => ({ BrowserWindow: jest.fn() }))
jest.mock('node:fs/promises', () => ({ writeFile: jest.fn() }))
jest.mock('../../electron/main/repositories/vouchers', () => ({
  listReportVouchers: jest.fn(), listVouchersAdvanced: jest.fn(), summarizeVouchers: jest.fn(), monthlyVouchers: jest.fn()
}))
jest.mock('../../electron/main/services/settings', () => ({ getSetting: jest.fn() }))
jest.mock('../../electron/main/services/exportPaths', () => ({
  createExportStamp: jest.fn(), ensureExportsDir: jest.fn()
}))

import { exportReport } from '../../electron/main/services/reportExport'
import { listReportVouchers, listVouchersAdvanced, monthlyVouchers, summarizeVouchers } from '../../electron/main/repositories/vouchers'
import { getSetting } from '../../electron/main/services/settings'
import { createExportStamp, ensureExportsDir } from '../../electron/main/services/exportPaths'

const exportDir = path.resolve('mock-export-directory')
const period = { from: '2026-01-01', to: '2026-03-31' }
const baseInput = { type: 'JOURNAL', format: 'CSV', ...period }
const voucher = {
  date: '2026-01-15', voucherNo: '2026-001', type: 'OUT', sphere: 'IDEELL',
  description: 'Material; Verein\nZeile\rEnde', paymentMethod: 'BANK',
  netAmount: 10, vatAmount: 1.9, grossAmount: 11.9, tags: ['Projekt', 'Team']
}

describe('report export service', () => {
  const loadURL = jest.fn<Promise<void>, [string]>()
  const printToPDF = jest.fn().mockResolvedValue(Buffer.from('mock-pdf-output'))
  const destroy = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
    loadURL.mockResolvedValue(undefined)
    printToPDF.mockResolvedValue(Buffer.from('mock-pdf-output'))
    jest.mocked(BrowserWindow).mockImplementation(() => ({
      loadURL, webContents: { printToPDF, executeJavaScript: jest.fn().mockResolvedValue(undefined) }, destroy
    }) as unknown as BrowserWindow)
    jest.mocked(fsp.writeFile).mockResolvedValue(undefined)
    jest.mocked(createExportStamp).mockReturnValue('fixed-stamp')
    jest.mocked(ensureExportsDir).mockResolvedValue(exportDir)
    jest.mocked(getSetting).mockImplementation(key => key === 'org.name' ? 'Testverein' : '')
    jest.mocked(listVouchersAdvanced).mockReturnValue([{ ...voucher }])
    jest.mocked(listReportVouchers).mockReturnValue([{ ...voucher }])
    jest.mocked(summarizeVouchers).mockReturnValue({
      bySphere: [{ key: 'IDEELL', gross: 125 }],
      byPaymentMethod: [{ key: 'BANK', gross: 125 }],
      byPaymentAccount: [{ key: 'Vereinskonto', gross: 125, color: '#123456' }]
    } as ReturnType<typeof summarizeVouchers>)
    jest.mocked(monthlyVouchers).mockImplementation(({ type }) => type === 'IN'
      ? [{ month: '2026-01', gross: 100, net: 100, vat: 0 }, { month: '2026-03', gross: -10, net: -10, vat: 0 }]
      : [{ month: '2026-01', gross: -40, net: -40, vat: 0 }, { month: '2026-03', gross: 5, net: 5, vat: 0 }])
  })

  it('exports default CSV columns, sanitized descriptions and positive amounts', async () => {
    const filePath = path.join(exportDir, 'Journal_fixed-stamp.csv')
    await expect(exportReport(baseInput)).resolves.toEqual({ filePath })
    expect(fsp.writeFile).toHaveBeenCalledWith(filePath,
      'Datum;Nr.;Typ;Sphäre;Beschreibung;Status;Zahlweg;Netto;MwSt;Brutto\n' +
      '2026-01-15;2026-001;OUT;IDEELL;Material  Verein Zeile Ende;;Bank;10.00;1.90;11.90', 'utf8')
    expect(listVouchersAdvanced).toHaveBeenCalledWith(expect.objectContaining({
      ...period, limit: 100000, sort: 'DESC', sortBy: 'date'
    }))
    expect(ensureExportsDir).toHaveBeenCalledTimes(1)
    expect(createExportStamp).toHaveBeenCalledTimes(1)
    expect(monthlyVouchers).not.toHaveBeenCalled()
    expect(summarizeVouchers).not.toHaveBeenCalled()
    expect(BrowserWindow).not.toHaveBeenCalled()
  })

  it('preserves requested CSV column order, status, account labels and filters', async () => {
    const filters = { paymentMethod: 'BANK', sphere: 'ZWECK', type: 'OUT', earmarkId: 7, budgetId: 8, q: 'Material', tag: 'Team' }
    jest.mocked(listVouchersAdvanced).mockReturnValue([
      { ...voucher, paymentAccountName: 'Projektkonto', originalId: 5, originalVoucherNo: '2025-005' },
      { ...voucher, type: 'TRANSFER', transferFromAccountName: 'Projektkonto', transferTo: 'BAR', reversedById: 9 }
    ])
    const filePath = path.join(exportDir, 'Report_SPHERE_SUMMARY_fixed-stamp.csv')
    await expect(exportReport({ ...baseInput, type: 'SPHERE_SUMMARY', filters,
      sort: 'ASC', sortBy: 'gross', amountMode: 'OUT_NEGATIVE',
      fields: ['tags', 'status', 'paymentMethod', 'grossAmount', 'netAmount', 'vatAmount']
    })).resolves.toEqual({ filePath })
    expect(listVouchersAdvanced).toHaveBeenCalledTimes(1)
    expect(listVouchersAdvanced).toHaveBeenCalledWith({ ...period, ...filters, limit: 100000, sort: 'ASC', sortBy: 'gross' })
    expect(fsp.writeFile).toHaveBeenCalledWith(filePath,
      'Tags;Status;Zahlweg;Brutto;Netto;MwSt\n' +
      'Projekt, Team;Stornobuchung zu #2025-005;Projektkonto;-11.90;-10.00;-1.90\n' +
      'Projekt, Team;Storniert durch #9;Projektkonto -> Bar;11.90;10.00;1.90', 'utf8')
  })

  it('writes a header-only CSV for no results and falls back from empty field selection', async () => {
    jest.mocked(listVouchersAdvanced).mockReturnValue([])
    await exportReport({ ...baseInput, fields: [] })
    expect(fsp.writeFile).toHaveBeenCalledWith(path.join(exportDir, 'Journal_fixed-stamp.csv'),
      'Datum;Nr.;Typ;Sphäre;Beschreibung;Status;Zahlweg;Netto;MwSt;Brutto', 'utf8')
  })

  it('renders PDF from exactly two filtered monthly queries, preserving refunds and output bytes', async () => {
    const filters = { paymentMethod: 'BANK', sphere: 'IDEELL', earmarkId: 7, budgetId: 8 }
    jest.mocked(listReportVouchers).mockReturnValue([{ ...voucher, description: '<Material> & Test', originalId: 5 }])
    const filePath = path.join(exportDir, 'Controlling_fixed-stamp.pdf')
    await expect(exportReport({ ...baseInput, format: 'PDF', filters, amountMode: 'OUT_NEGATIVE' })).resolves.toEqual({ filePath })
    expect(jest.mocked(monthlyVouchers).mock.calls).toEqual([
      [{ ...period, ...filters, type: 'IN' }], [{ ...period, ...filters, type: 'OUT' }]
    ])
    expect(summarizeVouchers).toHaveBeenCalledWith({ ...period, ...filters, type: undefined })
    expect(BrowserWindow).toHaveBeenCalledWith({ show: false, width: 900, height: 1200 })
    const html = decodeURIComponent(loadURL.mock.calls[0][0].split(',').slice(1).join(','))
    expect(html).toContain('Testverein · Zeitraum: 2026-01-01 – 2026-03-31')
    expect(html).toContain('Einnahmen (Brutto)</div><div class="value">90.00 €')
    expect(html).toContain('Ausgaben (Brutto)</div><div class="value">35.00 €')
    expect(html).toContain('Saldo</div><div class="value">55.00 €')
    expect(html).toContain('&lt;Material&gt; &amp; Test')
    expect(html).toContain('Stornobuchung zu #5')
    expect(html).toContain('-11.90 €')
    expect(html).toContain('Vereinskonto')
    expect(html).toContain('Kennzahlen und Monatsentwicklung')
    expect(html).not.toMatch(/NaN|Infinity/)
    expect(printToPDF).toHaveBeenCalledWith({ pageSize: 'A4', printBackground: true })
    expect(fsp.writeFile).toHaveBeenCalledWith(filePath, Buffer.from('mock-pdf-output'))
    expect(destroy).toHaveBeenCalledTimes(1)
  })

  it.each(['IN', 'OUT'])('only queries the selected %s series in PDF', async type => {
    await exportReport({ ...baseInput, format: 'PDF', filters: { type }, orgName: 'Overrideverein' })
    expect(monthlyVouchers).toHaveBeenCalledTimes(1)
    expect(monthlyVouchers).toHaveBeenCalledWith(expect.objectContaining({ ...period, type }))
    const html = decodeURIComponent(loadURL.mock.calls[0][0])
    expect(html).toContain('Overrideverein · Zeitraum:')
    expect(html).toContain(type === 'IN'
      ? 'Ausgaben (Brutto)</div><div class="value">0.00 €'
      : 'Einnahmen (Brutto)</div><div class="value">0.00 €')
  })

  it('rejects invalid requests before accessing data or export paths', async () => {
    await expect(exportReport({ ...baseInput, format: 'UNKNOWN' })).rejects.toThrow()
    expect(listVouchersAdvanced).not.toHaveBeenCalled()
    expect(ensureExportsDir).not.toHaveBeenCalled()
    expect(fsp.writeFile).not.toHaveBeenCalled()
  })

  it('renders organization names as text in the PDF header', async () => {
    await exportReport({ ...baseInput, format: 'PDF', orgName: '<b>Sport & Kultur</b>' })
    const html = decodeURIComponent(loadURL.mock.calls[0][0])
    expect(html).toContain('&lt;b&gt;Sport &amp; Kultur&lt;/b&gt; · Zeitraum:')
    expect(html).not.toContain('<b>Sport & Kultur</b>')
  })

  it('propagates write failures instead of returning a successful export path', async () => {
    jest.mocked(fsp.writeFile).mockRejectedValueOnce(new Error('disk full'))
    await expect(exportReport(baseInput)).rejects.toThrow('disk full')
  })
})
