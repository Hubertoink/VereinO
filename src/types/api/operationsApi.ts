import type {
    TAdvanceCreateInput,
    TAdvanceCreateOutput,
    TAdvanceDeleteInput,
    TAdvanceDeleteOutput,
    TAdvanceGetInput,
    TAdvanceGetOutput,
    TAdvancePurchaseCreateInput,
    TAdvancePurchaseCreateOutput,
    TAdvancePurchaseDeleteInput,
    TAdvancePurchaseDeleteOutput,
    TAdvancePurchaseUpdateInput,
    TAdvancePurchaseUpdateOutput,
    TAdvanceResolveInput,
    TAdvanceResolveOutput,
    TAdvancesListInput,
    TAdvancesListOutput,
    TAdvanceSettleInput,
    TAdvanceSettleOutput,
    TSubmissionApproveInput,
    TSubmissionApproveOutput,
    TSubmissionAttachmentReadInput,
    TSubmissionAttachmentReadOutput,
    TSubmissionConvertInput,
    TSubmissionConvertOutput,
    TSubmissionDeleteInput,
    TSubmissionDeleteOutput,
    TSubmissionGetInput,
    TSubmissionGetOutput,
    TSubmissionRejectInput,
    TSubmissionRejectOutput,
    TSubmissionsExportCatalogOutput,
    TSubmissionsImportInput,
    TSubmissionsImportOutput,
    TSubmissionsListInput,
    TSubmissionsListOutput,
    TSubmissionsSummaryOutput
} from '../../../electron/main/ipc/schemas'

export interface OperationsApi {
    advances: {
        list: (payload?: TAdvancesListInput) => Promise<TAdvancesListOutput>
        create: (payload: TAdvanceCreateInput) => Promise<TAdvanceCreateOutput>
        get: (payload: TAdvanceGetInput) => Promise<TAdvanceGetOutput>
        settle: (payload: TAdvanceSettleInput) => Promise<TAdvanceSettleOutput>
        delete: (payload: TAdvanceDeleteInput) => Promise<TAdvanceDeleteOutput>
        purchases: {
            create: (payload: TAdvancePurchaseCreateInput) => Promise<TAdvancePurchaseCreateOutput>
            update: (payload: TAdvancePurchaseUpdateInput) => Promise<TAdvancePurchaseUpdateOutput>
            delete: (payload: TAdvancePurchaseDeleteInput) => Promise<TAdvancePurchaseDeleteOutput>
        }
        resolve: (payload: TAdvanceResolveInput) => Promise<TAdvanceResolveOutput>
    }
    submissions: {
        list: (payload?: TSubmissionsListInput) => Promise<TSubmissionsListOutput>
        get: (payload: TSubmissionGetInput) => Promise<TSubmissionGetOutput>
        import: (payload: TSubmissionsImportInput) => Promise<TSubmissionsImportOutput>
        importFromFile: () => Promise<TSubmissionsImportOutput>
        exportCatalog: () => Promise<TSubmissionsExportCatalogOutput>
        approve: (payload: TSubmissionApproveInput) => Promise<TSubmissionApproveOutput>
        reject: (payload: TSubmissionRejectInput) => Promise<TSubmissionRejectOutput>
        delete: (payload: TSubmissionDeleteInput) => Promise<TSubmissionDeleteOutput>
        convert: (payload: TSubmissionConvertInput) => Promise<TSubmissionConvertOutput>
        summary: () => Promise<TSubmissionsSummaryOutput>
        readAttachment: (payload: TSubmissionAttachmentReadInput) => Promise<TSubmissionAttachmentReadOutput | null>
    }
}
