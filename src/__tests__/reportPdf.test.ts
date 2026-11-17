import { BrowserWindow } from 'electron'
import { writeFile } from 'node:fs/promises'
import { writeReportPdf } from '../../electron/main/services/reportPdf'
import { escapeReportHtml, voucherDescriptionHtml } from '../../electron/main/services/reportHtml'

jest.mock('electron', () => ({ BrowserWindow: jest.fn() }))
jest.mock('node:fs/promises', () => ({ writeFile: jest.fn() }))

const loadURL = jest.fn()
const executeJavaScript = jest.fn()
const printToPDF = jest.fn()
const destroy = jest.fn()
const options = { html: '<html><body>Verein & Bericht</body></html>', filePath: 'report.pdf' }

beforeEach(() => {
  jest.resetAllMocks()
  loadURL.mockResolvedValue(undefined)
  executeJavaScript.mockResolvedValue(undefined)
  printToPDF.mockResolvedValue(Buffer.from('pdf'))
  jest.mocked(writeFile).mockResolvedValue(undefined)
  jest.mocked(BrowserWindow).mockImplementation(() => ({
    loadURL, webContents: { executeJavaScript, printToPDF }, destroy
  }) as unknown as BrowserWindow)
})

test('waits for load and fonts before printing, preserves options and writes the returned PDF', async () => {
  let fontsReady!: () => void
  executeJavaScript.mockReturnValue(new Promise<void>(resolve => { fontsReady = resolve }))
  const pending = writeReportPdf({ ...options,
    windowOptions: { height: 10000, webPreferences: { offscreen: true } },
    printOptions: { margins: { top: 0, bottom: 0, left: 0, right: 0 } }
  })
  await Promise.resolve()
  expect(printToPDF).not.toHaveBeenCalled()
  expect(writeFile).not.toHaveBeenCalled()
  expect(destroy).not.toHaveBeenCalled()
  fontsReady()
  await pending
  expect(BrowserWindow).toHaveBeenCalledWith({ show: false, width: 900, height: 10000, webPreferences: { offscreen: true } })
  expect(loadURL).toHaveBeenCalledWith('data:text/html;charset=utf-8,' + encodeURIComponent(options.html))
  expect(printToPDF).toHaveBeenCalledWith({ pageSize: 'A4', printBackground: true, margins: { top: 0, bottom: 0, left: 0, right: 0 } })
  expect(writeFile).toHaveBeenCalledWith(options.filePath, Buffer.from('pdf'))
  expect(destroy).toHaveBeenCalledTimes(1)
})

test.each(['load', 'fonts', 'print', 'write'] as const)('closes its window when %s fails and preserves the error', async stage => {
  const error = new Error(`${stage} failed`)
  const failures = { load: loadURL, fonts: executeJavaScript, print: printToPDF, write: jest.mocked(writeFile) }
  failures[stage].mockRejectedValueOnce(error)
  await expect(writeReportPdf(options)).rejects.toBe(error)
  expect(destroy).toHaveBeenCalledTimes(1)
  if (stage !== 'write') expect(writeFile).not.toHaveBeenCalled()
})

test('a failed cleanup cannot hide the original export error', async () => {
  const error = new Error('print failed')
  printToPDF.mockRejectedValueOnce(error)
  destroy.mockImplementationOnce(() => { throw new Error('already closed') })
  await expect(writeReportPdf(options)).rejects.toBe(error)
})

test('escapes report text and status references without altering the shared markup', () => {
  expect(escapeReportHtml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;')
  expect(escapeReportHtml(null)).toBe('')
  expect(voucherDescriptionHtml({ description: ' ' })).toBe('—')
  expect(voucherDescriptionHtml(null)).toBe('—')
  expect(voucherDescriptionHtml({ description: '<Material>', originalId: 2, originalVoucherNo: 'A&B' }))
    .toBe('&lt;Material&gt;<div class="voucher-status voucher-status-storno">Stornobuchung zu #A&amp;B</div>')
  expect(voucherDescriptionHtml({ description: 'Beitrag', reversedById: 3 }))
    .toBe('Beitrag<div class="voucher-status voucher-status-storniert">Storniert durch #3</div>')
})
