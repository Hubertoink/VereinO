export { }

declare global {
    interface Window {
        api?: {
            window?: {
                minimize: () => Promise<{ ok: boolean }>
                toggleMaximize: () => Promise<{ ok: boolean; isMaximized?: boolean }>
                isMaximized: () => Promise<boolean>
                close: () => Promise<{ ok: boolean }>
                onMaximizeChanged: (cb: (isMax: boolean) => void) => () => void
            }
            ping: () => string
            vouchers: {
                create: (payload: {
                    date: string
                    type: 'IN' | 'OUT' | 'TRANSFER'
                    sphere: 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'
                    description?: string
                    netAmount?: number
                    grossAmount?: number
                    vatRate: number
                    paymentMethod?: 'BAR' | 'BANK'
                    transferFrom?: 'BAR' | 'BANK'
                    transferTo?: 'BAR' | 'BANK'
                    categoryId?: number
                    projectId?: number
                    earmarkId?: number
                    budgetId?: number
                    files?: { name: string; dataBase64: string; mime?: string }[]
                    tags?: string[]
                }) => Promise<{ id: number; voucherNo: string; grossAmount: number; warnings?: string[] }>
                reverse: (payload: any) => Promise<{ id: number; voucherNo: string }>
                list: (payload?: { limit?: number; offset?: number; sort?: 'ASC' | 'DESC'; sortBy?: 'date' | 'gross' | 'net' | 'attachments' | 'budget' | 'earmark' | 'payment' | 'sphere'; paymentMethod?: 'BAR' | 'BANK'; sphere?: 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'; type?: 'IN' | 'OUT' | 'TRANSFER'; from?: string; to?: string; earmarkId?: number; budgetId?: number; q?: string; tag?: string }) => Promise<{
                    rows: Array<{
                        id: number
                        voucherNo: string
                        date: string
                        type: 'IN' | 'OUT' | 'TRANSFER'
                        sphere: 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'
                        paymentMethod?: 'BAR' | 'BANK' | null
                        transferFrom?: 'BAR' | 'BANK' | null
                        transferTo?: 'BAR' | 'BANK' | null
                        description?: string | null
                        netAmount: number
                        vatRate: number
                        vatAmount: number
                        grossAmount: number
                        fileCount?: number
                        earmarkId?: number | null
                        earmarkCode?: string | null
                        budgetId?: number | null
                        budgetLabel?: string | null
                        budgetColor?: string | null
                        tags?: string[]
                    }>
                    total: number
                }>
                recent: (payload?: { limit?: number }) => Promise<{ rows: Array<{ id: number; voucherNo: string; date: string; type: 'IN' | 'OUT' | 'TRANSFER'; sphere: 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'; paymentMethod?: 'BAR' | 'BANK' | null; description?: string | null; netAmount: number; vatRate: number; vatAmount: number; grossAmount: number; fileCount?: number }> }>
                update: (payload: { id: number; date?: string; type?: 'IN' | 'OUT' | 'TRANSFER'; sphere?: 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'; description?: string | null; paymentMethod?: 'BAR' | 'BANK' | null; transferFrom?: 'BAR' | 'BANK' | null; transferTo?: 'BAR' | 'BANK' | null; earmarkId?: number | null; budgetId?: number | null; tags?: string[] }) => Promise<{ id: number; warnings?: string[] }>
                delete: (payload: { id: number }) => Promise<{ id: number }>
                batchAssignEarmark: (payload: { earmarkId: number; paymentMethod?: 'BAR' | 'BANK'; sphere?: 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'; type?: 'IN' | 'OUT' | 'TRANSFER'; from?: string; to?: string; q?: string; onlyWithout?: boolean }) => Promise<{ updated: number }>
                batchAssignBudget: (payload: { budgetId: number; paymentMethod?: 'BAR' | 'BANK'; sphere?: 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'; type?: 'IN' | 'OUT' | 'TRANSFER'; from?: string; to?: string; q?: string; onlyWithout?: boolean }) => Promise<{ updated: number }>
                batchAssignTags: (payload: { tags: string[]; paymentMethod?: 'BAR' | 'BANK'; sphere?: 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'; type?: 'IN' | 'OUT' | 'TRANSFER'; from?: string; to?: string; q?: string }) => Promise<{ updated: number }>
                clearAll: () => Promise<{ deleted: number }>
            }
            tags: {
                list: (payload?: { q?: string; includeUsage?: boolean }) => Promise<{ rows: Array<{ id: number; name: string; color?: string | null; usage?: number }> }>
                upsert: (payload: { id?: number; name: string; color?: string | null }) => Promise<{ id: number }>
                delete: (payload: { id: number }) => Promise<{ id: number }>
            }
            audit: {
                recent: (payload?: { limit?: number }) => Promise<{ rows: Array<{ id: number; userId?: number | null; entity: string; entityId: number; action: string; createdAt: string; diff?: any | null }> }>
            }
            yearEnd?: {
                preview?: (payload: { year: number }) => Promise<{ year: number; from: string; to: string; totals: { net: number; vat: number; gross: number }; bySphere: Array<{ key: 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'; net: number; vat: number; gross: number }>; byPaymentMethod: Array<{ key: 'BAR' | 'BANK' | null; net: number; vat: number; gross: number }>; byType: Array<{ key: 'IN' | 'OUT' | 'TRANSFER'; net: number; vat: number; gross: number }>; cashBalance: { BAR: number; BANK: number } }>
                export?: (payload: { year: number }) => Promise<{ filePath: string }>
                close?: (payload: { year: number }) => Promise<{ ok: boolean; closedUntil: string }>
                reopen?: (payload: { year: number }) => Promise<{ ok: boolean; closedUntil: string | null }>
                status?: () => Promise<{ closedUntil: string | null }>
            }
            bindings: {
                list: (payload?: { activeOnly?: boolean }) => Promise<{ rows: Array<{ id: number; code: string; name: string; description?: string | null; startDate?: string | null; endDate?: string | null; isActive: number; color?: string | null; budget?: number | null }> }>
                upsert: (payload: { id?: number; code: string; name: string; description?: string | null; startDate?: string | null; endDate?: string | null; isActive?: boolean; color?: string | null; budget?: number | null }) => Promise<{ id: number }>
                delete: (payload: { id: number }) => Promise<{ id: number }>
                usage: (payload: { earmarkId: number; from?: string; to?: string; sphere?: 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB' }) => Promise<{ allocated: number; released: number; balance: number; budget: number; remaining: number }>
            }
            budgets: {
                upsert: (payload: { id?: number; year: number; sphere: 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'; categoryId?: number | null; projectId?: number | null; earmarkId?: number | null; amountPlanned: number; name?: string | null; categoryName?: string | null; projectName?: string | null; startDate?: string | null; endDate?: string | null; color?: string | null }) => Promise<{ id: number }>
                list: (payload?: { year?: number; sphere?: 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'; earmarkId?: number | null }) => Promise<{ rows: Array<{ id: number; year: number; sphere: 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'; categoryId: number | null; projectId: number | null; earmarkId: number | null; amountPlanned: number; name?: string | null; categoryName?: string | null; projectName?: string | null; startDate?: string | null; endDate?: string | null; color?: string | null }> }>
                delete: (payload: { id: number }) => Promise<{ id: number }>
                usage: (payload: { budgetId: number; from?: string; to?: string }) => Promise<{ spent: number; inflow: number; count: number; lastDate: string | null }>
            }
            invoices: {
                create: (payload: { date: string; dueDate?: string | null; invoiceNo?: string | null; party: string; description?: string | null; grossAmount: number; paymentMethod?: string | null; sphere: 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'; earmarkId?: number | null; budgetId?: number | null; autoPost?: boolean; voucherType: 'IN' | 'OUT'; files?: { name: string; dataBase64: string; mime?: string }[]; tags?: string[] }) => Promise<{ id: number }>
                update: (payload: { id: number; date?: string; dueDate?: string | null; invoiceNo?: string | null; party?: string; description?: string | null; grossAmount?: number; paymentMethod?: string | null; sphere?: 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'; earmarkId?: number | null; budgetId?: number | null; autoPost?: boolean; voucherType?: 'IN' | 'OUT'; tags?: string[] }) => Promise<{ id: number }>
                delete: (payload: { id: number }) => Promise<{ id: number }>
                list: (payload?: { limit?: number; offset?: number; sort?: 'ASC' | 'DESC'; sortBy?: 'date' | 'due' | 'amount' | 'status'; status?: 'OPEN' | 'PARTIAL' | 'PAID' | 'ALL'; sphere?: 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'; budgetId?: number; q?: string; dueFrom?: string; dueTo?: string; tag?: string }) => Promise<{ rows: Array<{ id: number; date: string; dueDate?: string | null; invoiceNo?: string | null; party: string; description?: string | null; grossAmount: number; paymentMethod?: string | null; sphere: 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'; earmarkId?: number | null; budgetId?: number | null; autoPost?: number; voucherType: 'IN' | 'OUT'; postedVoucherId?: number | null; postedVoucherNo?: string | null; paidSum: number; status: 'OPEN' | 'PARTIAL' | 'PAID'; fileCount?: number; tags?: string[] }>; total: number }>
                summary: (payload?: { status?: 'OPEN' | 'PARTIAL' | 'PAID' | 'ALL'; sphere?: 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'; budgetId?: number; q?: string; dueFrom?: string; dueTo?: string; tag?: string }) => Promise<{ count: number; gross: number; paid: number; remaining: number; grossIn: number; grossOut: number }>
                get: (payload: { id: number }) => Promise<{ id: number; date: string; dueDate?: string | null; invoiceNo?: string | null; party: string; description?: string | null; grossAmount: number; paymentMethod?: string | null; sphere: 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'; earmarkId?: number | null; budgetId?: number | null; autoPost?: number; voucherType: 'IN' | 'OUT'; postedVoucherId?: number | null; postedVoucherNo?: string | null; payments: Array<{ id: number; date: string; amount: number }>; files: Array<{ id: number; fileName: string; mimeType?: string | null; size?: number | null; createdAt?: string | null }>; tags: string[]; paidSum: number; status: 'OPEN' | 'PARTIAL' | 'PAID' }>
                addPayment: (payload: { invoiceId: number; date: string; amount: number }) => Promise<{ id: number; status: 'OPEN' | 'PARTIAL' | 'PAID'; paidSum: number; voucherId?: number | null }>
                markPaid: (payload: { id: number }) => Promise<{ id: number; status: 'OPEN' | 'PARTIAL' | 'PAID'; paidSum?: number; voucherId?: number | null }>
            }
            invoiceFiles: {
                open: (payload: { fileId: number }) => Promise<{ ok: boolean }>
                saveAs: (payload: { fileId: number }) => Promise<{ filePath: string }>
                read: (payload: { fileId: number }) => Promise<{ fileName: string; mimeType?: string; dataBase64: string }>
                list: (payload: { invoiceId: number }) => Promise<{ files: Array<{ id: number; fileName: string; mimeType?: string | null; size?: number | null; createdAt?: string | null }> }>
                add: (payload: { invoiceId: number; fileName: string; dataBase64: string; mimeType?: string }) => Promise<{ id: number }>
                delete: (payload: { fileId: number }) => Promise<{ id: number }>
            }
            attachments: {
                list: (payload: { voucherId: number }) => Promise<{ files: Array<{ id: number; fileName: string; mimeType?: string | null; size?: number | null; createdAt?: string }> }>
                open: (payload: { fileId: number }) => Promise<{ ok: boolean }>
                saveAs: (payload: { fileId: number }) => Promise<{ filePath: string }>
                read: (payload: { fileId: number }) => Promise<{ fileName: string; mimeType?: string; dataBase64: string }>
                add: (payload: { voucherId: number; fileName: string; dataBase64: string; mimeType?: string }) => Promise<{ id: number }>
                delete: (payload: { fileId: number }) => Promise<{ id: number }>
            }
            reports: {
                export: (payload: any) => Promise<{ filePath: string }>
                summary: (payload: any) => Promise<any>
                monthly: (payload: any) => Promise<any>
                cashBalance: (payload: any) => Promise<{ BAR: number; BANK: number }>
                years: () => Promise<{ years: number[] }>
            }
            settings: {
                get: (payload: { key: string }) => Promise<{ value: any }>
                set: (payload: { key: string; value: any }) => Promise<{ ok: boolean }>
            }
            taxExemption: {
                get: () => Promise<{ 
                    certificate: {
                        fileName: string
                        uploadDate: string
                        validFrom?: string
                        validUntil?: string
                        fileData: string
                        mimeType: string
                        fileSize: number
                    } | null 
                }>
                save: (payload: { 
                    fileName: string
                    fileData: string
                    mimeType: string
                    fileSize: number
                    validFrom?: string
                    validUntil?: string
                }) => Promise<{ ok: boolean }>
                delete: () => Promise<{ ok: boolean }>
                updateValidity: (payload: { 
                    validFrom?: string
                    validUntil?: string 
                }) => Promise<{ ok: boolean }>
            }
            quotes: {
                weekly: (payload?: { date?: string }) => Promise<{ text: string; author?: string; source?: string; id?: number }>
            }
            backup: {
                make: (reason?: string) => Promise<{ ok: boolean; filePath?: string; error?: string }>
                list: () => Promise<{ ok: boolean; dir?: string; backups?: Array<{ filePath: string; size: number; mtime: number }>; error?: string }>
                openFolder: () => Promise<{ ok: boolean; error?: string | null }>
                getDir: () => Promise<{ ok: boolean; dir?: string; error?: string }>
                setDir: () => Promise<{ ok: boolean; dir?: string; moved?: number; error?: string }>
                resetDir: () => Promise<{ ok: boolean; dir?: string; moved?: number; error?: string }>
                inspect: (filePath: string) => Promise<{ ok: boolean; counts?: Record<string, number>; error?: string }>
                inspectCurrent: () => Promise<{ ok: boolean; counts?: Record<string, number>; error?: string }>
                restore: (filePath: string) => Promise<{ ok: boolean; error?: string }>
            }
            imports: {
                preview: (payload: { fileBase64: string }) => Promise<{ headers: string[]; sample: Array<Record<string, any>>; suggestedMapping: Record<string, string | null>; headerRowIndex: number }>
                execute: (payload: { fileBase64: string; mapping: Record<string, string | null> }) => Promise<{ imported: number; skipped: number; errors: Array<{ row: number; message: string }>; rowStatuses?: Array<{ row: number; ok: boolean; message?: string }>; errorFilePath?: string }>
                template: () => Promise<{ filePath: string }>
                testdata: () => Promise<{ filePath: string }>
            }
            db: {
                export: () => Promise<{ filePath: string }>
                import: () => Promise<{ ok: boolean; filePath?: string }>
                location: {
                    get: () => Promise<{ root: string; dbPath: string; filesDir: string; configuredRoot: string | null }>
                    chooseAndMigrate: () => Promise<{ ok: true; root: string; dbPath: string; filesDir: string }>
                    useExisting: () => Promise<{ ok: true; root: string; dbPath: string; filesDir: string }>
                    resetDefault: () => Promise<{ ok: true; root: string; dbPath: string; filesDir: string }>
                    pick: () => Promise<{ root: string; hasDb: boolean; dbPath: string; filesDir: string }>
                    migrateTo: (payload: { root: string }) => Promise<{ ok: true; root: string; dbPath: string; filesDir: string }>
                    useFolder: (payload: { root: string }) => Promise<{ ok: true; root: string; dbPath: string; filesDir: string }>
                }
                smartRestore: {
                    preview: () => Promise<{
                        current: { root: string; dbPath: string; exists: boolean; mtime?: number | null; counts?: Record<string, number>; last?: Record<string, string | null> }
                        default: { root: string; dbPath: string; exists: boolean; mtime?: number | null; counts?: Record<string, number>; last?: Record<string, string | null> }
                        recommendation?: 'useDefault' | 'migrateToDefault' | 'manual'
                    }>
                    apply: (payload: { action: 'useDefault' | 'migrateToDefault' }) => Promise<{ ok: boolean }>
                }
            }
            shell: {
                showItemInFolder: (fullPath: string) => Promise<{ ok: boolean; error?: string | null }>
                openPath: (fullPath: string) => Promise<{ ok: boolean; error?: string | null }>
                openExternal: (url: string) => Promise<{ ok: boolean; error?: string | null }>
            }
        }
    }
}
