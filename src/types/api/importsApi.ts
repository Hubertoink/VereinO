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
import type { z } from 'zod'
import type { AiImportCreateSchema, AiImportFileSchema, AiImportIdentitySchema, AiImportSaveSchema, AiImportSession, AiImportPreview } from '../../../shared/aiImport'

export interface ImportsApi {
    imports: {
        aiDelete: (payload: { id: string }) => Promise<{ deleted: boolean }>
        aiReview: (payload: z.input<typeof AiImportSaveSchema>) => Promise<AiImportSession>
        aiPreview: (payload: z.input<typeof AiImportFileSchema>) => Promise<AiImportPreview>
        aiCreate: (payload: z.input<typeof AiImportCreateSchema>) => Promise<AiImportSession>
        aiGet: (payload: { id: string }) => Promise<AiImportSession>
        aiList: () => Promise<Array<Pick<AiImportSession, 'id' | 'fileName' | 'status' | 'updatedAt' | 'imported'>>>
        aiStart: (payload: z.input<typeof AiImportIdentitySchema>) => Promise<AiImportSession>
        aiCancel: (payload: z.input<typeof AiImportIdentitySchema>) => Promise<AiImportSession>
        aiSave: (payload: z.input<typeof AiImportSaveSchema>) => Promise<AiImportSession>
        aiCommit: (payload: z.input<typeof AiImportIdentitySchema>) => Promise<AiImportSession>
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
