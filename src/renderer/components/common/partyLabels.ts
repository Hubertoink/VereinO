import type { TPartyRole } from '../../../../electron/main/ipc/schemas'

export const PARTY_ROLE_LABELS: Record<TPartyRole, string> = {
  SUPPLIER: 'Lieferant',
  CUSTOMER: 'Kunde',
  BOTH: 'Lieferant & Kunde',
  OTHER: 'Sonstiger Partner'
}
