import { buildDonationReceiptHtml } from '../donationReceiptTemplate'

describe('buildDonationReceiptHtml', () => {
  it('uses Anlage 3 wording for nonprofit donation receipts', () => {
    const html = buildDonationReceiptHtml({
      receiptType: 'MONEY',
      donorName: 'Max Mustermann',
      donorAddress: 'Musterstraße 1\n12345 Musterstadt',
      amount: 100,
      donationDate: '2025-01-05',
      purpose: 'Jugendförderung',
      receiptDate: '2025-01-06',
      place: 'Musterstadt',
      waiverReimbursement: false,
      taxExemptionConfirmed: true,
      statuteRequirementsConfirmed: false,
      directUse: true,
      noMembershipContribution: true,
      forwardedToOtherEntity: false,
      orgName: 'VereinO e. V.',
      orgAddress: 'Musterweg 2\n12345 Musterstadt',
      cashier: 'Kassierer',
      taxOffice: 'Finanzamt Musterstadt',
      taxNumber: '12/345/67890',
      exemptionNoticeDate: '2024-01-01'
    })

    expect(html).toContain('Anlage 3')
    expect(html).toContain('gemeinnützige Vereine')
    expect(html).toContain('Bestätigung über Geldzuwendungen')
    expect(html).toContain('nach dem Freistellungsbescheid bzw. nach der Anlage zum Körperschaftsteuerbescheid')
    expect(html).toContain('Die Einhaltung der satzungsmäßigen Voraussetzungen nach den §§ 51, 59, 60 und 61 AO')
    expect(html).toContain('Es wird bestätigt, dass die Zuwendung nur zur Förderung')
    expect(html).toContain('<br/><strong>Jugendförderung</strong>')
    expect(html).toContain('Es wird bestätigt, dass es sich nicht um einen Mitgliedsbeitrag handelt')
    expect(html).toContain('Ja ☐')
    expect(html).toContain('☑</div>')
    expect(html).toContain('☐</div>')
    expect(html).not.toContain('weitergeleitet')
  })
})
