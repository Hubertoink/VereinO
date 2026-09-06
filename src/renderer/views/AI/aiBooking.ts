import type {
  TAiBookingAnalysisResult,
  TAiBookingCandidate,
  TAiJobsGetOutput
} from '../../../../electron/main/ipc/schemas'

export type PaymentAccountOption = {
  id: number
  name: string
  kind: 'CASH' | 'BANK' | 'PAYPAL' | 'CARD' | 'OTHER'
  color?: string | null
  isActive: number
}

export type BookingJobLike = {
  status?: string
  voucherId?: number | null
  result?: unknown
}

export function paymentMethodForAccount(kind?: string | null): TAiBookingCandidate['paymentMethod'] {
  if (kind === 'CASH') return 'BAR'
  if (kind === 'BANK' || kind === 'PAYPAL' || kind === 'CARD' || kind === 'OTHER') return 'BANK'
  return undefined
}

export function bookingAnalysisFromJob(job: BookingJobLike | null): TAiBookingAnalysisResult | null {
  const result = job?.result as TAiBookingAnalysisResult | undefined
  return result?.candidates?.length ? result : null
}

export function bookingAnalysis(job: TAiJobsGetOutput | null) {
  return bookingAnalysisFromJob(job)
}

export function isCandidateApproved(
  candidate?: TAiBookingCandidate | null,
  job?: BookingJobLike | null
) {
  if (!candidate) return false
  if (candidate.review?.status === 'APPROVED' || candidate.review?.voucherId) return true
  const analysis = bookingAnalysisFromJob(job || null)
  return job?.status === 'APPROVED' && analysis?.candidates?.length === 1 && !!job.voucherId
}

export function bookingProgress(job: BookingJobLike) {
  const analysis = bookingAnalysisFromJob(job)
  if (!analysis) return ''
  const approved = analysis.candidates.filter((candidate) => isCandidateApproved(candidate, job)).length
  return `${approved}/${analysis.candidates.length} gebucht`
}

export function hasOpenBookingCandidates(job: BookingJobLike) {
  if (job.status === 'APPROVED' || job.status === 'REJECTED') return false
  const analysis = bookingAnalysisFromJob(job)
  if (!analysis) return job.status !== 'APPROVED'
  return analysis.candidates.some((candidate) => !isCandidateApproved(candidate, job))
}

export function firstOpenCandidateIndex(job: BookingJobLike) {
  const analysis = bookingAnalysisFromJob(job)
  if (!analysis) return 0
  const index = analysis.candidates.findIndex((candidate) => !isCandidateApproved(candidate, job))
  return index >= 0 ? index : 0
}

export function candidateSourceLabel(candidate: TAiBookingCandidate) {
  return candidate.source?.label || candidate.source?.fileName || null
}

export function candidateSourceStateLabel(candidate: TAiBookingCandidate, job: TAiJobsGetOutput) {
  return isCandidateApproved(candidate, job) ? 'Gebucht' : 'Offen'
}
