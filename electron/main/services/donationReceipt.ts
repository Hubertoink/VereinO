import { BrowserWindow } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

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
  directUse?: boolean
  forwardedToOtherEntity?: boolean
  forwardedRecipient?: string
  orgName: string
  orgAddress: string
  cashier?: string
  orgLogoDataUrl?: string
  taxOffice?: string
  taxNumber?: string
  exemptionNoticeDate?: string
}

function esc(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  } as Record<string, string>)[char] || char)
}

function formatEuro(value: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(Number(value) || 0)
}

function sanitizeFilePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9äöüÄÖÜß_-]+/g, '_').slice(0, 60)
}

function amountInWordsDe(value: number): string {
  const abs = Math.floor(Math.abs(value))
  const cents = Math.round((Math.abs(value) - abs) * 100)

  const ones = ['null', 'eins', 'zwei', 'drei', 'vier', 'fünf', 'sechs', 'sieben', 'acht', 'neun']
  const teens: Record<number, string> = {
    10: 'zehn', 11: 'elf', 12: 'zwölf', 13: 'dreizehn', 14: 'vierzehn', 15: 'fünfzehn',
    16: 'sechzehn', 17: 'siebzehn', 18: 'achtzehn', 19: 'neunzehn'
  }
  const tens = ['', '', 'zwanzig', 'dreißig', 'vierzig', 'fünfzig', 'sechzig', 'siebzig', 'achtzig', 'neunzig']

  function belowHundred(n: number): string {
    if (n < 10) return ones[n]
    if (n < 20) return teens[n]
    const t = Math.floor(n / 10)
    const o = n % 10
    if (o === 0) return tens[t]
    const oneWord = o === 1 ? 'ein' : ones[o]
    return `${oneWord}und${tens[t]}`
  }

  function belowThousand(n: number): string {
    if (n < 100) return belowHundred(n)
    const h = Math.floor(n / 100)
    const rest = n % 100
    const hundred = h === 1 ? 'einhundert' : `${ones[h]}hundert`
    if (rest === 0) return hundred
    return `${hundred}${belowHundred(rest)}`
  }

  function intToWords(n: number): string {
    if (n === 0) return 'null'
    if (n < 1000) return belowThousand(n)

    const thousands = Math.floor(n / 1000)
    const rest = n % 1000
    const thousandWord = thousands === 1 ? 'eintausend' : `${belowThousand(thousands)}tausend`
    if (rest === 0) return thousandWord
    return `${thousandWord}${belowThousand(rest)}`
  }

  const euroWords = `${intToWords(abs)} Euro`
  const centWords = `${intToWords(cents)} Cent`
  return `${euroWords} und ${centWords}`
}

export async function exportMoneyDonationReceiptPdf(input: ExportMoneyDonationReceiptInput): Promise<{ filePath: string }> {
  const receiptType = input.receiptType === 'IN_KIND' ? 'IN_KIND' : 'MONEY'
  const amount = Number(input.amount || 0)
  if (!(amount > 0)) throw new Error(receiptType === 'IN_KIND' ? 'Wert der Sachspende muss größer als 0 sein' : 'Betrag muss größer als 0 sein')
  if (receiptType === 'IN_KIND' && !String(input.itemDescription || '').trim()) {
    throw new Error('Bezeichnung der Sachspende fehlt')
  }
  if (receiptType === 'IN_KIND' && !String(input.itemCondition || '').trim()) {
    throw new Error('Zustand der Sachspende fehlt')
  }
  if (receiptType === 'IN_KIND' && !String(input.valuationMethod || '').trim()) {
    throw new Error('Grundlage der Wertermittlung fehlt')
  }

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

  const checkbox = (checked: boolean) => checked ? '☑' : '☐'
  const amountWords = amountInWordsDe(amount)

  const html = `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <title>Spendenbescheinigung</title>
  <style>
    body { font-family: Arial, Helvetica, sans-serif; margin: 24px; color: #000; font-size: 12px; line-height: 1.3; }
    .topline { display:flex; justify-content:space-between; font-size: 11px; border-bottom:1px solid #222; padding-bottom: 6px; margin-bottom: 10px; }
    .box { border:1px solid #222; padding: 8px; margin: 8px 0; min-height: 32px; }
    .title { font-size: 18px; font-weight: 700; margin: 8px 0 2px; }
    .subtitle { font-weight: 700; font-size: 15px; margin: 8px 0; }
    .row3 { display:grid; grid-template-columns: 1.2fr 1.2fr 1fr; }
    .row3 > div { border:1px solid #222; border-left:none; padding:7px; min-height: 26px; }
    .row3 > div:first-child { border-left:1px solid #222; }
    .small { font-size: 11px; }
    .checks { margin-top: 10px; display:grid; gap: 6px; }
    .sign { margin-top: 20px; border-top:1px solid #222; padding-top: 8px; }
    .hint { margin-top: 20px; font-size: 10px; }
    .orghead { display:flex; justify-content:space-between; align-items:flex-start; gap: 16px; margin-bottom: 8px; }
    .orglogo { max-height: 56px; max-width: 140px; object-fit: contain; }
  </style>
</head>
<body>
  <div class="topline">
    <div>Zuwendungen nach §§ 10b, 34g EStG</div>
    <div><strong>Anhang 37</strong></div>
  </div>

  <div class="orghead">
    <div>
      <div class="box small"><strong>Aussteller:</strong><br/>${esc(input.orgName)}<br/>${esc(input.orgAddress).replace(/\n/g, '<br/>')}</div>
    </div>
    ${input.orgLogoDataUrl ? `<img class="orglogo" src="${esc(input.orgLogoDataUrl)}" alt="Vereinslogo" />` : ''}
  </div>

  <div class="subtitle">Bestätigung über ${receiptType === 'IN_KIND' ? 'Sachzuwendungen' : 'Geldzuwendungen'}</div>
  <div>im Sinne des § 10b des Einkommensteuergesetzes an inländische juristische Personen des öffentlichen Rechts oder inländische öffentliche Dienststellen</div>

  <div class="box">Name und Anschrift des Zuwendenden:<br/>${esc(input.donorName)}<br/>${esc(input.donorAddress).replace(/\n/g, '<br/>')}</div>

  <div class="row3">
    <div>${receiptType === 'IN_KIND' ? 'Wert der Sachzuwendung – in Ziffern –' : 'Betrag der Zuwendung – in Ziffern –'}<br/><strong>${esc(formatEuro(amount))}</strong></div>
    <div>– in Buchstaben –<br/><strong>${esc(amountWords)}</strong></div>
    <div>Tag der Zuwendung:<br/><strong>${esc(input.donationDate)}</strong></div>
  </div>

  ${receiptType === 'IN_KIND' ? `<div class="box">Bezeichnung der Sachspende:<br/><strong>${esc(input.itemDescription || '')}</strong><br/><span class="small">Zustand: ${esc(input.itemCondition || '')}</span><br/><span class="small">Herkunft: ${esc(input.itemOrigin === 'BETRIEB' ? 'Betriebsvermögen' : input.itemOrigin === 'UNBEKANNT' ? 'Unbekannt' : 'Privatvermögen')}</span><br/><span class="small">Grundlage der Wertermittlung: ${esc(input.valuationMethod || '')}</span></div>` : ''}

  <div class="box">Es wird bestätigt, dass die Zuwendung nur zur Förderung (${esc(input.purpose)}) verwendet wird.</div>

  <div class="checks">
    <div>Es handelt sich um den Verzicht auf Erstattung von Aufwendungen&nbsp;&nbsp;&nbsp;Ja ${checkbox(!!input.waiverReimbursement)}&nbsp;&nbsp;Nein ${checkbox(!input.waiverReimbursement)}</div>
    <div>Die Zuwendung wird unmittelbar für den angegebenen Zweck verwendet ${checkbox(!!input.directUse)}</div>
    <div>entsprechend den Angaben des Zuwendenden an ${esc(input.forwardedRecipient || '—')} weitergeleitet ${checkbox(!!input.forwardedToOtherEntity)}</div>
  </div>

  <div class="sign">${esc(input.place || '')}, ${esc(input.receiptDate)} – ${esc(input.cashier || '')}<br/>(Ort, Datum und Unterschrift des Zuwendungsempfängers)</div>

  <div class="hint">
    <strong>Hinweis:</strong><br/>
    Wer vorsätzlich oder grob fahrlässig eine unrichtige Zuwendungsbestätigung erstellt oder veranlasst, dass Zuwendungen nicht zu den in der Zuwendungsbestätigung angegebenen steuerbegünstigten Zwecken verwendet werden, haftet für die entgangene Steuer (§ 10b Abs. 4 EStG, § 9 Abs. 3 KStG).<br/><br/>
    <strong>Nur in den Fällen der Weiterleitung an steuerbegünstigte Körperschaften:</strong><br/>
    Diese Bestätigung wird nur anerkannt, wenn das Datum des Freistellungsbescheides nicht länger als 5 Jahre bzw. das Datum der Feststellung der Einhaltung der satzungsmäßigen Voraussetzungen nach § 60a AO nicht länger als 3 Jahre seit Ausstellung des Bescheides zurückliegt.
  </div>

  <div class="hint">
    Finanzamt: ${esc(input.taxOffice || '—')} · Steuernummer: ${esc(input.taxNumber || '—')} · Feststellungsbescheid: ${esc(input.exemptionNoticeDate || '—')}
  </div>
</body>
</html>`

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
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
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
