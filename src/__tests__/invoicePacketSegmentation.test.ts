import { normalizeInvoicePacketGroups } from '../../electron/main/services/invoicePacketSegmentation'

const group = (pageNumbers: number[]) => ({
  pageNumbers,
  confidence: 0.9,
  reason: 'Test',
  warnings: [] as string[]
})

describe('invoice packet segmentation', () => {
  test('normalizes complete consecutive invoice groups', () => {
    expect(normalizeInvoicePacketGroups([
      group([2, 1]),
      group([3]),
      group([5, 4])
    ], 5).map((item) => item.pageNumbers)).toEqual([[1, 2], [3], [4, 5]])
  })

  test.each([
    { label: 'missing page', groups: [group([1]), group([3])], pages: 3 },
    { label: 'duplicate page', groups: [group([1, 2]), group([2, 3])], pages: 3 },
    { label: 'non-consecutive group', groups: [group([1, 3]), group([2])], pages: 3 }
  ])('rejects $label', ({ groups, pages }) => {
    expect(() => normalizeInvoicePacketGroups(groups, pages)).toThrow(/nicht eindeutig und vollständig/)
  })
})
