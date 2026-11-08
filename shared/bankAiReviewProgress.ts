export type BankAiReviewProgress = {
  requestId: string
  phase: 'preparing' | 'analyzing' | 'validating' | 'complete'
  transactionIds: number[]
  activeIds: number[]
  completedIds: number[]
}

export type BankAiAnalysisProgress = Pick<BankAiReviewProgress, 'activeIds' | 'completedIds'>
