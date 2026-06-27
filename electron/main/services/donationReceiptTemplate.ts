export interface DonationReceiptTemplateInput {
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

function esc(value: unknown): string {
  return String(value ?? '').replace(/[&<>"]'/g, (char) => ({
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

  return `${intToWords(abs)} Euro und ${intToWords(cents)} Cent`
}

export function buildDonationReceiptHtml(input: DonationReceiptTemplateInput): string {
  const receiptType = input.receiptType === 'IN_KIND' ? 'IN_KIND' : 'MONEY'
  const amount = Number(input.amount || 0)
  const checkbox = (checked: boolean) => checked ? '☑' : '☐'
  const amountWords = amountInWordsDe(amount)
  const purpose = esc(input.purpose || '—')
  const taxOffice = esc(input.taxOffice || '—')
  const taxNumber = esc(input.taxNumber || '—')
  const exemptionNoticeDate = esc(input.exemptionNoticeDate || '—')

  return `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <title>Spendenbescheinigung</title>
  <style>
    body { font-family: Arial, Helvetica, sans-serif; margin: 24px; color: #000; font-size: 12px; line-height: 1.32; }
    .topline { display:flex; justify-content:space-between; font-size: 11px; border-bottom:1px solid #222; padding-bottom: 6px; margin-bottom: 10px; }
    .box { border:1px solid #222; padding: 8px; margin: 8px 0; min-height: 32px; }
    .subtitle { font-weight: 700; font-size: 15px; margin: 8px 0; }
    .row3 { display:grid; grid-template-columns: 1.2fr 1.2fr 1fr; }
    .row3 > div { border:1px solid #222; border-left:none; padding:7px; min-height: 26px; }
    .row3 > div:first-child { border-left:1px solid #222; }
    .small { font-size: 11px; }
    .waiver-line { display:flex; align-items:center; gap: 12px; margin: 10px 0 12px; }
    .waiver-choice { white-space: nowrap; }
    .official-checks { display:grid; gap: 8px; margin: 8px 0 10px; }
    .official-checkline { display:grid; grid-template-columns: 18px 1fr; gap: 8px; align-items:flex-start; }
    .official-checkmark { font-size: 16px; line-height: 1; padding-top: 1px; }
    .purpose-box { min-height: 90px; }
    .purpose-spacer { display:block; min-height: 28px; }
    .purpose-footer { font-weight: 700; margin-top: 10px; }
    .membership-line { display:grid; grid-template-columns: 18px 1fr; gap: 8px; align-items:flex-start; margin-top: 8px; }
    .sign { margin-top: 40px; border-top:1px solid #222; padding-top: 10px; }
    .hint { margin-top: 20px; font-size: 10px; }
    .orghead { display:flex; justify-content:space-between; align-items:flex-start; gap: 16px; margin-bottom: 8px; }
    .orglogo { max-height: 56px; max-width: 140px; object-fit: contain; }
  </style>
</head>
<body>
  <div class="topline">
    <div>Zuwendungen nach §§ 10b, 34g EStG</div>
    <div><strong>Anlage 3</strong></div>
  </div>

  <div class="orghead">
    <div class="box small"><strong>Aussteller:</strong><br/>${esc(input.orgName)}<br/>${esc(input.orgAddress).replace(/\n/g, '<br/>')}</div>
    ${input.orgLogoDataUrl ? `<img class="orglogo" src="${esc(input.orgLogoDataUrl)}" alt="Vereinslogo" />` : ''}
  </div>

  <div class="subtitle">Bestätigung über ${receiptType === 'IN_KIND' ? 'Sachzuwendungen' : 'Geldzuwendungen'}</div>
  <div>für Zuwendungen an gemeinnützige Vereine im Sinne des § 10b des Einkommensteuergesetzes</div>

  <div class="box">Name und Anschrift des Zuwendenden:<br/>${esc(input.donorName)}<br/>${esc(input.donorAddress).replace(/\n/g, '<br/>')}</div>

  <div class="row3">
    <div>${receiptType === 'IN_KIND' ? 'Wert der Sachzuwendung – in Ziffern –' : 'Betrag der Zuwendung – in Ziffern –'}<br/><strong>${esc(formatEuro(amount))}</strong></div>
    <div>– in Buchstaben –<br/><strong>${esc(amountWords)}</strong></div>
    <div>Tag der Zuwendung:<br/><strong>${esc(input.donationDate)}</strong></div>
  </div>

  ${receiptType === 'IN_KIND' ? `<div class="box">Bezeichnung der Sachspende:<br/><strong>${esc(input.itemDescription || '')}</strong><br/><span class="small">Zustand: ${esc(input.itemCondition || '')}</span><br/><span class="small">Herkunft: ${esc(input.itemOrigin === 'BETRIEB' ? 'Betriebsvermögen' : input.itemOrigin === 'UNBEKANNT' ? 'Unbekannt' : 'Privatvermögen')}</span><br/><span class="small">Grundlage der Wertermittlung: ${esc(input.valuationMethod || '')}</span></div>` : ''}

  <div class="waiver-line">
    <div>Es handelt sich um den Verzicht auf Erstattung von Aufwendungen</div>
    <div class="waiver-choice">Ja ${checkbox(!!input.waiverReimbursement)}</div>
    <div class="waiver-choice">Nein ${checkbox(!input.waiverReimbursement)}</div>
  </div>

  <div class="official-checks">
    <div class="official-checkline">
      <div class="official-checkmark">${checkbox(!!input.taxExemptionConfirmed)}</div>
      <div>
        <strong>Wir sind wegen Förderung</strong> (${purpose}) <strong>nach dem Freistellungsbescheid bzw. nach der Anlage zum Körperschaftsteuerbescheid</strong> des Finanzamtes ${taxOffice}, StNr. ${taxNumber}, vom ${exemptionNoticeDate} <strong>für den letzten Veranlagungszeitraum</strong> nach § 5 Abs. 1 Nr. 9 des Körperschaftsteuergesetzes von der Körperschaftsteuer und nach § 3 Nr. 6 des Gewerbesteuergesetzes von der Gewerbesteuer befreit.
      </div>
    </div>
    <div class="official-checkline">
      <div class="official-checkmark">${checkbox(!!input.statuteRequirementsConfirmed)}</div>
      <div>
        <strong>Die Einhaltung der satzungsmäßigen Voraussetzungen nach den §§ 51, 59, 60 und 61 AO wurde vom Finanzamt</strong> ${taxOffice}, StNr. ${taxNumber}, <strong>mit Bescheid vom</strong> ${exemptionNoticeDate} <strong>nach § 60a AO gesondert festgestellt. Wir fördern nach unserer Satzung</strong> (${purpose}).
      </div>
    </div>
  </div>

  <div class="box purpose-box">
    Es wird bestätigt, dass die Zuwendung nur zur Förderung
    <br/><strong>${purpose}</strong>
    <span class="purpose-spacer"></span>
    verwendet wird.
    <div class="purpose-footer">Nur für steuerbegünstigte Einrichtungen, bei denen die Mitgliedsbeiträge steuerlich nicht abziehbar sind:</div>
    <div class="membership-line">
      <div class="official-checkmark">${checkbox(!!input.noMembershipContribution)}</div>
      <div>Es wird bestätigt, dass es sich nicht um einen Mitgliedsbeitrag handelt, dessen Abzug nach § 10b Abs. 1 des Einkommensteuergesetzes ausgeschlossen ist.</div>
    </div>
  </div>

  <div class="sign">${esc(input.place || '')}, ${esc(input.receiptDate)} – ${esc(input.cashier || '')}<br/>(Ort, Datum und Unterschrift des Zuwendungsempfängers)</div>

  <div class="hint">
    <strong>Hinweis:</strong><br/>
    Wer vorsätzlich oder grob fahrlässig eine unrichtige Zuwendungsbestätigung erstellt oder veranlasst, dass Zuwendungen nicht zu den in der Zuwendungsbestätigung angegebenen steuerbegünstigten Zwecken verwendet werden, haftet für die entgangene Steuer (§ 10b Abs. 4 EStG, § 9 Abs. 3 KStG).
  </div>
</body>
</html>`
}
