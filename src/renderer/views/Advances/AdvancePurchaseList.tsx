import React from 'react'
import { IconArrowDown, IconArrowUp, IconPaperclip, IconPencil, IconTrash, IconWallet, IconTargetArrow } from '@tabler/icons-react'
import { IconBank, IconCash, IconPayPal } from '../../utils/icons'
import { getContrastTextColor, resolveTagDisplayColor } from '../../utils/tagColors'
import type { AdvanceDetail } from './AdvancesView'

type Purchase = NonNullable<AdvanceDetail['purchases']>[number]
type Props = {
  purchases: Purchase[]
  budgets: Array<{ id: number; label: string; color?: string | null }>
  earmarks: Array<{ id: number; code: string; name: string; color?: string | null }>
  tagDefs: Array<{ name: string; color?: string | null }>
  categories: Array<{ id: number; name: string; color?: string | null }>
  generalProfile: boolean
  editable: boolean
  onEdit: (purchase: Purchase) => void
  onDelete: (id: number) => void
  fmtDate: (date: string) => string
}
const money = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', signDisplay: 'exceptZero' })
const sphereLabels = { IDEELL: 'Ideell', ZWECK: 'Zweckbetrieb', VERMOEGEN: 'Vermögen', WGB: 'Wirtschaftlich' }
const badgeStyle = (color?: string | null): React.CSSProperties | undefined => color ? { background: color, color: getContrastTextColor(color) } : undefined

export default function AdvancePurchaseList({ purchases, budgets, earmarks, tagDefs, categories, generalProfile, editable, onEdit, onDelete, fmtDate }: Props) {
  return <div className="advance-purchases" aria-label="Buchungen zum Vorschuss">
    {purchases.map(purchase => {
      const date = new Date(`${purchase.date.slice(0, 10)}T12:00:00`)
      const category = categories.find(item => item.id === purchase.primaryClassificationValueId)
      const PaymentIcon = purchase.paymentAccountKind === 'PAYPAL' ? IconPayPal : purchase.paymentAccountKind === 'CASH' || purchase.paymentMethod === 'BAR' ? IconCash : IconBank
      return <article className="advance-purchase" key={purchase.id}>
        <time className="advance-purchase-date" dateTime={purchase.date} title={fmtDate(purchase.date)}><strong>{date.getDate()}</strong><span>{date.toLocaleDateString('de-DE', { month: 'short' })}</span><span>{date.getFullYear()}</span></time>
        <span className={`advance-purchase-kind ${purchase.type === 'IN' ? 'is-income' : 'is-expense'}`} title={purchase.type === 'IN' ? 'Einnahme' : 'Ausgabe'}>{purchase.type === 'IN' ? <IconArrowDown size={20} /> : <IconArrowUp size={20} />}</span>
        <div className="advance-purchase-copy"><strong>{purchase.description || 'Ohne Beschreibung'}</strong>
          {purchase.voucherNo && <span className="helper">{purchase.voucherNo}</span>}
          <div className="advance-purchase-badges">
            <span className="advance-purchase-badge" style={generalProfile ? badgeStyle(category?.color) : undefined}>{generalProfile ? category?.name || 'Ohne Kategorie' : sphereLabels[purchase.sphere]}</span>
            <span className={`advance-purchase-badge ${purchase.voucherId ? 'is-posted' : 'is-draft'}`}>{purchase.voucherId ? 'Gebucht' : 'Entwurf'}</span>
            {(purchase.tags || []).map(name => <span key={name} className="advance-purchase-badge" style={badgeStyle(resolveTagDisplayColor(name, tagDefs))}>{name}</span>)}
            {(purchase.budgets || []).map(item => { const budget = budgets.find(b => b.id === item.budgetId); return <span key={item.budgetId} className="advance-purchase-badge" title="Budget" style={badgeStyle(budget?.color)}><IconWallet size={12} />{budget?.label || `Budget #${item.budgetId}`}</span> })}
            {(purchase.earmarks || []).map(item => { const earmark = earmarks.find(e => e.id === item.earmarkId); return <span key={item.earmarkId} className="advance-purchase-badge" title={earmark?.name || 'Zweckbindung'} style={badgeStyle(earmark?.color)}><IconTargetArrow size={12} />{earmark?.code || `Zweckbindung #${item.earmarkId}`}</span> })}
          </div>
        </div>
        <div className="advance-purchase-payment"><span className="advance-payment-badge" style={{ borderColor: purchase.paymentAccountColor || undefined }}><PaymentIcon size={14} color={purchase.paymentAccountColor || undefined} /><span>{purchase.paymentAccountName || (purchase.paymentMethod === 'BAR' ? 'Bar' : purchase.paymentMethod === 'BANK' ? 'Bank' : 'Ohne Zahlweg')}</span></span>{!!purchase.files?.length && <span className="advance-purchase-files" title={`${purchase.files.length} Anhänge`}><IconPaperclip size={13} />{purchase.files.length}</span>}</div>
        <strong className={`advance-purchase-amount ${purchase.type === 'IN' ? 'is-income' : 'is-expense'}`}>{money.format(purchase.grossAmount * (purchase.type === 'IN' ? 1 : -1))}</strong>
        <div className="advance-purchase-actions">{editable && !purchase.voucherId && <><button className="btn ghost" type="button" aria-label="Buchung bearbeiten" title="Bearbeiten" onClick={() => onEdit(purchase)}><IconPencil size={16} /></button><button className="btn ghost danger" type="button" aria-label="Buchung entfernen" title="Entfernen" onClick={() => onDelete(purchase.id)}><IconTrash size={16} /></button></>}</div>
      </article>
    })}
  </div>
}
