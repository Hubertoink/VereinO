import { getInitialPaymentAccount, getPaymentMethodFromAccountKind } from '../renderer/views/Submissions/paymentAccountUtils'

describe('submissions payment account selection', () => {
  it('prefers a cash account for BAR payments', () => {
    const accounts = [
      { id: 2, name: 'Giro', kind: 'BANK', isActive: 1 },
      { id: 1, name: 'Kasse', kind: 'CASH', isActive: 1 }
    ] as const

    expect(getInitialPaymentAccount(accounts as any, 'BAR')).toEqual(accounts[1])
  })

  it('derives the legacy payment method from the selected account kind', () => {
    expect(getPaymentMethodFromAccountKind('CASH')).toBe('BAR')
    expect(getPaymentMethodFromAccountKind('BANK')).toBe('BANK')
    expect(getPaymentMethodFromAccountKind('PAYPAL')).toBe('BANK')
  })
})
