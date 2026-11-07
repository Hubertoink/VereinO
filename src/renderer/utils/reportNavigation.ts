import type { ReportBookingSource } from '../../../shared/aiReporting'

/** Shared drill-down for dashboard reports and agent messages. */
export function openReportBookings(source: ReportBookingSource) {
  window.dispatchEvent(
    new CustomEvent('apply-voucher-jump', {
      detail: { from: source.from, to: source.to, type: source.type }
    })
  )
}
