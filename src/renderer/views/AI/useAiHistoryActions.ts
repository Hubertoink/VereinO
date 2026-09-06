import { useCallback } from 'react'
import type { TAiJobsGetOutput, TAiJobsListOutput } from '../../../../electron/main/ipc/schemas'
import type { Notify } from './aiViewTypes'

type HistoryJob = TAiJobsListOutput['rows'][number]

type Options = {
  selectedJobId: number | null
  selectJob: (job: TAiJobsGetOutput | null, candidateIndex?: number) => void
  loadJobs: () => Promise<void>
  notify: Notify
  setBusy: (busy: boolean) => void
}

export function useAiHistoryActions({
  selectedJobId,
  selectJob,
  loadJobs,
  notify,
  setBusy
}: Options) {
  const markHistoryJobDone = useCallback(
    async (job: HistoryJob) => {
      setBusy(true)
      try {
        await window.api.ai.jobs.reject({
          id: job.id,
          reason: 'Im KI-Verlauf als erledigt markiert.'
        })
        if (selectedJobId === job.id) selectJob(null)
        await loadJobs()
        notify('success', 'Buchungsreview als erledigt markiert.')
      } catch (error: any) {
        notify('error', error?.message || String(error))
      } finally {
        setBusy(false)
      }
    },
    [loadJobs, notify, selectJob, selectedJobId, setBusy]
  )

  const deleteHistoryJob = useCallback(
    async (job: HistoryJob) => {
      setBusy(true)
      try {
        await window.api.ai.jobs.delete({ id: job.id })
        if (selectedJobId === job.id) selectJob(null)
        await loadJobs()
        notify('success', 'KI-Auftrag gelöscht.')
      } catch (error: any) {
        notify('error', error?.message || String(error))
      } finally {
        setBusy(false)
      }
    },
    [loadJobs, notify, selectJob, selectedJobId, setBusy]
  )

  return { markHistoryJobDone, deleteHistoryJob }
}
