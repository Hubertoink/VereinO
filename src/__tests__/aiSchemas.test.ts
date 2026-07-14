import {
  AiBankImportReviewResult,
  AiBookingAnalysisResult,
  AiBookingAnalysisResultStructured,
  AiInvoiceExtractInput,
  AiInvoiceExtractionResult,
  AiSettingsGetOutput,
  AiSettingsSetInput
} from '../../electron/main/ipc/schemas'

describe('AiBookingAnalysisResult', () => {
  it('accepts a reviewable booking candidate with evidence and assignments', () => {
    const parsed = AiBookingAnalysisResult.parse({
      candidates: [
        {
          date: '2026-07-04',
          type: 'OUT',
          sphere: 'IDEELL',
          description: 'Rechnung Material',
          grossAmount: 42.5,
          vatRate: 19,
          paymentMethod: 'BANK',
          budgets: [{ id: 1, amount: 42.5 }],
          earmarks: [],
          tags: ['Projekt'],
          confidence: 0.82,
          warnings: ['Zahlungsdatum aus Rechnungsdatum abgeleitet'],
          evidence: ['Rechnungsbetrag 42,50 EUR'],
          source: {
            fileName: 'stapel-scan.pdf',
            pageNumber: 3,
            pageCount: 10,
            label: 'stapel-scan.pdf · Seite 3 von 10'
          },
          review: {
            status: 'APPROVED',
            voucherId: 99,
            voucherNo: '2026-00099',
            approvedAt: '2026-07-04T12:00:00.000Z'
          }
        }
      ]
    })

    expect(parsed.candidates[0].grossAmount).toBe(42.5)
    expect(parsed.candidates[0].budgets[0].id).toBe(1)
    expect(parsed.candidates[0].review?.voucherNo).toBe('2026-00099')
    expect(parsed.candidates[0].source?.pageNumber).toBe(3)
  })

  it('rejects non-reviewable candidates with invalid amount or unsupported type', () => {
    expect(() =>
      AiBookingAnalysisResult.parse({
        candidates: [
          {
            date: '2026-07-04',
            type: 'TRANSFER',
            sphere: 'IDEELL',
            description: 'Umbuchung',
            grossAmount: 0,
            vatRate: 0
          }
        ]
      })
    ).toThrow()
  })

  it('accepts required structured source metadata for batch document analysis', () => {
    const parsed = AiBookingAnalysisResultStructured.parse({
      candidates: [
        {
          date: '2026-07-04',
          type: 'OUT',
          sphere: 'IDEELL',
          description: 'Rechnung Material',
          grossAmount: 42.5,
          vatRate: 19,
          paymentMethod: 'BANK',
          paymentAccountId: null,
          counterparty: 'Muster GmbH',
          budgets: [{ id: 1, amount: 42.5 }],
          earmarks: [],
          tags: ['Projekt'],
          confidence: 0.82,
          warnings: [],
          evidence: ['Rechnungsbetrag 42,50 EUR'],
          source: {
            fileName: 'stapel-scan.pdf',
            pageNumber: 3,
            pageCount: 10,
            label: 'stapel-scan.pdf · Seite 3 von 10'
          }
        }
      ],
      summary: null,
      warnings: []
    })

    expect(parsed.candidates[0].source.pageNumber).toBe(3)
  })
})

describe('AiSettings schemas', () => {
  it('accepts separate document and text models', () => {
    const settings = AiSettingsGetOutput.parse({
      hasApiKey: true,
      model: 'gpt-5.5',
      textModel: 'gpt-5.4-mini',
      defaultReasoningEffort: 'medium',
      provider: 'openai',
      apiBaseUrl: 'https://api.openai.com/v1'
    })

    expect(settings.model).toBe('gpt-5.5')
    expect(settings.textModel).toBe('gpt-5.4-mini')
    expect(settings.provider).toBe('openai')
  })

  it('allows updating provider and base URL for OpenAI-compatible APIs', () => {
    const update = AiSettingsSetInput.parse({
      provider: 'minimax'
    })

    expect(update.provider).toBe('minimax')
  })

  it('accepts Mittwald AI Hosting as an OpenAI-compatible provider', () => {
    const update = AiSettingsSetInput.parse({
      provider: 'mittwald',
      model: 'GLM-OCR',
      textModel: 'Qwen3.5-0.8B'
    })

    expect(update.provider).toBe('mittwald')
    expect(update.model).toBe('GLM-OCR')
  })

  it('allows updating only the cheaper text model', () => {
    const update = AiSettingsSetInput.parse({
      textModel: 'gpt-5.4-nano'
    })

    expect(update.textModel).toBe('gpt-5.4-nano')
  })
})

describe('AiInvoiceExtractionResult', () => {
  it('accepts a complete, reviewable invoice extraction without persisting a job', () => {
    const parsed = AiInvoiceExtractionResult.parse({
      supplier: 'Borcelle Apotheke',
      invoiceNumber: '01234',
      invoiceDate: '2026-01-01',
      dueDate: null,
      grossAmount: 52.36,
      netAmount: 44,
      taxAmount: 8.36,
      vatRate: 19,
      iban: 'DE89370400440532013000',
      description: 'Borcelle Apotheke · Rechnung 01234',
      type: 'OUT',
      sphere: 'IDEELL',
      paymentMethod: 'BANK',
      paymentAccountId: null,
      budgets: [{ id: 7, amount: 52.36 }],
      earmarks: [],
      tags: ['Medizin'],
      confidence: 0.91,
      warnings: [],
      evidence: ['Gesamt 52,36 EUR']
    })

    expect(parsed.invoiceNumber).toBe('01234')
    expect(parsed.budgets[0].id).toBe(7)
  })

  it('limits transient invoice uploads to one supported Base64 file', () => {
    const parsed = AiInvoiceExtractInput.parse({
      file: {
        fileName: 'rechnung.pdf',
        mimeType: 'application/pdf',
        dataBase64: 'JVBERi0='
      }
    })

    expect(parsed.file.mimeType).toBe('application/pdf')
    expect(() =>
      AiInvoiceExtractInput.parse({
        file: { fileName: 'rechnung.svg', mimeType: 'image/svg+xml', dataBase64: 'PHN2Zz4=' }
      })
    ).toThrow()
  })
})

describe('AiBankImportReviewResult', () => {
  it('accepts link and create suggestions for open bank transactions', () => {
    const parsed = AiBankImportReviewResult.parse({
      suggestions: [
        {
          transactionId: 10,
          action: 'LINK_EXISTING',
          voucherId: 42,
          voucherNo: '2026-00042',
          confidence: 0.91,
          reason: 'Betrag, Datum und Text passen zur vorhandenen Buchung.'
        },
        {
          transactionId: 11,
          action: 'CREATE_BOOKING',
          confidence: 0.76,
          reason: 'Kein vorhandener Treffer, Banktext ist buchungsrelevant.',
          bookingCandidate: {
            date: '2026-07-04',
            type: 'OUT',
            sphere: 'IDEELL',
            description: 'Webhosting Juli',
            grossAmount: 33.33,
            vatRate: 19,
            paymentMethod: 'BANK'
          }
        }
      ]
    })

    expect(parsed.suggestions[0].voucherId).toBe(42)
    expect(parsed.suggestions[1].bookingCandidate?.description).toBe('Webhosting Juli')
  })

  it('rejects unsafe link suggestions without voucher id', () => {
    expect(() =>
      AiBankImportReviewResult.parse({
        suggestions: [
          {
            transactionId: 10,
            action: 'LINK_EXISTING',
            confidence: 0.8,
            reason: 'Unsicherer Treffer ohne Buchungs-ID.'
          }
        ]
      })
    ).toThrow()
  })
})
