import {
  extractLocalInvoiceFields,
  joinPdfTextItems,
  normalizeInvoicePickerValue
} from '../renderer/utils/localInvoiceExtraction'

describe('local invoice extraction', () => {
  it('extracts common German invoice fields without an external service', () => {
    const result = extractLocalInvoiceFields(`
      RECHNUNG
      Auto Teile Europa GmbH
      Rechnungsnr.: DE-001
      Rechnungsdatum: 01.01.2024
      Fällig am: 15.01.2024
      Summe Netto 520,00 €
      MwSt. 19,0 % 98,80 €
      BETRAG 618,80 €
      IBAN: DE89 3704 0044 0532 0130 00
    `)

    expect(result).toMatchObject({
      supplier: 'Auto Teile Europa GmbH',
      invoiceNumber: 'DE-001',
      invoiceDate: '2024-01-01',
      dueDate: '2024-01-15',
      netAmount: '520.00',
      taxAmount: '98.80',
      grossAmount: '618.80',
      iban: 'DE89370400440532013000'
    })
    expect(result.description).toBe('Auto Teile Europa GmbH · Rechnung DE-001')
  })

  it('normalizes international thousands separators', () => {
    const result = extractLocalInvoiceFields(`
      INVOICE
      Acme Parts Ltd
      Invoice No: INV-2026-42
      Invoice Date: 2026-07-11
      Net total 1,000.00 EUR
      VAT 190.00 EUR
      Grand total 1,190.00 EUR
    `)

    expect(result.invoiceNumber).toBe('INV-2026-42')
    expect(result.invoiceDate).toBe('2026-07-11')
    expect(result.netAmount).toBe('1000.00')
    expect(result.taxAmount).toBe('190.00')
    expect(result.grossAmount).toBe('1190.00')
  })

  it('does not invent values when labels are absent', () => {
    const result = extractLocalInvoiceFields('RECHNUNG\nVielen Dank für Ihren Einkauf')

    expect(result.invoiceNumber).toBe('')
    expect(result.invoiceDate).toBe('')
    expect(result.grossAmount).toBe('')
    expect(result.iban).toBe('')
  })

  it('reconstructs PDF text lines from their vertical positions', () => {
    const text = joinPdfTextItems([
      { str: 'Rechnungsnummer:', transform: [1, 0, 0, 1, 20, 700] },
      { str: 'INV-42', transform: [1, 0, 0, 1, 160, 700] },
      { str: 'Summe Netto', transform: [1, 0, 0, 1, 20, 680] },
      { str: '520,00 €', transform: [1, 0, 0, 1, 160, 680], hasEOL: true },
      { str: 'Gesamtbetrag', transform: [1, 0, 0, 1, 20, 660] },
      { str: '618,80 €', transform: [1, 0, 0, 1, 160, 660] }
    ])

    expect(text).toBe('Rechnungsnummer: INV-42\nSumme Netto 520,00 €\nGesamtbetrag 618,80 €')
  })

  it('does not insert spaces into glyphwise PDF text while keeping word gaps', () => {
    const glyphs = 'Rechnung'.split('').map((str, index) => ({
      str,
      width: 6,
      transform: [12, 0, 0, 12, index * 7, 700]
    }))
    const text = joinPdfTextItems([
      ...glyphs,
      { str: 'Apotheke', width: 48, transform: [12, 0, 0, 12, 72, 700] }
    ])

    expect(text).toBe('Rechnung Apotheke')
  })

  it('extracts fields from a PDF text layer with artificial character spacing', () => {
    const result = extractLocalInvoiceFields(`
      B o r c e l l e
      Apotheke
      4 4 , 0 0 €
      8 , 3 6 €
      5 2 , 3 6 €
      N E T T O
      1 9 % M W S T
      G E S A M T
      Rechnung
      R e c h n u n g s - N r . : 0 1 2 3 4
      I B A N : 0 1 2 3 4 5 6 7 8 9 0 1
      D a t u m : 0 1 . 0 1 . 2 6
    `)

    expect(result).toMatchObject({
      supplier: 'Borcelle',
      invoiceNumber: '01234',
      invoiceDate: '2026-01-01',
      grossAmount: '52.36',
      netAmount: '44.00',
      taxAmount: '8.36',
      iban: '012345678901'
    })
    expect(normalizeInvoicePickerValue('grossAmount', '5 2 , 3 6 €')).toBe('52.36')
  })
})
