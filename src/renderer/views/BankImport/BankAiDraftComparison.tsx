import React, { useEffect, useState } from 'react'
import { IconArrowRight, IconFileDescription, IconSparkles } from '@tabler/icons-react'
import type { BankBookingCandidate, BankTransaction } from '../../../../shared/bankAiBatch'

type Primary = Awaited<ReturnType<typeof window.api.classifications.primary.list>>
type NamedOption = { id: number; name: string }
const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })
const date = (value?: string | null) => value ? new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString('de-DE') : '–'

/** The preview uses the same classification IDs and bank direction as the booking form. */
export default function BankAiDraftComparison({ transaction, candidate }: {
  transaction: BankTransaction
  candidate: BankBookingCandidate | null | undefined
}) {
  const [primary, setPrimary] = useState<Primary | null>(null)
  const [loading, setLoading] = useState(true)
  const [budgets, setBudgets] = useState<NamedOption[]>([])
  const [bindings, setBindings] = useState<NamedOption[]>([])
  const [accounts, setAccounts] = useState<NamedOption[]>([])
  const hasBudgets = !!candidate?.budgets?.length
  const hasBindings = !!candidate?.earmarks?.length
  const accountId = candidate?.paymentAccountId ?? transaction.paymentAccountId

  useEffect(() => {
    let active = true
    setLoading(true)
    void Promise.allSettled([
      Promise.resolve().then(() => window.api.classifications.primary.list()),
      Promise.resolve().then(() => hasBudgets ? window.api.budgets.list() : { rows: [] }),
      Promise.resolve().then(() => hasBindings ? window.api.bindings.list() : { rows: [] }),
      Promise.resolve().then(() => accountId !== transaction.paymentAccountId ? window.api.paymentAccounts.list() : { rows: [] })
    ]).then(([classification, budgetData, bindingData, accountData]) => {
      if (!active) return
      setPrimary(classification.status === 'fulfilled' ? classification.value : null)
      setBudgets(budgetData.status === 'fulfilled' ? budgetData.value.rows.map(budget => ({ id: budget.id, name: budget.name || budget.categoryName || budget.projectName || `Budget ${budget.year} · #${budget.id}` })) : [])
      setBindings(bindingData.status === 'fulfilled' ? bindingData.value.rows : [])
      setAccounts(accountData.status === 'fulfilled' ? accountData.value.rows : [])
      setLoading(false)
    })
    return () => { active = false }
  }, [hasBudgets, hasBindings, accountId, transaction.paymentAccountId])

  const classification = primary?.values.find(value => candidate?.primaryClassificationValueId != null
    ? value.id === candidate.primaryClassificationValueId
    : primary.profile === 'NONPROFIT' && value.stableKey === candidate?.sphere)
  const accountName = accountId === transaction.paymentAccountId
    ? transaction.paymentAccountName : accounts.find(account => account.id === accountId)?.name || `Zahlkonto #${accountId}`
  const allocations = (items: Array<{ id: number; amount: number }>, options: NamedOption[], label: string) =>
    items.map((item, index) => <span className="bank-draft-allocation" key={`${item.id}-${index}`}>
      {options.find(option => option.id === item.id)?.name || `${label} #${item.id}`} <small>{euro.format(item.amount)}</small>
    </span>)

  return <div className="bank-draft-comparison">
    <section className="bank-draft-card" aria-label="Bankbeleg aus Import">
      <header className="bank-draft-card-heading">
        <span className="bank-draft-icon"><IconFileDescription size={21} aria-hidden="true" /></span>
        <div><h3>Bankbeleg (aus Import)</h3><p>Originaldaten aus deinem Bankkonto</p></div>
      </header>
      <dl>
        <div><dt>Datum</dt><dd>{date(transaction.bookingDate)}</dd></div>
        <div><dt>Gegenpartei</dt><dd>{transaction.counterparty || 'Ohne Gegenpartei'}</dd></div>
        <div><dt>Verwendungszweck</dt><dd>{transaction.purpose || '–'}</dd></div>
        <div><dt>Wertstellung</dt><dd>{date(transaction.valueDate)}</dd></div>
        <div><dt>Zahlkonto</dt><dd>{transaction.paymentAccountName}</dd></div>
        <div><dt>Bankreferenz</dt><dd>{transaction.bankReference || '–'}</dd></div>
        <div className="bank-draft-amount"><dt>{transaction.direction === 'IN' ? 'Eingang' : 'Ausgang'}</dt><dd>{euro.format(transaction.amount)}</dd></div>
      </dl>
    </section>
    <span className="bank-draft-arrow" aria-hidden="true"><IconArrowRight size={22} /></span>
    <section className="bank-draft-card bank-draft-card--proposal" aria-label="KI-Entwurf">
      <header className="bank-draft-card-heading">
        <span className="bank-draft-icon"><IconSparkles size={21} aria-hidden="true" /></span>
        <div><h3>KI-Entwurf (neue Buchung)</h3><p>Wird erst im Buchungsformular gespeichert</p></div>
      </header>
      {candidate ? <dl>
        <div><dt>Datum</dt><dd>{date(candidate.date)}</dd></div>
        <div><dt>Beschreibung</dt><dd>{candidate.description || 'Keine Beschreibung verfügbar'}</dd></div>
        <div className="bank-draft-amount"><dt>Betrag</dt><dd>{euro.format(candidate.grossAmount)}</dd></div>
        <div><dt>Zahlkonto</dt><dd>{accountName}</dd></div>
        <div><dt>Buchungsart</dt><dd><span className={`bank-draft-kind bank-draft-kind--${transaction.direction.toLowerCase()}`}>{transaction.direction === 'IN' ? 'Einnahme' : 'Ausgabe'}</span></dd></div>
        <div><dt>{primary?.definition.primaryLabel || 'Einordnung'}</dt><dd>{loading ? 'Wird geladen …' : classification?.name || (primary ? 'Im Buchungsformular auswählen' : 'Im Buchungsformular prüfen')}</dd></div>
        {hasBudgets && <div><dt>Budgets</dt><dd>{allocations(candidate.budgets!, budgets, 'Budget')}</dd></div>}
        {hasBindings && <div><dt>Zweckbindungen</dt><dd>{allocations(candidate.earmarks!, bindings, 'Zweckbindung')}</dd></div>}
        {!!candidate.tags?.length && <div><dt>Tags</dt><dd className="bank-draft-tags">{candidate.tags.map(tag => <span key={tag}>{tag}</span>)}</dd></div>}
        {!hasBudgets && !hasBindings && !candidate.tags?.length && <div><dt>Zuordnungen</dt><dd className="bank-draft-empty">Keine vorgeschlagen</dd></div>}
      </dl> : <p>Kein Buchungsentwurf verfügbar. Bitte die KI erneut prüfen lassen.</p>}
    </section>
  </div>
}
