import { isMetaAmountValid } from '../renderer/components/modals/voucherMetaValidation'

describe('isMetaAmountValid', () => {
  it('allows zero and negative values for internal vouchers', () => {
    expect(isMetaAmountValid(0, true)).toBe(true)
    expect(isMetaAmountValid(-10, true)).toBe(true)
  })

  it('keeps positive-only validation for non-internal vouchers', () => {
    expect(isMetaAmountValid(0, false)).toBe(false)
    expect(isMetaAmountValid(10, false)).toBe(true)
    expect(isMetaAmountValid(-10, false)).toBe(false)
  })
})
