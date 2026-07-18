import type {
    TAttachmentAddInput,
    TAttachmentAddOutput,
    TAttachmentDeleteInput,
    TAttachmentDeleteOutput,
    TAttachmentOpenInput,
    TAttachmentOpenOutput,
    TAttachmentReadInput,
    TAttachmentReadOutput,
    TAttachmentSaveAsInput,
    TAttachmentSaveAsOutput,
    TAttachmentsListInput,
    TAttachmentsListOutput,
    TAuditRecentInput,
    TAuditRecentOutput,
    TBindingDeleteInput,
    TBindingDeleteOutput,
    TBindingListInput,
    TBindingListOutput,
    TBindingUpsertInput,
    TBindingUpsertOutput,
    TBindingUsageInput,
    TBindingUsageOutput,
    TBudgetDeleteInput,
    TBudgetDeleteOutput,
    TBudgetListInput,
    TBudgetListOutput,
    TBudgetUpsertInput,
    TBudgetUpsertOutput,
    TBudgetUsageInput,
    TBudgetUsageOutput,
    TCashChecksCreateInput,
    TCashChecksCreateOutput,
    TCashChecksExportPdfInput,
    TCashChecksExportPdfOutput,
    TCashChecksGetInspectorDefaultsOutput,
    TCashChecksListInput,
    TCashChecksListOutput,
    TCashChecksSetInspectorsInput,
    TCashChecksSetInspectorsOutput,
    TPaymentAccountDeleteInput,
    TPaymentAccountDeleteOutput,
    TPaymentAccountsListInput,
    TPaymentAccountsListOutput,
    TPaymentAccountUpsertInput,
    TPaymentAccountUpsertOutput,
    TPartiesListInput,
    TPartiesListOutput,
    TPartyGetInput,
    TPartyGetOutput,
    TPartyUpsertInput,
    TPartyUpsertOutput,
    TPartyArchiveInput,
    TPartyArchiveOutput,
    TTagDeleteInput,
    TTagDeleteOutput,
    TTagsListInput,
    TTagsListOutput,
    TTagUpsertInput,
    TTagUpsertOutput,
    TVoucherCreateInput,
    TVoucherCreateOutput,
    TVoucherDeleteInput,
    TVoucherDeleteOutput,
    TVoucherMetaUpdateInput,
    TVoucherReverseInput,
    TVoucherReverseOutput,
    TVouchersBatchAssignBudgetInput,
    TVouchersBatchAssignBudgetOutput,
    TVouchersBatchAssignEarmarkInput,
    TVouchersBatchAssignEarmarkOutput,
    TVouchersBatchAssignTagsInput,
    TVouchersBatchAssignTagsOutput,
    TVouchersClearAllOutput,
    TVouchersListInput,
    TVouchersListOutput,
    TVouchersRecentInput,
    TVouchersRecentOutput,
    TVoucherUpdateInput,
    TVoucherUpdateOutput,
    TYearEndCloseInput,
    TYearEndCloseOutput,
    TYearEndExportInput,
    TYearEndExportOutput,
    TYearEndPreviewInput,
    TYearEndPreviewOutput,
    TYearEndReopenInput,
    TYearEndReopenOutput,
    TYearEndStatusOutput
} from '../../../electron/main/ipc/schemas'

export interface FinanceApi {
    vouchers: {
        create: (payload: TVoucherCreateInput) => Promise<TVoucherCreateOutput>
        reverse: (payload: TVoucherReverseInput) => Promise<TVoucherReverseOutput>
        list: (payload?: TVouchersListInput) => Promise<TVouchersListOutput>
        recent: (payload?: TVouchersRecentInput) => Promise<TVouchersRecentOutput>
        update: (payload: TVoucherUpdateInput) => Promise<TVoucherUpdateOutput>
        updateMeta: (payload: TVoucherMetaUpdateInput) => Promise<TVoucherUpdateOutput>
        delete: (payload: TVoucherDeleteInput) => Promise<TVoucherDeleteOutput>
        batchAssignEarmark: (payload: TVouchersBatchAssignEarmarkInput) => Promise<TVouchersBatchAssignEarmarkOutput>
        batchAssignBudget: (payload: TVouchersBatchAssignBudgetInput) => Promise<TVouchersBatchAssignBudgetOutput>
        batchAssignTags: (payload: TVouchersBatchAssignTagsInput) => Promise<TVouchersBatchAssignTagsOutput>
        clearAll: () => Promise<TVouchersClearAllOutput>
    }
    paymentAccounts: {
        list: (payload?: TPaymentAccountsListInput) => Promise<TPaymentAccountsListOutput>
        upsert: (payload: TPaymentAccountUpsertInput) => Promise<TPaymentAccountUpsertOutput>
        delete: (payload: TPaymentAccountDeleteInput) => Promise<TPaymentAccountDeleteOutput>
    }
    parties: {
        list: (payload?: TPartiesListInput) => Promise<TPartiesListOutput>
        get: (payload: TPartyGetInput) => Promise<TPartyGetOutput>
        upsert: (payload: TPartyUpsertInput) => Promise<TPartyUpsertOutput>
        archive: (payload: TPartyArchiveInput) => Promise<TPartyArchiveOutput>
    }
    tags: {
        list: (payload?: TTagsListInput) => Promise<TTagsListOutput>
        upsert: (payload: TTagUpsertInput) => Promise<TTagUpsertOutput>
        delete: (payload: TTagDeleteInput) => Promise<TTagDeleteOutput>
        usage: (payload: { tagId: number }) => Promise<{ inflow: number; spent: number; balance: number; count: number }>
    }
    audit: {
        recent: (payload?: TAuditRecentInput) => Promise<TAuditRecentOutput>
    }
    yearEnd: {
        preview: (payload: TYearEndPreviewInput) => Promise<TYearEndPreviewOutput>
        export: (payload: TYearEndExportInput) => Promise<TYearEndExportOutput>
        close: (payload: TYearEndCloseInput) => Promise<TYearEndCloseOutput>
        reopen: (payload: TYearEndReopenInput) => Promise<TYearEndReopenOutput>
        status: () => Promise<TYearEndStatusOutput>
    }
    cashChecks: {
        list: (payload: TCashChecksListInput) => Promise<TCashChecksListOutput>
        create: (payload: TCashChecksCreateInput) => Promise<TCashChecksCreateOutput>
        setInspectors: (payload: TCashChecksSetInspectorsInput) => Promise<TCashChecksSetInspectorsOutput>
        exportPdf: (payload: TCashChecksExportPdfInput) => Promise<TCashChecksExportPdfOutput>
        getInspectorDefaults: () => Promise<TCashChecksGetInspectorDefaultsOutput>
    }
    bindings: {
        list: (payload?: TBindingListInput) => Promise<TBindingListOutput>
        upsert: (payload: TBindingUpsertInput) => Promise<TBindingUpsertOutput>
        delete: (payload: TBindingDeleteInput) => Promise<TBindingDeleteOutput>
        usage: (payload: TBindingUsageInput) => Promise<TBindingUsageOutput>
    }
    budgets: {
        upsert: (payload: TBudgetUpsertInput) => Promise<TBudgetUpsertOutput>
        list: (payload?: TBudgetListInput) => Promise<TBudgetListOutput>
        delete: (payload: TBudgetDeleteInput) => Promise<TBudgetDeleteOutput>
        usage: (payload: TBudgetUsageInput) => Promise<TBudgetUsageOutput>
    }
    attachments: {
        list: (payload: TAttachmentsListInput) => Promise<TAttachmentsListOutput>
        open: (payload: TAttachmentOpenInput) => Promise<TAttachmentOpenOutput>
        saveAs: (payload: TAttachmentSaveAsInput) => Promise<TAttachmentSaveAsOutput>
        read: (payload: TAttachmentReadInput) => Promise<TAttachmentReadOutput>
        add: (payload: TAttachmentAddInput) => Promise<TAttachmentAddOutput>
        delete: (payload: TAttachmentDeleteInput) => Promise<TAttachmentDeleteOutput>
    }
}
