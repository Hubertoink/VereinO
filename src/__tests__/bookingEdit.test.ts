import {
  buildVoucherUpdatePayloadFromForm,
  persistBookingEdit,
  voucherRowToBookingForm
} from '../renderer/views/BookingsPlus/bookingEdit'

const original = {
  id: 4, date: '2026-02-10', type: 'IN', amountMode: 'GROSS', grossAmount: 119,
  netAmount: 100, vatRate: 19, paymentAccountId: 7
} as const

test('an ordinary edit preserves gross, VAT rate and account, and rejects a split one cent too large', () => {
  const form = voucherRowToBookingForm(original)
  expect(buildVoucherUpdatePayloadFromForm(form).payload).toMatchObject({
    paymentAccountId: 7, grossAmount: 119, amountMode: 'GROSS', vatRate: 19
  })
  form.budgets = [{ budgetId: 2, amount: 119.01 }]
  expect(buildVoucherUpdatePayloadFromForm(form).error).toMatch(/Budget-Beträge/)
})

test('internal transfers retain both signs, use gross and have no payment account', () => {
  const form = voucherRowToBookingForm({
    ...original, type: 'INTERNAL', amountMode: 'NET', grossAmount: 60,
    budgets: [{ budgetId: 1, amount: -60 }], earmarksAssigned: [{ earmarkId: 5, amount: 60 }]
  })
  expect(buildVoucherUpdatePayloadFromForm(form).payload).toMatchObject({
    grossAmount: 60, amountMode: 'GROSS', vatRate: 0, paymentAccountId: null,
    budgets: [{ budgetId: 1, amount: -60 }], earmarks: [{ earmarkId: 5, amount: 60 }]
  })
})

test('retry after a failed attachment uploads only the files still pending', async () => {
  const payload = buildVoucherUpdatePayloadFromForm(voucherRowToBookingForm(original)).payload!
  const add = jest.fn().mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('Speicher voll')).mockResolvedValue({})
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window')
  Object.defineProperty(globalThis, 'window', {
    configurable: true, value: { api: { vouchers: { update: jest.fn().mockResolvedValue({}) }, attachments: { add } } }
  })
  try {
    let pending = [new File(['A'], 'A.txt'), new File(['B'], 'B.txt')]
    const uploaded = (file: File) => { pending = pending.filter(entry => entry !== file) }
    await expect(persistBookingEdit(payload, pending, uploaded)).rejects.toThrow('Speicher voll')
    expect(pending.map(file => file.name)).toEqual(['B.txt'])
    await persistBookingEdit(payload, pending, uploaded)
    expect(pending).toEqual([])
    expect(add.mock.calls.map(([args]) => args.fileName)).toEqual(['A.txt', 'B.txt', 'B.txt'])
  } finally {
    if (previous) Object.defineProperty(globalThis, 'window', previous)
    else Reflect.deleteProperty(globalThis, 'window')
  }
})
