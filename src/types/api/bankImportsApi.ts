import type {
  TBankImportCommitInput,
  TBankImportCommitOutput,
  TBankImportStatusOutput,
  TBankImportPreviewInput,
  TBankImportPreviewOutput,
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
  }
  bankTransactions: {
    list: (payload?: TBankTransactionsListInput) => Promise<TBankTransactionsListOutput>
    importStatus: () => Promise<TBankImportStatusOutput>
    get: (payload: TBankTransactionIdInput) => Promise<TBankTransactionOutput>
    matches: (payload: TBankTransactionMatchesInput) => Promise<TBankTransactionMatchesOutput>
    link: (payload: TBankTransactionLinkInput) => Promise<TBankTransactionOutput>
    check: (payload: TBankTransactionCheckInput) => Promise<TBankTransactionOutput>
    reopen: (payload: TBankTransactionIdInput) => Promise<TBankTransactionOutput>
  }
}
