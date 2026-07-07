import { AiBankImportReviewResult, AiBookingAnalysisResult, AiBookingAnalysisResultStructured, AiSettingsGetOutput, AiSettingsSetInput } from '../../electron/main/ipc/schemas'

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
    expect(() => AiBookingAnalysisResult.parse({
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
    })).toThrow()
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

  it('allows updating only the cheaper text model', () => {
    const update = AiSettingsSetInput.parse({
      textModel: 'gpt-5.4-nano'
    })

    expect(update.textModel).toBe('gpt-5.4-nano')
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
    expect(() => AiBankImportReviewResult.parse({
      suggestions: [
        {
          transactionId: 10,
          action: 'LINK_EXISTING',
          confidence: 0.8,
          reason: 'Unsicherer Treffer ohne Buchungs-ID.'
        }
      ]
    })).toThrow()
  })
})
