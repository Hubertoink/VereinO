import { buildTransferFilterState, getTransferTooltipTitle, truncateJournalDescription } from '../renderer/views/Journal/utils/journalDisplayHelpers'

describe('journal display helpers', () => {
  it('truncates long descriptions without breaking the word boundary', () => {
    expect(truncateJournalDescription('Ein sehr langer Buchungstext der in der Tabelle abgeschnitten werden soll', 28)).toBe('Ein sehr langer…')
  })

  it('builds a transfer filter state that targets transfers instead of accounts', () => {
    expect(buildTransferFilterState()).toEqual({
      type: 'TRANSFER',
      paymentMethod: null,
      paymentAccountId: null
    })
  })

  it('creates a transfer tooltip title with both account names', () => {
    expect(getTransferTooltipTitle('Bar', 'Bank')).toBe('Kontotransfer: Bar → Bank')
  })
})
