export function buildFilterTotalsPayload(params: {
    from?: string
    to?: string
    paymentMethod?: 'BAR' | 'BANK'
    paymentAccountId?: number | null
    sphere?: 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'
    type?: 'IN' | 'OUT' | 'TRANSFER' | 'INTERNAL'
    earmarkId?: number
    q?: string
    tag?: string
}) {
    return {
        from: params.from,
        to: params.to,
        paymentMethod: params.paymentMethod,
        paymentAccountId: params.paymentAccountId ?? undefined,
        sphere: params.sphere,
        type: params.type,
        earmarkId: params.earmarkId,
        q: params.q,
        tag: params.tag
    }
}
