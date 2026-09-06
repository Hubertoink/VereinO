import { useCallback, useState } from 'react'
import type { TAiJobsGetOutput, TAiJobsListOutput } from '../../../../electron/main/ipc/schemas'
import { firstOpenCandidateIndex } from './aiBooking'
import type { Notify } from './aiViewTypes'

export function useAiJobs(notify: Notify, initialJobId?: number | null, initialCandidate = 0) {
  const [jobs, setJobs] = useState<TAiJobsListOutput['rows']>([])
  const [selectedJob, setSelectedJob] = useState<TAiJobsGetOutput | null>(null)
  const [selectedJobId, setSelectedJobId] = useState<number | null>(initialJobId || null)
  const [selectedCandidate, setSelectedCandidate] = useState(initialCandidate)

  const loadJobs = useCallback(async () => {
    try {
      const result = await window.api.ai.jobs.list({ limit: 100 })
      setJobs(result.rows)
    } catch (error: any) {
      notify('error', error?.message || String(error))
    }
  }, [notify])

  const selectJob = useCallback((job: TAiJobsGetOutput | null, candidateIndex?: number) => {
    setSelectedJob(job)
    setSelectedJobId(job?.id || null)
    if (candidateIndex !== undefined) setSelectedCandidate(candidateIndex)
    else if (job) setSelectedCandidate(firstOpenCandidateIndex(job))
    else setSelectedCandidate(0)
  }, [])

  return {
    jobs,
    selectedJob,
    setSelectedJob,
    selectedJobId,
    setSelectedJobId,
    selectedCandidate,
    setSelectedCandidate,
    loadJobs,
    selectJob
  }
}
