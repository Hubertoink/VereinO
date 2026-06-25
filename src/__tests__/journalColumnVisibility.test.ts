import { getDefaultJournalCols, getDefaultJournalOrder, getEffectiveJournalCols, getEffectiveJournalOrder } from '../renderer/views/Journal/utils/journalColumnVisibility'

describe('journal column visibility', () => {
  it('includes a note column in the default journal configuration', () => {
    expect(getDefaultJournalCols()).toMatchObject({ note: true })
    expect(getDefaultJournalOrder()).toContain('note')
  })

  it('keeps the note column available when voucher deletion is disabled', () => {
    const cols = getEffectiveJournalCols({
      actions: true,
      date: true,
      voucherNo: false,
      type: false,
      sphere: false,
      description: true,
      earmark: false,
      budget: false,
      paymentMethod: false,
      attachments: false,
      note: true,
      net: false,
      vat: false,
      gross: true
    } as any, false)

    expect(cols.note).toBe(true)
    expect(getEffectiveJournalOrder(['actions', 'date', 'description', 'note', 'gross'] as any, false)).toEqual(['date', 'description', 'note', 'gross', 'voucherNo', 'type', 'sphere', 'earmark', 'budget', 'paymentMethod', 'attachments', 'net', 'vat'])
  })
})
