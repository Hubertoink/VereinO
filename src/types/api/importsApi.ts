import type {
    TImportAnalyzeInput,
    TImportAnalyzeOutput,
    TImportCommitDraftInput,
    TImportCreateMissingInput,
    TImportCreateMissingOutput,
    TImportEditableExportOutput,
    TImportExecuteInput,
    TImportExecuteOutput,
    TImportPreviewInput,
    TImportPreviewOutput,
    TImportTemplateOutput,
    TImportTestDataOutput
} from '../../../electron/main/ipc/schemas'

export interface ImportsApi {
    imports: {
        preview: (payload: TImportPreviewInput) => Promise<TImportPreviewOutput>
        execute: (payload: TImportExecuteInput) => Promise<TImportExecuteOutput>
        analyze: (payload: TImportAnalyzeInput) => Promise<TImportAnalyzeOutput>
        commitDraft: (payload: TImportCommitDraftInput) => Promise<TImportExecuteOutput>
        createMissing: (payload: TImportCreateMissingInput) => Promise<TImportCreateMissingOutput>
        template: () => Promise<TImportTemplateOutput>
        testdata: () => Promise<TImportTestDataOutput>
        editableExport: () => Promise<TImportEditableExportOutput>
    }
}
