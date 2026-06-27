import type {
    TAttachmentOpenInput,
    TAttachmentOpenOutput,
    TAttachmentReadInput,
    TAttachmentReadOutput,
    TAttachmentSaveAsInput,
    TAttachmentSaveAsOutput,
    TInvoiceAddPaymentInput,
    TInvoiceAddPaymentOutput,
    TInvoiceByIdInput,
    TInvoiceByIdOutput,
    TInvoiceCreateInput,
    TInvoiceCreateOutput,
    TInvoiceDeleteInput,
    TInvoiceDeleteOutput,
    TInvoiceFileAddInput,
    TInvoiceFileAddOutput,
    TInvoiceFileDeleteInput,
    TInvoiceFileDeleteOutput,
    TInvoiceFilesListInput,
    TInvoiceFilesListOutput,
    TInvoicePostToVoucherInput,
    TInvoicePostToVoucherOutput,
    TInvoicesListInput,
    TInvoicesListOutput,
    TInvoicesSummaryInput,
    TInvoicesSummaryOutput,
    TInvoiceUpdateInput,
    TInvoiceUpdateOutput
} from '../../../electron/main/ipc/schemas'

export interface InvoicesApi {
    invoices: {
        create: (payload: TInvoiceCreateInput) => Promise<TInvoiceCreateOutput>
        update: (payload: TInvoiceUpdateInput) => Promise<TInvoiceUpdateOutput>
        delete: (payload: TInvoiceDeleteInput) => Promise<TInvoiceDeleteOutput>
        list: (payload?: TInvoicesListInput) => Promise<TInvoicesListOutput>
        summary: (payload?: TInvoicesSummaryInput) => Promise<TInvoicesSummaryOutput>
        get: (payload: TInvoiceByIdInput) => Promise<TInvoiceByIdOutput>
        addPayment: (payload: TInvoiceAddPaymentInput) => Promise<TInvoiceAddPaymentOutput>
        markPaid: (payload: TInvoiceByIdInput) => Promise<TInvoiceAddPaymentOutput>
        postToVoucher: (payload: TInvoicePostToVoucherInput) => Promise<TInvoicePostToVoucherOutput>
    }
    invoiceFiles: {
        open: (payload: TAttachmentOpenInput) => Promise<TAttachmentOpenOutput>
        saveAs: (payload: TAttachmentSaveAsInput) => Promise<TAttachmentSaveAsOutput>
        read: (payload: TAttachmentReadInput) => Promise<TAttachmentReadOutput>
        list: (payload: TInvoiceFilesListInput) => Promise<TInvoiceFilesListOutput>
        add: (payload: TInvoiceFileAddInput) => Promise<TInvoiceFileAddOutput>
        delete: (payload: TInvoiceFileDeleteInput) => Promise<TInvoiceFileDeleteOutput>
    }
}
