import type {
    TActivityReportDeleteInput,
    TActivityReportDeleteOutput,
    TActivityReportGetInput,
    TActivityReportGetOutput,
    TActivityReportListInput,
    TActivityReportListOutput,
    TActivityReportSaveInput,
    TActivityReportSaveOutput,
    TDonationsExportMoneyReceiptInput,
    TDonationsExportMoneyReceiptOutput,
    TFiscalReportInput,
    TReportsCashBalanceInput,
    TReportsCashBalanceOutput,
    TReportsExportInput,
    TReportsExportOutput,
    TReportsMonthlyInput,
    TReportsMonthlyOutput,
    TReportsSummaryInput,
    TReportsSummaryOutput,
    TReportsYearsOutput,
    TTaxExemptionDeleteOutput,
    TTaxExemptionGetOutput,
    TTaxExemptionSaveInput,
    TTaxExemptionSaveOutput,
    TTaxExemptionUpdateValidityInput,
    TTaxExemptionUpdateValidityOutput,
    TTreasurerReportInput
} from '../../../electron/main/ipc/schemas'

export interface ReportsApi {
    reports: {
        export: (payload: TReportsExportInput) => Promise<TReportsExportOutput>
        exportFiscal: (payload: TFiscalReportInput) => Promise<{ filePath: string }>
        exportTreasurer: (payload: TTreasurerReportInput) => Promise<{ filePath: string }>
        summary: (payload: TReportsSummaryInput) => Promise<TReportsSummaryOutput>
        monthly: (payload: TReportsMonthlyInput) => Promise<TReportsMonthlyOutput>
        daily: (payload: TReportsMonthlyInput) => Promise<{
            buckets: Array<{ date: string; net: number; vat: number; gross: number }>
        }>
        cashBalance: (payload: TReportsCashBalanceInput) => Promise<TReportsCashBalanceOutput>
        years: () => Promise<TReportsYearsOutput>
    }
    activityReports: {
        list: (payload?: TActivityReportListInput) => Promise<TActivityReportListOutput>
        get: (payload: TActivityReportGetInput) => Promise<TActivityReportGetOutput>
        save: (payload: TActivityReportSaveInput) => Promise<TActivityReportSaveOutput>
        delete: (payload: TActivityReportDeleteInput) => Promise<TActivityReportDeleteOutput>
    }
    taxExemption: {
        get: () => Promise<TTaxExemptionGetOutput>
        save: (payload: TTaxExemptionSaveInput) => Promise<TTaxExemptionSaveOutput>
        delete: () => Promise<TTaxExemptionDeleteOutput>
        updateValidity: (payload: TTaxExemptionUpdateValidityInput) => Promise<TTaxExemptionUpdateValidityOutput>
    }
    donations: {
        exportMoneyReceipt: (payload: TDonationsExportMoneyReceiptInput) => Promise<TDonationsExportMoneyReceiptOutput>
    }
}
