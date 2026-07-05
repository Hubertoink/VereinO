import type {
  TAiActionPlanInput,
  TAiActionPlanOutput,
  TAiAgentAutoRuleUpsertInput,
  TAiAgentAutoRulesListInput,
  TAiAgentAutoRulesListOutput,
  TAiAgentMemoryListInput,
  TAiAgentMemoryListOutput,
  TAiAgentMemoryUpsertInput,
  TAiAgentRunInput,
  TAiAgentRunOutput,
  TAiJobIdInput,
  TAiJobsApproveCandidateInput,
  TAiJobsApproveCandidateOutput,
  TAiJobsCreateInput,
  TAiJobsCreateOutput,
  TAiJobsDeleteOutput,
  TAiJobsGetOutput,
  TAiJobsListInput,
  TAiJobsListOutput,
  TAiJobsProcessOutput,
  TAiJobsRejectInput,
  TAiJobsUpdateCandidateInput,
  TAiBankImportReviewInput,
  TAiBankImportReviewOutput,
  TAiSettingsGetOutput,
  TAiSettingsSetInput,
  TAiSettingsSetOutput,
  TAiSettingsTestOutput,
  TAiTextGenerateInput,
  TAiTextGenerateOutput
} from '../../../electron/main/ipc/schemas'

export interface AiApi {
  ai: {
    settings: {
      get: () => Promise<TAiSettingsGetOutput>
      set: (payload: TAiSettingsSetInput) => Promise<TAiSettingsSetOutput>
      testConnection: () => Promise<TAiSettingsTestOutput>
    }
    jobs: {
      create: (payload: TAiJobsCreateInput) => Promise<TAiJobsCreateOutput>
      list: (payload?: TAiJobsListInput) => Promise<TAiJobsListOutput>
      get: (payload: TAiJobIdInput) => Promise<TAiJobsGetOutput>
      process: (payload: TAiJobIdInput) => Promise<TAiJobsProcessOutput>
      updateCandidate: (payload: TAiJobsUpdateCandidateInput) => Promise<TAiJobsGetOutput>
      approveCandidate: (payload: TAiJobsApproveCandidateInput) => Promise<TAiJobsApproveCandidateOutput>
      reject: (payload: TAiJobsRejectInput) => Promise<TAiJobsGetOutput>
      delete: (payload: TAiJobIdInput) => Promise<TAiJobsDeleteOutput>
    }
    text: {
      generate: (payload: TAiTextGenerateInput) => Promise<TAiTextGenerateOutput>
    }
    actions: {
      plan: (payload: TAiActionPlanInput) => Promise<TAiActionPlanOutput>
    }
    agent: {
      run: (payload: TAiAgentRunInput) => Promise<TAiAgentRunOutput>
      memory: {
        list: (payload?: TAiAgentMemoryListInput) => Promise<TAiAgentMemoryListOutput>
        upsert: (payload: TAiAgentMemoryUpsertInput) => Promise<TAiAgentMemoryListOutput['rows'][number]>
      }
      autoRules: {
        list: (payload?: TAiAgentAutoRulesListInput) => Promise<TAiAgentAutoRulesListOutput>
        upsert: (payload: TAiAgentAutoRuleUpsertInput) => Promise<TAiAgentAutoRulesListOutput['rows'][number]>
      }
    }
    bankImports: {
      reviewOpen: (payload?: TAiBankImportReviewInput) => Promise<TAiBankImportReviewOutput>
    }
  }
}
