export type InvoiceStatus = 'OPEN' | 'PARTIAL' | 'PAID'
export type InvoicePaymentMethod = '' | 'BAR' | 'BANK'
export type InvoiceSphere = 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'
export type InvoiceVoucherType = 'IN' | 'OUT'

export type InvoiceBudgetAssignment = {
  budgetId: number
  amount: number
}

export type InvoiceEarmarkAssignment = {
  earmarkId: number
  amount: number
}

export type InvoiceTagDef = {
  id: number
  name: string
  color?: string | null
}

export type InvoiceBudgetOption = {
  id: number
  name?: string | null
  year: number
}

export type InvoicePaymentAccountOption = {
  id: number
  name: string
  kind?: string | null
  color?: string | null
  isActive?: number
}

export type InvoiceEarmarkOption = {
  id: number
  code: string
  name: string
  color?: string | null
}

export type InvoiceListRow = {
  id: number
  date: string
  dueDate?: string | null
  invoiceNo?: string | null
  party: string
  description?: string | null
  grossAmount: number
  paymentMethod?: string | null
  paymentAccountId?: number | null
  sphere: InvoiceSphere
  earmarkId?: number | null
  budgetId?: number | null
  autoPost?: number | boolean
  voucherType: InvoiceVoucherType
  tags?: string[]
  budgets?: InvoiceBudgetAssignment[]
  earmarks?: InvoiceEarmarkAssignment[]
  paidSum?: number
  status: InvoiceStatus
  postedVoucherId?: number | null
  postedVoucherNo?: string | null
  fileCount?: number
}

export type InvoiceDraft = {
  id?: number
  date: string
  dueDate?: string | null
  invoiceNo?: string | null
  party: string
  description?: string | null
  grossAmount: string
  paymentMethod?: InvoicePaymentMethod
  paymentAccountId?: number | ''
  sphere: InvoiceSphere
  earmarkId?: number | ''
  budgetId?: number | ''
  budgets: InvoiceBudgetAssignment[]
  earmarks: InvoiceEarmarkAssignment[]
  autoPost: boolean
  voucherType: InvoiceVoucherType
  tags: string[]
}

export type InvoiceFormState = {
  mode: 'create' | 'edit'
  draft: InvoiceDraft
  sourceRow?: InvoiceListRow
}

export type EditInvoiceFile = {
  id: number
  fileName: string
  size?: number | null
  createdAt?: string | null
}

export type InvoiceDetail = {
  id: number
  date: string
  dueDate?: string | null
  invoiceNo?: string | null
  party: string
  description?: string | null
  grossAmount: number
  paymentMethod?: string | null
  paymentAccountId?: number | null
  paymentAccountName?: string | null
  paymentAccountKind?: string | null
  sphere: InvoiceSphere
  earmarkId?: number | null
  budgetId?: number | null
  autoPost?: number
  voucherType: InvoiceVoucherType
  postedVoucherId?: number | null
  postedVoucherNo?: string | null
  budgets?: InvoiceBudgetAssignment[]
  earmarks?: InvoiceEarmarkAssignment[]
  payments: Array<{ id: number; date: string; amount: number }>
  files: Array<{ id: number; fileName: string; mimeType?: string | null; size?: number | null; createdAt?: string | null }>
  tags: string[]
  paidSum: number
  status: InvoiceStatus
}
