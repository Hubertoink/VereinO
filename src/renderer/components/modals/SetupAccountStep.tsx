import { useId, useState } from 'react'
import AccountOpeningFields from '../common/AccountOpeningFields'
import { openingDraft, openingHint } from '../../utils/accountOpening'
import type { SetupAccount } from './setupAccounts'

const kinds = { CASH: 'Bargeld', BANK: 'Bank', PAYPAL: 'PayPal', CARD: 'Karte', OTHER: 'Sonstiges' }

export default function SetupAccountStep({ accounts, onChange }: { accounts: SetupAccount[]; onChange: (value: SetupAccount[]) => void }) {
  const id = useId()
  const [name, setName] = useState('')
  const [kind, setKind] = useState<SetupAccount['kind']>('BANK')
  const normalized = name.trim().toLocaleLowerCase('de')
  const duplicate = accounts.some(account => account.name.trim().toLocaleLowerCase('de') === normalized)
  const update = (account: SetupAccount, change: Partial<SetupAccount>) => onChange(accounts.map(row => row === account ? { ...row, ...change } : row))
  function add() {
    if (!normalized || duplicate) return
    onChange([...accounts, { name: name.trim(), kind, selected: true, opening: openingDraft({}) }])
    setName('')
  }
  return <>
    <fieldset className="setup-account-choices"><legend>Zahlungskonten auswählen</legend>
      <div className="setup-tag-options">{accounts.map(account => <label key={account.existing?.id ?? `new-${account.name}`}>
        <input type="checkbox" checked={account.selected} disabled={!!(account.existing?.isActive && (account.existing.bookingCount || account.existing.openingCents))}
          onChange={e => update(account, { selected: e.target.checked })} />
        <span>{account.name}</span>
      </label>)}</div>
    </fieldset>
    <div className="setup-custom-account">
      <label className="field" htmlFor={id}>Eigenes Konto<input className="input" id={id} value={name} placeholder="z. B. Veranstaltungskasse" onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add() } }} /></label>
      <label className="field">Kontotyp<select className="input" value={kind} onChange={e => setKind(e.target.value as SetupAccount['kind'])}>{Object.entries(kinds).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label>
      <button type="button" className="btn" disabled={!normalized || duplicate} onClick={add}>Hinzufügen</button>
    </div>
    {duplicate && <span className="helper">Dieses Konto steht bereits oben zur Auswahl.</span>}
    {accounts.some(account => account.selected) && <section className="setup-account-openings">
      <h3>Anfangsbestände <span className="setup-optional">Optional</span></h3><p className="setup-note">{openingHint}</p>
      {accounts.filter(account => account.selected).map(account => <fieldset key={account.existing?.id ?? `new-${account.name}`}><legend>{account.name}</legend>
        <AccountOpeningFields value={account.opening} onChange={opening => update(account, { opening })} />
      </fieldset>)}
    </section>}
  </>
}
