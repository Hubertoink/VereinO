import type {
  TBankImportCommitInput,
  TBankImportCommitOutput,
  TBankImportStatusOutput,
  TBankImportHistoryInput,
  TBankImportHistoryOutput,
  TBankImportPreviewInput,
  TBankImportPreviewOutput,
  TBankImportRemapPreviewInput,
  TBankImportRemapPreviewOutput,
  TBankImportRemapApplyInput,
  TBankImportRemapApplyOutput,
  TBankTransactionCheckInput,
  TBankTransactionIdInput,
  TBankTransactionLinkInput,
  TBankTransactionMatchesInput,
  TBankTransactionMatchesOutput,
  TBankTransactionOutput,
  TBankTransactionsListInput,
  TBankTransactionsListOutput
} from '../../../electron/main/ipc/schemas'

export interface BankImportsApi {
  bankImports: {
    preview: (payload: TBankImportPreviewInput) => Promise<TBankImportPreviewOutput>
    commit: (payload: TBankImportCommitInput) => Promise<TBankImportCommitOutput>
    remapPreview: (payload: TBankImportRemapPreviewInput) => Promise<TBankImportRemapPreviewOutput>
    remapApply: (payload: TBankImportRemapApplyInput) => Promise<TBankImportRemapApplyOutput>
  }
  bankTransactions: {
    list: (payload?: TBankTransactionsListInput) => Promise<TBankTransactionsListOutput>
    importStatus: () => Promise<TBankImportStatusOutput>
    importHistory: (payload?: TBankImportHistoryInput) => Promise<TBankImportHistoryOutput>
    get: (payload: TBankTransactionIdInput) => Promise<TBankTransactionOutput>
    matches: (payload: TBankTransactionMatchesInput) => Promise<TBankTransactionMatchesOutput>
    link: (payload: TBankTransactionLinkInput) => Promise<TBankTransactionOutput>
    check: (payload: TBankTransactionCheckInput) => Promise<TBankTransactionOutput>
    reopen: (payload: TBankTransactionIdInput) => Promise<TBankTransactionOutput>
  }
}
