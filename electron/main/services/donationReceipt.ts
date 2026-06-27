import { BrowserWindow } from 'electron'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { buildDonationReceiptHtml } from './donationReceiptTemplate'

export interface ExportMoneyDonationReceiptInput {
  receiptType?: 'MONEY' | 'IN_KIND'
  donorName: string
  donorAddress: string
  amount: number
  itemDescription?: string
  itemCondition?: string
  itemOrigin?: 'PRIVAT' | 'BETRIEB' | 'UNBEKANNT'
  valuationMethod?: string
  donationDate: string
  purpose: string
  receiptDate: string
  place?: string
  waiverReimbursement?: boolean
  taxExemptionConfirmed?: boolean
  statuteRequirementsConfirmed?: boolean
  directUse?: boolean
  noMembershipContribution?: boolean
  forwardedToOtherEntity?: boolean
  forwardedRecipient?: string
  forwardedTaxOffice?: string
  forwardedTaxNumber?: string
  forwardedExemptionNoticeDate?: string
  forwardedNoticeType?: 'FREISTELLUNGSBESCHEID' | 'FESTSTELLUNGSBESCHEID'
  orgName: string
  orgAddress: string
  cashier?: string
  orgLogoDataUrl?: string
  taxOffice?: string
  taxNumber?: string
  exemptionNoticeDate?: string
}

function sanitizeFilePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9äöüÄÖÜß_-]+/g, '_').slice(0, 60)
}

export async function exportMoneyDonationReceiptPdf(input: ExportMoneyDonationReceiptInput): Promise<{ filePath: string }> {
  const receiptType = input.receiptType === 'IN_KIND' ? 'IN_KIND' : 'MONEY'
  const amount = Number(input.amount || 0)

  if (!(amount > 0)) throw new Error(receiptType === 'IN_KIND' ? 'Wert der Sachspende muss größer als 0 sein' : 'Betrag muss größer als 0 sein')
  if (receiptType === 'IN_KIND' && !String(input.itemDescription || '').trim()) throw new Error('Bezeichnung der Sachspende fehlt')
  if (receiptType === 'IN_KIND' && !String(input.itemCondition || '').trim()) throw new Error('Zustand der Sachspende fehlt')
  if (receiptType === 'IN_KIND' && !String(input.valuationMethod || '').trim()) throw new Error('Grundlage der Wertermittlung fehlt')

  const now = new Date()
  const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`
  const fileBase = sanitizeFilePart(input.donorName || 'Spendenbescheinigung')
  const outDir = path.join(os.homedir(), 'Documents', 'VereinPlannerExports')
  try {
    fs.mkdirSync(outDir, { recursive: true })
  } catch {
    // ignore
  }
  const filePath = path.join(outDir, `Spendenbescheinigung_${fileBase}_${stamp}.pdf`)

  const html = buildDonationReceiptHtml({
    ...input,
    receiptType,
    amount
  })

  const win = new BrowserWindow({
    show: false,
    width: 1000,
    height: 1400,
    webPreferences: {
      sandbox: true,
      nodeIntegration: false,
      contextIsolation: true
    }
  })

  try {
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    const pdf = await win.webContents.printToPDF({ pageSize: 'A4', printBackground: true })
    fs.writeFileSync(filePath, pdf)
  } finally {
    try {
      win.close()
    } catch {
      // ignore
    }
  }

  return { filePath }
}
