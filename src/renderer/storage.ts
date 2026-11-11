// Storage selection helpers for Settings UI
// Pick an empty destination, then copy the selected organization into it.

export type PickResult = Awaited<ReturnType<Window['api']['db']['location']['pick']>>
export type MigrateUseResult = { ok: true; root: string; dbPath: string; filesDir: string }

export async function pickFolder(): Promise<PickResult | null> {
    try {
        const res = await (window as any).api?.db?.location?.pick?.()
        return res ?? null
    } catch (e: any) {
        const msg = e?.message || String(e)
        if (/Abbruch/i.test(msg)) return null
        throw e
    }
}

export async function migrateTo(root: string, organizationId: string): Promise<MigrateUseResult> {
    const res = await (window as any).api?.db?.location?.migrateTo?.({ root, organizationId })
    return res
}
