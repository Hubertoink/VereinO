export function selectAiDraftBookingType<T extends { type?: string }>(qa: T): T & { bookingTypeSelected: boolean } {
  return {
    ...qa,
    bookingTypeSelected: qa.type === 'IN' || qa.type === 'OUT' || qa.type === 'TRANSFER' || qa.type === 'INTERNAL'
  }
}
