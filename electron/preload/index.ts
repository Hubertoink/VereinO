import { contextBridge, ipcRenderer } from 'electron'

// Helper to clean up error messages from IPC
function cleanInvoke(channel: string, ...args: any[]): Promise<any> {
    return ipcRenderer.invoke(channel, ...args).catch((error) => {
        // Remove "Error invoking remote method 'channel': " prefix
        const msg = String(error?.message || error)
        const match = msg.match(/Error invoking remote method '[^']+': (.+)/)
        if (match) {
            throw new Error(match[1])
        }
        throw error
    })
}

contextBridge.exposeInMainWorld('api', {
    window: {
        minimize: () => ipcRenderer.invoke('window.minimize'),
        toggleMaximize: () => ipcRenderer.invoke('window.toggleMaximize'),
        isMaximized: () => ipcRenderer.invoke('window.isMaximized').then(r => !!r?.isMaximized),
        close: () => ipcRenderer.invoke('window.close'),
        onMaximizeChanged: (cb: (isMax: boolean) => void) => {
            const handler = (_: any, v: boolean) => cb(!!v)
            ipcRenderer.on('window:maximized', handler)
            ipcRenderer.on('window:unmaximized', (_e) => cb(false))
            return () => {
                ipcRenderer.removeListener('window:maximized', handler)
                ipcRenderer.removeAllListeners('window:unmaximized')
            }
        }
    },
    workQueue: {
        summary: () => ipcRenderer.invoke('workQueue.summary')
    },
    ping: () => 'pong',
    vouchers: {
        create: (payload: any) => cleanInvoke('vouchers.create', payload),
        reverse: (payload: any) => cleanInvoke('vouchers.reverse', payload),
        list: (payload?: any) => ipcRenderer.invoke('vouchers.list', payload),
        recent: (payload?: any) => ipcRenderer.invoke('vouchers.recent', payload),
        update: (payload: any) => cleanInvoke('vouchers.update', payload),
        delete: (payload: any) => ipcRenderer.invoke('vouchers.delete', payload),
        batchAssignEarmark: (payload: any) => ipcRenderer.invoke('vouchers.batchAssignEarmark', payload),
        batchAssignBudget: (payload: any) => ipcRenderer.invoke('vouchers.batchAssignBudget', payload),
        batchAssignTags: (payload: any) => ipcRenderer.invoke('vouchers.batchAssignTags', payload),
        clearAll: () => ipcRenderer.invoke('vouchers.clearAll', { confirm: true })
    },
    tags: {
        list: (payload?: any) => ipcRenderer.invoke('tags.list', payload),
        upsert: (payload: any) => ipcRenderer.invoke('tags.upsert', payload),
        delete: (payload: any) => ipcRenderer.invoke('tags.delete', payload)
    },
    audit: {
        recent: (payload?: any) => ipcRenderer.invoke('audit.recent', payload)
    },
        yearEnd: {
            preview: (payload: { year: number }) => ipcRenderer.invoke('yearEnd.preview', payload),
            export: (payload: { year: number }) => ipcRenderer.invoke('yearEnd.export', payload),
            close: (payload: { year: number }) => ipcRenderer.invoke('yearEnd.close', payload),
            reopen: (payload: { year: number }) => ipcRenderer.invoke('yearEnd.reopen', payload),
            status: () => ipcRenderer.invoke('yearEnd.status')
        },
    attachments: {
        list: (payload: any) => ipcRenderer.invoke('attachments.list', payload),
        open: (payload: any) => ipcRenderer.invoke('attachments.open', payload),
        saveAs: (payload: any) => ipcRenderer.invoke('attachments.saveAs', payload),
        read: (payload: any) => ipcRenderer.invoke('attachments.read', payload),
        add: (payload: any) => ipcRenderer.invoke('attachments.add', payload),
        delete: (payload: any) => ipcRenderer.invoke('attachments.delete', payload)
    },
    bindings: {
        list: (payload?: any) => ipcRenderer.invoke('bindings.list', payload),
        upsert: (payload: any) => ipcRenderer.invoke('bindings.upsert', payload),
        delete: (payload: any) => ipcRenderer.invoke('bindings.delete', payload),
        usage: (payload: any) => ipcRenderer.invoke('bindings.usage', payload)
    },
    budgets: {
        upsert: (payload: any) => ipcRenderer.invoke('budgets.upsert', payload),
        list: (payload?: any) => ipcRenderer.invoke('budgets.list', payload),
        delete: (payload: any) => ipcRenderer.invoke('budgets.delete', payload),
        usage: (payload: any) => ipcRenderer.invoke('budgets.usage', payload)
    },
    invoices: {
        create: (payload: any) => ipcRenderer.invoke('invoices.create', payload),
        update: (payload: any) => ipcRenderer.invoke('invoices.update', payload),
        delete: (payload: any) => ipcRenderer.invoke('invoices.delete', payload),
        list: (payload?: any) => ipcRenderer.invoke('invoices.list', payload),
        summary: (payload?: any) => ipcRenderer.invoke('invoices.summary', payload),
        get: (payload: any) => ipcRenderer.invoke('invoices.get', payload),
        addPayment: (payload: any) => ipcRenderer.invoke('invoices.addPayment', payload),
        markPaid: (payload: any) => ipcRenderer.invoke('invoices.markPaid', payload),
        postToVoucher: (payload: any) => ipcRenderer.invoke('invoices.postToVoucher', payload)
    },
    members: {
        list: (payload?: any) => ipcRenderer.invoke('members.list', payload),
        create: (payload: any) => ipcRenderer.invoke('members.create', payload),
        update: (payload: any) => ipcRenderer.invoke('members.update', payload),
        delete: (payload: any) => ipcRenderer.invoke('members.delete', payload),
        get: (payload: any) => ipcRenderer.invoke('members.get', payload),
        writeLetter: (payload: any) => ipcRenderer.invoke('members.writeLetter', payload)
    },
    payments: {
        listDue: (payload: any) => ipcRenderer.invoke('payments.listDue', payload),
        markPaid: (payload: any) => ipcRenderer.invoke('payments.markPaid', payload),
        unmark: (payload: any) => ipcRenderer.invoke('payments.unmark', payload),
        suggestVouchers: (payload: any) => ipcRenderer.invoke('payments.suggestVouchers', payload),
        status: (payload: any) => ipcRenderer.invoke('payments.status', payload),
        history: (payload: any) => ipcRenderer.invoke('payments.history', payload)
    },
    invoiceFiles: {
        open: (payload: any) => ipcRenderer.invoke('invoiceFiles.open', payload),
        saveAs: (payload: any) => ipcRenderer.invoke('invoiceFiles.saveAs', payload),
        read: (payload: any) => ipcRenderer.invoke('invoiceFiles.read', payload),
        list: (payload: any) => ipcRenderer.invoke('invoiceFiles.list', payload),
        add: (payload: any) => ipcRenderer.invoke('invoiceFiles.add', payload),
        delete: (payload: any) => ipcRenderer.invoke('invoiceFiles.delete', payload)
    },
    reports: {
        export: (payload: any) => ipcRenderer.invoke('reports.export', payload),
        exportFiscal: (payload: any) => ipcRenderer.invoke('reports.exportFiscal', payload),
        summary: (payload: any) => ipcRenderer.invoke('reports.summary', payload),
        monthly: (payload: any) => ipcRenderer.invoke('reports.monthly', payload),
        // Expose daily buckets endpoint for Dashboard day-level charts
        daily: (payload: any) => ipcRenderer.invoke('reports.daily', payload),
        cashBalance: (payload: any) => ipcRenderer.invoke('reports.cashBalance', payload),
        years: () => ipcRenderer.invoke('reports.years'),
    },
    db: {
        export: () => ipcRenderer.invoke('db.export'),
        import: {
            pick: () => ipcRenderer.invoke('db.import.pick'),
            fromPath: (filePath: string) => ipcRenderer.invoke('db.import.fromPath', { filePath })
        },
        smartRestore: {
            preview: () => ipcRenderer.invoke('db.smartRestore.preview'),
            apply: (payload: { action: 'useDefault' | 'migrateToDefault' }) => ipcRenderer.invoke('db.smartRestore.apply', payload)
        },
        location: {
            get: () => ipcRenderer.invoke('db.location.get'),
            pick: () => ipcRenderer.invoke('db.location.pick'),
            migrateTo: (payload: any) => ipcRenderer.invoke('db.location.migrateTo', payload),
            useFolder: (payload: any) => ipcRenderer.invoke('db.location.useFolder', payload),
            chooseAndMigrate: () => ipcRenderer.invoke('db.location.chooseAndMigrate'),
            useExisting: () => ipcRenderer.invoke('db.location.useExisting'),
            resetDefault: () => ipcRenderer.invoke('db.location.resetDefault')
        },
        onInitFailed: (cb: (info: { message: string }) => void) => {
            const handler = (_: any, info: { message: string }) => { try { cb(info) } catch { } }
            ipcRenderer.on('db:initFailed', handler)
            return () => ipcRenderer.removeListener('db:initFailed', handler)
        }
    },
    quotes: {
        weekly: (payload?: any) => ipcRenderer.invoke('quotes.weekly', payload)
    },
    settings: {
        get: (payload: any) => ipcRenderer.invoke('settings.get', payload),
        set: (payload: any) => ipcRenderer.invoke('settings.set', payload)
    },
    taxExemption: {
        get: () => ipcRenderer.invoke('taxExemption.get'),
        save: (payload: any) => ipcRenderer.invoke('taxExemption.save', payload),
        delete: () => ipcRenderer.invoke('taxExemption.delete'),
        updateValidity: (payload: any) => ipcRenderer.invoke('taxExemption.updateValidity', payload)
    },
    backup: {
        make: (reason?: string) => ipcRenderer.invoke('backup.make', { reason }),
        list: () => ipcRenderer.invoke('backup.list'),
        openFolder: () => ipcRenderer.invoke('backup.openFolder'),
        getDir: () => ipcRenderer.invoke('backup.getDir'),
        setDir: () => ipcRenderer.invoke('backup.setDir'),
        resetDir: () => ipcRenderer.invoke('backup.resetDir'),
        inspect: (filePath: string) => ipcRenderer.invoke('backup.inspect', { filePath }),
        inspectCurrent: () => ipcRenderer.invoke('backup.inspectCurrent'),
        restore: (filePath: string) => ipcRenderer.invoke('backup.restore', { filePath })
    },
    app: {
        version: () => ipcRenderer.invoke('app.version')
    },
    imports: {
        preview: (payload: any) => ipcRenderer.invoke('imports.preview', payload),
        execute: (payload: any) => ipcRenderer.invoke('imports.execute', payload),
        template: () => ipcRenderer.invoke('imports.template'),
        testdata: () => ipcRenderer.invoke('imports.testdata')
    },
    shell: {
        showItemInFolder: (fullPath: string) => ipcRenderer.invoke('shell.showItemInFolder', { fullPath }),
        openPath: (fullPath: string) => ipcRenderer.invoke('shell.openPath', { fullPath }),
        openExternal: (url: string) => ipcRenderer.invoke('shell.openExternal', { url })
    },
    submissions: {
        list: (payload?: any) => ipcRenderer.invoke('submissions.list', payload),
        get: (payload: any) => ipcRenderer.invoke('submissions.get', payload),
        import: (payload: any) => ipcRenderer.invoke('submissions.import', payload),
        importFromFile: () => ipcRenderer.invoke('submissions.importFromFile'),
        approve: (payload: any) => ipcRenderer.invoke('submissions.approve', payload),
        reject: (payload: any) => ipcRenderer.invoke('submissions.reject', payload),
        delete: (payload: any) => ipcRenderer.invoke('submissions.delete', payload),
        convert: (payload: any) => ipcRenderer.invoke('submissions.convert', payload),
        summary: () => ipcRenderer.invoke('submissions.summary'),
        readAttachment: (payload: any) => ipcRenderer.invoke('submissions.readAttachment', payload)
    },
    organizations: {
        list: () => ipcRenderer.invoke('organizations.list'),
        active: () => ipcRenderer.invoke('organizations.active'),
        create: (payload: { name: string }) => ipcRenderer.invoke('organizations.create', payload),
        switch: (payload: { orgId: string }) => ipcRenderer.invoke('organizations.switch', payload),
        rename: (payload: { orgId: string; name: string }) => ipcRenderer.invoke('organizations.rename', payload),
        delete: (payload: { orgId: string; deleteData?: boolean }) => ipcRenderer.invoke('organizations.delete', payload),
        getAppearance: (payload: { orgId: string }) => ipcRenderer.invoke('organizations.getAppearance', payload),
        setAppearance: (payload: { orgId: string; colorTheme?: string; backgroundImage?: string; customBackgroundImage?: string | null; glassModals?: boolean }) => 
            ipcRenderer.invoke('organizations.setAppearance', payload),
        activeAppearance: () => ipcRenderer.invoke('organizations.activeAppearance'),
        onSwitched: (cb: (org: { id: string; name: string; dbRoot: string }) => void) => {
            const handler = (_: any, org: { id: string; name: string; dbRoot: string }) => cb(org)
            ipcRenderer.on('organizations:switched', handler)
            return () => ipcRenderer.removeListener('organizations:switched', handler)
        }
    }
})

export { }
