import { BrowserWindow, type BrowserWindowConstructorOptions, type PrintToPDFOptions } from 'electron'
import { writeFile } from 'node:fs/promises'

type ReportPdfOptions = {
  html: string
  filePath: string
  windowOptions?: BrowserWindowConstructorOptions
  printOptions?: PrintToPDFOptions
}

/** Own the hidden window until export finishes, including every failure path. */
export async function writeReportPdf({ html, filePath, windowOptions, printOptions }: ReportPdfOptions): Promise<void> {
  const window = new BrowserWindow({ width: 900, height: 1200, ...windowOptions, show: false })
  try {
    // loadURL already waits for did-finish-load. Fonts expose their own readiness;
    // subscribing to did-finish-load afterwards used to force the fallback timer.
    await window.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
    await window.webContents.executeJavaScript('document.fonts.ready.then(() => undefined)')
    const pdf = await window.webContents.printToPDF({ pageSize: 'A4', printBackground: true, ...printOptions })
    await writeFile(filePath, pdf)
  } finally {
    // Preserve the export error if the window was already torn down externally.
    try { window.destroy() } catch { /* already closed */ }
  }
}
