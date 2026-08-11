import type {
    ClassificationScheme,
    ClassificationValue,
    OrganizationProfile,
    OrganizationProfileDefinition
} from '../../../shared/classification'

export type UpdateStatus =
    | 'idle'
    | 'checking'
    | 'available'
    | 'downloading'
    | 'downloaded'
    | 'not-available'
    | 'error'
    | 'unsupported'

export interface UpdateState {
    status: UpdateStatus
    currentVersion: string
    availableVersion: string | null
    downloadedVersion: string | null
    downloadProgress: number | null
    message: string | null
}

interface StorageLocation {
    root: string
    dbPath: string
    filesDir: string
}

interface OrganizationAppearance {
    colorTheme: string | null
    backgroundImage: string | null
    customBackgroundImage: string | null
    glassModals: boolean
}

export interface SystemApi {
    ocr: {
        status: () => Promise<{
            available: boolean
            languages: string[]
            error: string | null
        }>
        extract: (payload: { images: Array<{ dataBytes?: Uint8Array; dataBase64?: string }> }) => Promise<{
            text: string
            pages: Array<{
                text: string
                confidence: number
                words: Array<{ text: string; x: number; y: number; width: number; height: number }>
            }>
            confidence: number
        }>
    }
    docling: {
        status: (force?: boolean) => Promise<{
            installed: boolean
            enabled: boolean
            configured: boolean
            version: string | null
            runtime: string | null
            error: string | null
        }>
        setEnabled: (enabled: boolean) => Promise<{
            installed: boolean
            enabled: boolean
            configured: boolean
            version: string | null
            runtime: string | null
            error: string | null
        }>
        extract: (payload: { fileName: string; mimeType?: string | null; dataBytes?: Uint8Array; dataBase64?: string }) => Promise<{
            ok: boolean
            markdown: string
            text: string
            document: unknown
            version: string | null
        }>
    }
    backup: {
        make: (reason?: string) => Promise<{ ok: boolean; filePath?: string; error?: string }>
        list: () => Promise<{
            ok: boolean
            dir?: string
            backups?: Array<{ filePath: string; size: number; mtime: number }>
            error?: string
        }>
        openFolder: () => Promise<{ ok: boolean; error?: string | null }>
        getDir: () => Promise<{ ok: boolean; dir?: string; error?: string }>
        setDir: () => Promise<{ ok: boolean; dir?: string; moved?: number; error?: string }>
        resetDir: () => Promise<{ ok: boolean; dir?: string; moved?: number; error?: string }>
        inspect: (filePath: string) => Promise<{ ok: boolean; counts?: Record<string, number>; error?: string }>
        inspectCurrent: () => Promise<{ ok: boolean; counts?: Record<string, number>; error?: string }>
        restore: (filePath: string) => Promise<{ ok: boolean; error?: string }>
    }
    updates: {
        getState: () => Promise<UpdateState>
        check: () => Promise<UpdateState>
        download: () => Promise<UpdateState>
        install: () => Promise<{ ok: boolean; state: UpdateState }>
        onStateChanged: (callback: (state: UpdateState) => void) => () => void
    }
    db: {
        export: () => Promise<{ filePath: string }>
        import: {
            pick: () => Promise<{
                ok: boolean
                filePath?: string
                size?: number
                mtime?: number
                counts?: Record<string, number>
            }>
            fromPath: (filePath: string) => Promise<{ ok: boolean; filePath?: string }>
        }
        location: {
            get: () => Promise<StorageLocation & { configuredRoot: string | null }>
            chooseAndMigrate: () => Promise<{ ok: true } & StorageLocation>
            useExisting: () => Promise<{ ok: true } & StorageLocation>
            resetDefault: () => Promise<{ ok: true } & StorageLocation>
            pick: () => Promise<{ root: string; hasDb: boolean; dbPath: string; filesDir: string }>
            migrateTo: (payload: { root: string }) => Promise<{ ok: true } & StorageLocation>
            useFolder: (payload: { root: string }) => Promise<{ ok: true } & StorageLocation>
        }
        smartRestore: {
            preview: () => Promise<{
                current: {
                    root: string
                    dbPath: string
                    exists: boolean
                    mtime?: number | null
                    counts?: Record<string, number>
                    last?: Record<string, string | null>
                }
                default: {
                    root: string
                    dbPath: string
                    exists: boolean
                    mtime?: number | null
                    counts?: Record<string, number>
                    last?: Record<string, string | null>
                }
                recommendation?: 'useDefault' | 'migrateToDefault' | 'manual'
            }>
            apply: (payload: { action: 'useDefault' | 'migrateToDefault' }) => Promise<{ ok: boolean }>
        }
        onInitFailed?: (callback: (info: { message: string }) => void) => () => void
        onPreUpdateBackup?: (callback: (info: {
            fromVersion: string
            toVersion: string
            filePath: string
            dir: string
        }) => void) => () => void
        onPreUpdateBackupFailed?: (callback: (info: {
            fromVersion: string
            toVersion: string
            error: string
        }) => void) => () => void
    }
    organizations: {
        list: () => Promise<{
            organizations: Array<{
                id: string
                name: string
                dbRoot: string
                createdAt: string
                profile?: OrganizationProfile
                isActive: boolean
            }>
        }>
        active: () => Promise<{
            organization: {
                id: string
                name: string
                dbRoot: string
                createdAt: string
                profile?: OrganizationProfile
            } | null
        }>
        create: (payload: { name: string; profile?: OrganizationProfile }) => Promise<{
            organization: { id: string; name: string; dbRoot: string; createdAt: string; profile: OrganizationProfile }
        }>
        switch: (payload: { orgId: string }) => Promise<{
            success: boolean
            org: { id: string; name: string; dbRoot: string; profile?: OrganizationProfile }
        }>
        rename: (payload: { orgId: string; name: string }) => Promise<{ success: boolean }>
        delete: (payload: { orgId: string; deleteData?: boolean }) => Promise<{ success: boolean }>
        getAppearance: (payload: { orgId: string }) => Promise<OrganizationAppearance>
        setAppearance: (payload: {
            orgId: string
            colorTheme?: string
            backgroundImage?: string
            customBackgroundImage?: string | null
            glassModals?: boolean
        }) => Promise<{ success: boolean }>
        activeAppearance: () => Promise<OrganizationAppearance>
        onSwitched: (callback: (organization: { id: string; name: string; dbRoot: string; profile?: OrganizationProfile }) => void) => () => void
    }
    classifications: {
        profile: {
            update: (payload: { profile: OrganizationProfile }) => Promise<{ profile: OrganizationProfile; changed: boolean }>
        }
        primary: {
            list: () => Promise<{
                profile: OrganizationProfile
                definition: OrganizationProfileDefinition
                scheme: ClassificationScheme
                values: ClassificationValue[]
            }>
            create: (payload: { name: string; color?: string | null; icon?: string | null; description?: string | null }) => Promise<{ id: number }>
            update: (payload: {
                id: number
                name?: string
                color?: string | null
                icon?: string | null
                description?: string | null
                isActive?: boolean
            }) => Promise<{ id: number }>
        }
    }
    shell: {
        showItemInFolder: (fullPath: string) => Promise<{ ok: boolean; error?: string | null }>
        openPath: (fullPath: string) => Promise<{ ok: boolean; error?: string | null }>
        openExternal: (url: string) => Promise<{ ok: boolean; error?: string | null }>
    }
}
