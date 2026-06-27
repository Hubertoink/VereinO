import type { RendererApi } from '../../../types/api'

type ResultOf<Method extends (...args: never[]) => Promise<unknown>> =
  Awaited<ReturnType<Method>>

type VoucherApi = RendererApi['vouchers']
type MemberApi = RendererApi['members']
type AttachmentApi = RendererApi['attachments']
type BindingApi = RendererApi['bindings']
type BudgetApi = RendererApi['budgets']
type TagApi = RendererApi['tags']
type PaymentApi = RendererApi['payments']

export type VoucherListParams = { year?: number; page?: number; limit?: number }
export type VoucherListResult = ResultOf<VoucherApi['list']>
export type VoucherRecentInput = NonNullable<Parameters<VoucherApi['recent']>[0]>
export type VoucherRecentResult = ResultOf<VoucherApi['recent']>
export type VoucherCreateInput = Parameters<VoucherApi['create']>[0]
export type VoucherCreateResult = ResultOf<VoucherApi['create']>
export type VoucherUpdateInput = Parameters<VoucherApi['update']>[0]
export type VoucherUpdateResult = ResultOf<VoucherApi['update']>
export type VoucherDeleteInput = Parameters<VoucherApi['delete']>[0]
export type VoucherDeleteResult = ResultOf<VoucherApi['delete']>
export type VoucherReverseInput = Parameters<VoucherApi['reverse']>[0]
export type VoucherReverseResult = ResultOf<VoucherApi['reverse']>

export type MemberListParams = { search?: string; active?: boolean }
export type MemberListResult = ResultOf<MemberApi['list']>
export type MemberGetInput = Parameters<MemberApi['get']>[0]
export type MemberGetResult = ResultOf<MemberApi['get']>
export type MemberCreateInput = Parameters<MemberApi['create']>[0]
export type MemberCreateResult = ResultOf<MemberApi['create']>
export type MemberUpdateInput = Parameters<MemberApi['update']>[0]
export type MemberUpdateResult = ResultOf<MemberApi['update']>
export type MemberDeleteInput = Parameters<MemberApi['delete']>[0]
export type MemberDeleteResult = ResultOf<MemberApi['delete']>

export type MemberPaymentListResult = ResultOf<PaymentApi['history']>
export type MemberPaymentCreateInput = {
  memberId: number
  amount: number
  periodKey?: string
  date?: string
  voucherId?: number
}
export type MemberPaymentCreateResult = { id?: number; success?: boolean }

export type AttachmentListInput = Parameters<AttachmentApi['list']>[0]
export type AttachmentListResult = ResultOf<AttachmentApi['list']>
export type EncodedAttachment = {
  name: string
  dataBase64: string
  mimeType?: string
  mime?: string
}
export type AttachmentUploadFile = File | EncodedAttachment
export type AttachmentAddInput = { voucherId: number; files: AttachmentUploadFile[] }
export type AttachmentAddResult = { files: Array<{ id: number }> }
export type AttachmentDeleteResult = ResultOf<AttachmentApi['delete']>
export type AttachmentDownloadResult = ResultOf<AttachmentApi['saveAs']> | Blob

export type BindingListInput = NonNullable<Parameters<BindingApi['list']>[0]>
export type BindingListResult = ResultOf<BindingApi['list']>
export type BindingUpsertInput = Parameters<BindingApi['upsert']>[0]
export type BindingUpsertResult = ResultOf<BindingApi['upsert']>
export type BindingDeleteInput = Parameters<BindingApi['delete']>[0]
export type BindingDeleteResult = ResultOf<BindingApi['delete']>

export type BudgetListInput = NonNullable<Parameters<BudgetApi['list']>[0]>
export type BudgetListResult = ResultOf<BudgetApi['list']>
export type BudgetUpsertInput = Parameters<BudgetApi['upsert']>[0]
export type BudgetUpsertResult = ResultOf<BudgetApi['upsert']>
export type BudgetDeleteInput = Parameters<BudgetApi['delete']>[0]
export type BudgetDeleteResult = ResultOf<BudgetApi['delete']>

export type TagListInput = NonNullable<Parameters<TagApi['list']>[0]>
export type TagListResult = ResultOf<TagApi['list']>
export type TagUpsertInput = Parameters<TagApi['upsert']>[0]
export type TagUpsertResult = ResultOf<TagApi['upsert']>
export type TagDeleteInput = Parameters<TagApi['delete']>[0]
export type TagDeleteResult = ResultOf<TagApi['delete']>

export interface IDataAdapter {
  vouchers: {
    list: (params: VoucherListParams) => Promise<VoucherListResult>
    recent: (params: VoucherRecentInput) => Promise<VoucherRecentResult>
    create: (params: VoucherCreateInput) => Promise<VoucherCreateResult>
    update: (params: VoucherUpdateInput) => Promise<VoucherUpdateResult>
    delete: (params: VoucherDeleteInput) => Promise<VoucherDeleteResult>
    reverse: (params: VoucherReverseInput) => Promise<VoucherReverseResult>
  }
  members: {
    list: (params: MemberListParams) => Promise<MemberListResult>
    get: (params: MemberGetInput) => Promise<MemberGetResult>
    create: (params: MemberCreateInput) => Promise<MemberCreateResult>
    update: (params: MemberUpdateInput) => Promise<MemberUpdateResult>
    delete: (params: MemberDeleteInput) => Promise<MemberDeleteResult>
    payments: {
      list: (params: { memberId: number }) => Promise<MemberPaymentListResult>
      create: (params: MemberPaymentCreateInput) => Promise<MemberPaymentCreateResult>
    }
  }
  attachments: {
    list: (params: AttachmentListInput) => Promise<AttachmentListResult>
    add: (params: AttachmentAddInput) => Promise<AttachmentAddResult>
    delete: (params: { id: number }) => Promise<AttachmentDeleteResult>
    download: (params: { id: number }) => Promise<AttachmentDownloadResult>
  }
  bindings: {
    list: (params: BindingListInput) => Promise<BindingListResult>
    create: (params: BindingUpsertInput) => Promise<BindingUpsertResult>
    update: (params: BindingUpsertInput) => Promise<BindingUpsertResult>
    delete: (params: BindingDeleteInput) => Promise<BindingDeleteResult>
  }
  budgets: {
    list: (params: BudgetListInput) => Promise<BudgetListResult>
    create: (params: BudgetUpsertInput) => Promise<BudgetUpsertResult>
    update: (params: BudgetUpsertInput) => Promise<BudgetUpsertResult>
    delete: (params: BudgetDeleteInput) => Promise<BudgetDeleteResult>
  }
  tags: {
    list: (params: TagListInput) => Promise<TagListResult>
    create: (params: TagUpsertInput) => Promise<TagUpsertResult>
    update: (params: TagUpsertInput) => Promise<TagUpsertResult>
    delete: (params: TagDeleteInput) => Promise<TagDeleteResult>
  }
  settings: {
    get: <T = unknown>(params: { key: string }) => Promise<{ value: T }>
    set: (params: { key: string; value: unknown }) => Promise<{ ok: boolean }>
    delete: (params: { key: string }) => Promise<{ ok: boolean }>
  }
  reports: {
    years: RendererApi['reports']['years']
    summary: RendererApi['reports']['summary']
  }
  yearEnd: RendererApi['yearEnd']
  backup: {
    create: () => ReturnType<RendererApi['backup']['make']>
    restore: RendererApi['backup']['restore']
    inspect: RendererApi['backup']['inspect']
    inspectCurrent: RendererApi['backup']['inspectCurrent']
  }
  db: {
    smartRestore: RendererApi['db']['smartRestore']
  }
}

export type AppMode = 'local' | 'cloud'

export interface AppModeConfig {
  mode: AppMode
  cloudConfig?: {
    apiUrl: string
    token?: string
  }
}
