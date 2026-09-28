type BookingView = 'classic' | 'plus'
type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem'>

/** Claim the former global preference once, without copying it into every organization. */
export function resolveOrganizationBookingView(orgId: string, saved: unknown, storage: PreferenceStorage): BookingView {
  try {
    const ownerKey = 'ui.bookingView.migratedOrg'
    const owner = storage.getItem(ownerKey)
    if (!owner) storage.setItem(ownerKey, orgId)
    if (saved === 'classic' || saved === 'plus') return saved
    if (owner && owner !== orgId) return 'classic'
    return storage.getItem('ui.bookingView') === 'plus' ? 'plus' : 'classic'
  } catch {
    return saved === 'plus' ? 'plus' : 'classic'
  }
}
