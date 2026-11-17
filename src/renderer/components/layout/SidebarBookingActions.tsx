import type { ComponentProps } from 'react'
import { IconPlus } from '@tabler/icons-react'
import InvoiceBatchControl from '../InvoiceBatchControl'
import './sidebarBookingActions.css'

type Props = Omit<ComponentProps<typeof InvoiceBatchControl>, 'variant'> & { onNewBooking: () => void }

export function SidebarBookingActions({ onNewBooking, ...invoiceProps }: Props) {
  return <div className="sidebar-booking-actions" role="group" aria-label="Buchungsaktionen">
    <button className="btn ghost sidebar-booking-new" type="button" onClick={onNewBooking} aria-label="Buchung erstellen" title="Buchung erstellen">
      <IconPlus size={20} aria-hidden="true" /><span>Buchung erstellen</span>
    </button>
    <InvoiceBatchControl {...invoiceProps} variant="sidebar" />
  </div>
}
