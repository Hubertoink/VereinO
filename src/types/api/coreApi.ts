export interface QuickAddPayload {
    draftId?: string | null
    mode?: 'create' | 'invoice' | 'edit' | 'details' | 'delete' | 'reverse'
    kind?: 'booking' | 'invoice'
    invoiceState?: unknown
    voucherId?: number
    originalId?: number
    id?: number
    deleted?: boolean
    detached?: boolean
    qa?: unknown
    voucher?: unknown
    files?: Array<{ name: string; dataBase64: string; mime?: string }>
    [key: string]: unknown
}

export interface StartupBootstrapData {
    counts: {
        pendingSubmissions: number
        openBankImports: number
        dueMembershipFees: number
        openInvoices: number
    }
    years: number[]
    earmarks: unknown[]
    paymentAccounts: unknown[]
    tags: unknown[]
    periodLock: { closedUntil: string | null }
    backup: { mode: string; intervalDays: number; lastAuto: number }
}

export interface CoreApi {
    app: {
        version: () => Promise<{ version: string; name: string }>
        bootstrap: () => Promise<StartupBootstrapData>
        notifyDataChanged: () => void
        onDataChanged: (callback: () => void) => () => void
    }
    workQueue: {
        summary: () => Promise<{
            ok: boolean
            unlinkedReceiptsCount?: number
            lockedEntriesCount?: number
            error?: string
        }>
    }
    window: {
        minimize: () => Promise<{ ok: boolean }>
        toggleMaximize: () => Promise<{ ok: boolean; isMaximized?: boolean }>
        isMaximized: () => Promise<boolean>
        close: () => Promise<{ ok: boolean }>
        confirmClose: () => Promise<{ ok: boolean }>
        cancelClose: () => Promise<{ ok: boolean }>
        setInvoiceScanExpanded: (expanded: boolean) => Promise<{ ok: boolean }>
        onMaximizeChanged: (callback: (isMaximized: boolean) => void) => () => void
        onCloseRequested: (callback: () => void) => () => void
    }
    quickAdd: {
        openDetached: (payload?: QuickAddPayload) => Promise<{ ok: boolean; token?: string; error?: string }>
        detachedInitial: (payload: { token: string }) => Promise<{ initial: QuickAddPayload | null }>
        focusDetached: (payload: { draftId: string }) => Promise<{ ok: boolean }>
        closeDetached: (payload: { draftId: string }) => Promise<{ ok: boolean }>
        syncDraft: (payload: QuickAddPayload) => Promise<{ ok: boolean }>
        notifySaved: (payload?: QuickAddPayload) => Promise<{ ok: boolean }>
        onDetachedDraftSync: (callback: (payload: QuickAddPayload) => void) => () => void
        onDetachedClosed: (callback: (payload: QuickAddPayload) => void) => () => void
        onSaved: (callback: (payload: QuickAddPayload) => void) => () => void
    }
    ping: () => string
    settings: {
        get: <T = unknown>(payload: { key: string }) => Promise<{ value: T }>
        set: (payload: { key: string; value: unknown }) => Promise<{ ok: boolean }>
    }
    quotes: {
        weekly: (payload?: { date?: string }) => Promise<{
            text: string
            author?: string
            source?: string
            id?: number
        }>
    }
}
