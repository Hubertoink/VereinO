import type { RendererApi } from '../../types/api'

export type CashBalance = Awaited<ReturnType<RendererApi['reports']['cashBalance']>>

export function totalAccountBalance(result: { BAR: number; BANK: number; accounts?: ReadonlyArray<{ balance: number }> }) {
  if (!result.accounts) return result.BAR + result.BANK
  return result.accounts.reduce((cents, account) => cents + Math.round(account.balance * 100), 0) / 100
}

export type BalanceAccount = { id: number; kind?: string | null; openingDate?: string | null; openingCents?: number | null }

type BalanceSelection = {
    to: string
    paymentAccountId?: number | null
    paymentMethod?: 'BAR' | 'BANK'
}

export function accountPositionAt(balances: CashBalance, paymentAccounts: BalanceAccount[], selection: BalanceSelection) {
    const { to, paymentAccountId, paymentMethod } = selection
    function matchesAccount(account: BalanceAccount) {
        if (paymentAccountId != null) return account.id === paymentAccountId
        return !paymentMethod || (account.kind === 'CASH' ? 'BAR' : 'BANK') === paymentMethod
    }

    const accounts = balances.accounts?.filter(matchesAccount)
    if (!accounts && paymentAccountId != null) return undefined

    const openingCents = paymentAccounts.reduce((cents, account) => {
        const date = account.openingDate
        if (!date || date > to || !matchesAccount(account)) return cents
        return cents + (account.openingCents ?? 0)
    }, 0)
    const saldo = !accounts && paymentMethod ? balances[paymentMethod] : totalAccountBalance({ ...balances, accounts })
    return { saldo, opening: openingCents / 100, accounts }
}
