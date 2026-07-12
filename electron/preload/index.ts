import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'
import type { QuickAddPayload, RendererApi, UpdateState } from '../../src/types/api'

type AsyncApiMethod = (...args: never[]) => Promise<unknown>

type AsyncApiPath<T> = {
  [Key in keyof T & string]: NonNullable<T[Key]> extends AsyncApiMethod
    ? Key
    : NonNullable<T[Key]> extends object
      ? `${Key}.${AsyncApiPath<NonNullable<T[Key]>>}`
      : never
}[keyof T & string]

type ApiValueAtPath<T, Path extends string> = Path extends `${infer Key}.${infer Rest}`
  ? Key extends keyof T
    ? ApiValueAtPath<NonNullable<T[Key]>, Rest>
    : never
  : Path extends keyof T
    ? NonNullable<T[Path]>
    : never

type RendererInvokePath = AsyncApiPath<RendererApi>
type RendererMethodAt<Path extends RendererInvokePath> = Extract<
  ApiValueAtPath<RendererApi, Path>,
  AsyncApiMethod
>
type RendererResultAt<Path extends RendererInvokePath> = Awaited<ReturnType<RendererMethodAt<Path>>>

function invoke<Path extends RendererInvokePath>(
  channel: Path,
  ...args: Parameters<RendererMethodAt<Path>>
): ReturnType<RendererMethodAt<Path>> {
  return ipcRenderer.invoke(channel, ...args) as ReturnType<RendererMethodAt<Path>>
}

function invokeRaw<T>(channel: string, ...args: unknown[]): Promise<T> {
  return ipcRenderer.invoke(channel, ...args)
}

const notifyLocalDataChanged = () => {
  try {
    window.dispatchEvent(new Event('data-changed'))
  } catch {
    // ignore
  }
}

ipcRenderer.on('app:data-changed', () => {
  notifyLocalDataChanged()
})

// Helper to clean up error messages from IPC
function cleanInvoke<Path extends RendererInvokePath>(
  channel: Path,
  ...args: Parameters<RendererMethodAt<Path>>
): ReturnType<RendererMethodAt<Path>> {
  const request = invoke(channel, ...args)
  return request.catch((error: unknown) => {
    // Remove "Error invoking remote method 'channel': " prefix
    const msg = error instanceof Error ? error.message : String(error)
    const match = msg.match(/Error invoking remote method '[^']+': (.+)/)
    if (match) {
      throw new Error(match[1])
    }
    throw error
  }) as ReturnType<RendererMethodAt<Path>>
}

const rendererApi = {
  window: {
    minimize: () => invoke('window.minimize'),
    toggleMaximize: () => invoke('window.toggleMaximize'),
    isMaximized: () =>
      invokeRaw<{ isMaximized?: boolean }>('window.isMaximized').then((r) => !!r.isMaximized),
    close: () => invoke('window.close'),
    confirmClose: () => invoke('window.confirmClose'),
    cancelClose: () => invoke('window.cancelClose'),
    setInvoiceScanExpanded: (expanded: boolean) => invoke('window.setInvoiceScanExpanded', expanded),
    onMaximizeChanged: (cb: (isMax: boolean) => void) => {
      const handler = (_event: IpcRendererEvent, v: boolean) => cb(!!v)
      const unmaximizeHandler = () => cb(false)
      ipcRenderer.on('window:maximized', handler)
      ipcRenderer.on('window:unmaximized', unmaximizeHandler)
      return () => {
        ipcRenderer.removeListener('window:maximized', handler)
        ipcRenderer.removeListener('window:unmaximized', unmaximizeHandler)
      }
    },
    onCloseRequested: (cb: () => void) => {
      const handler = () => cb()
      ipcRenderer.on('window:close-requested', handler)
      return () => ipcRenderer.removeListener('window:close-requested', handler)
    }
  },
  workQueue: {
    summary: () => invoke('workQueue.summary')
  },
  quickAdd: {
    openDetached: (payload) => invoke('quickAdd.openDetached', payload),
    detachedInitial: (payload: { token: string }) => invoke('quickAdd.detachedInitial', payload),
    focusDetached: (payload: { draftId: string }) => invoke('quickAdd.focusDetached', payload),
    closeDetached: (payload: { draftId: string }) => invoke('quickAdd.closeDetached', payload),
    syncDraft: (payload) => invoke('quickAdd.syncDraft', payload),
    notifySaved: (payload) => invoke('quickAdd.notifySaved', payload),
    onDetachedDraftSync: (cb: (payload: QuickAddPayload) => void) => {
      const handler = (_event: IpcRendererEvent, payload: QuickAddPayload) => cb(payload)
      ipcRenderer.on('quickAdd:detachedDraftSync', handler)
      return () => ipcRenderer.removeListener('quickAdd:detachedDraftSync', handler)
    },
    onDetachedClosed: (cb: (payload: QuickAddPayload) => void) => {
      const handler = (_event: IpcRendererEvent, payload: QuickAddPayload) => cb(payload)
      ipcRenderer.on('quickAdd:detachedClosed', handler)
      return () => ipcRenderer.removeListener('quickAdd:detachedClosed', handler)
    },
    onSaved: (cb: (payload: QuickAddPayload) => void) => {
      const handler = (_event: IpcRendererEvent, payload: QuickAddPayload) => cb(payload)
      ipcRenderer.on('quickAdd:saved', handler)
      return () => ipcRenderer.removeListener('quickAdd:saved', handler)
    }
  },
  ping: () => 'pong',
  ai: {
    settings: {
      get: () => invoke('ai.settings.get'),
      set: (payload) => cleanInvoke('ai.settings.set', payload),
      testConnection: () => cleanInvoke('ai.settings.testConnection')
    },
    invoice: {
      extract: (payload) => cleanInvoke('ai.invoice.extract', payload)
    },
    invoiceBatch: {
      list: () => invoke('ai.invoiceBatch.list'),
      get: (payload) => invoke('ai.invoiceBatch.get', payload),
      import: (payload) => cleanInvoke('ai.invoiceBatch.import', payload),
      retry: (payload) => cleanInvoke('ai.invoiceBatch.retry', payload),
      approve: (payload) => cleanInvoke('ai.invoiceBatch.approve', payload),
      discard: (payload) => cleanInvoke('ai.invoiceBatch.discard', payload),
      openFolder: () => cleanInvoke('ai.invoiceBatch.openFolder'),
      onChanged: (cb: (change?: { duplicatesAdded?: Array<{ fileName: string; voucherNo?: string | null }>; packetSplit?: { fileName: string; invoiceCount: number; uncertainCount: number; duplicateCount: number } }) => void) => {
        const handler = (_event: IpcRendererEvent, change?: { duplicatesAdded?: Array<{ fileName: string; voucherNo?: string | null }>; packetSplit?: { fileName: string; invoiceCount: number; uncertainCount: number; duplicateCount: number } }) => cb(change)
        ipcRenderer.on('ai:invoice-batch-changed', handler)
        return () => ipcRenderer.removeListener('ai:invoice-batch-changed', handler)
      }
    },
    jobs: {
      create: (payload) => cleanInvoke('ai.jobs.create', payload),
      list: (payload) => invoke('ai.jobs.list', payload),
      get: (payload) => invoke('ai.jobs.get', payload),
      process: (payload) => cleanInvoke('ai.jobs.process', payload),
      updateCandidate: (payload) => cleanInvoke('ai.jobs.updateCandidate', payload),
      approveCandidate: (payload) => cleanInvoke('ai.jobs.approveCandidate', payload),
      reject: (payload) => cleanInvoke('ai.jobs.reject', payload),
      delete: (payload) => invoke('ai.jobs.delete', payload)
    },
    text: {
      generate: (payload) => cleanInvoke('ai.text.generate', payload)
    },
    actions: {
      plan: (payload) => cleanInvoke('ai.actions.plan', payload)
    },
    mcp: {
      status: () => invoke('ai.mcp.status'),
      configure: (payload) => cleanInvoke('ai.mcp.configure', payload)
    },
    agent: {
      run: (payload) => cleanInvoke('ai.agent.run', payload),
      memory: {
        list: (payload) => invoke('ai.agent.memory.list', payload),
        upsert: (payload) => cleanInvoke('ai.agent.memory.upsert', payload)
      },
      autoRules: {
        list: (payload) => invoke('ai.agent.autoRules.list', payload),
        upsert: (payload) => cleanInvoke('ai.agent.autoRules.upsert', payload)
      }
    },
    bankImports: {
      reviewOpen: (payload) => cleanInvoke('ai.bankImports.reviewOpen', payload)
    }
  },
  vouchers: {
    create: (payload) => cleanInvoke('vouchers.create', payload),
    reverse: (payload) => cleanInvoke('vouchers.reverse', payload),
    list: (payload) => invoke('vouchers.list', payload),
    recent: (payload) => invoke('vouchers.recent', payload),
    update: (payload) => cleanInvoke('vouchers.update', payload),
    updateMeta: (payload) => cleanInvoke('vouchers.updateMeta', payload),
    delete: (payload) => invoke('vouchers.delete', payload),
    batchAssignEarmark: (payload) => invoke('vouchers.batchAssignEarmark', payload),
    batchAssignBudget: (payload) => invoke('vouchers.batchAssignBudget', payload),
    batchAssignTags: (payload) => invoke('vouchers.batchAssignTags', payload),
    clearAll: () =>
      invokeRaw<RendererResultAt<'vouchers.clearAll'>>('vouchers.clearAll', { confirm: true })
  },
  paymentAccounts: {
    list: (payload) => invoke('paymentAccounts.list', payload),
    upsert: (payload) => invoke('paymentAccounts.upsert', payload),
    delete: (payload) => invoke('paymentAccounts.delete', payload)
  },
  tags: {
    list: (payload) => invoke('tags.list', payload),
    upsert: (payload) => invoke('tags.upsert', payload),
    delete: (payload) => invoke('tags.delete', payload),
    usage: (payload) => invoke('tags.usage', payload)
  },
  audit: {
    recent: (payload) => invoke('audit.recent', payload)
  },
  yearEnd: {
    preview: (payload: { year: number }) => invoke('yearEnd.preview', payload),
    export: (payload: { year: number }) => invoke('yearEnd.export', payload),
    close: (payload: { year: number }) => invoke('yearEnd.close', payload),
    reopen: (payload: { year: number }) => invoke('yearEnd.reopen', payload),
    status: () => invoke('yearEnd.status')
  },
  attachments: {
    list: (payload) => invoke('attachments.list', payload),
    open: (payload) => invoke('attachments.open', payload),
    saveAs: (payload) => invoke('attachments.saveAs', payload),
    read: (payload) => invoke('attachments.read', payload),
    add: (payload) => invoke('attachments.add', payload),
    delete: (payload) => invoke('attachments.delete', payload)
  },
  bindings: {
    list: (payload) => invoke('bindings.list', payload),
    upsert: (payload) => invoke('bindings.upsert', payload),
    delete: (payload) => invoke('bindings.delete', payload),
    usage: (payload) => invoke('bindings.usage', payload)
  },
  budgets: {
    upsert: (payload) => invoke('budgets.upsert', payload),
    list: (payload) => invoke('budgets.list', payload),
    delete: (payload) => invoke('budgets.delete', payload),
    usage: (payload) => invoke('budgets.usage', payload)
  },
  advances: {
    list: (payload) => invoke('advances.list', payload),
    create: (payload) => invoke('advances.create', payload),
    get: (payload) => invoke('advances.get', payload),
    settle: (payload) => invoke('advances.settle', payload),
    delete: (payload) => invoke('advances.delete', payload),
    purchases: {
      create: (payload) => invoke('advances.purchases.create', payload),
      update: (payload) => invoke('advances.purchases.update', payload),
      delete: (payload) => invoke('advances.purchases.delete', payload)
    },
    resolve: (payload) => invoke('advances.resolve', payload)
  },
  invoices: {
    create: (payload) => invoke('invoices.create', payload),
    update: (payload) => invoke('invoices.update', payload),
    delete: (payload) => invoke('invoices.delete', payload),
    list: (payload) => invoke('invoices.list', payload),
    summary: (payload) => invoke('invoices.summary', payload),
    get: (payload) => invoke('invoices.get', payload),
    addPayment: (payload) => invoke('invoices.addPayment', payload),
    markPaid: (payload) => invoke('invoices.markPaid', payload),
    postToVoucher: (payload) => invoke('invoices.postToVoucher', payload)
  },
  members: {
    list: (payload) => invoke('members.list', payload),
    create: (payload) => invoke('members.create', payload),
    update: (payload) => invoke('members.update', payload),
    delete: (payload) => invoke('members.delete', payload),
    get: (payload) => invoke('members.get', payload),
    writeLetter: (payload) => invoke('members.writeLetter', payload),
    export: (payload) => invoke('members.export', payload)
  },
  payments: {
    listDue: (payload) => invoke('payments.listDue', payload),
    markPaid: (payload) => invoke('payments.markPaid', payload),
    unmark: (payload) => invoke('payments.unmark', payload),
    suggestVouchers: (payload) => invoke('payments.suggestVouchers', payload),
    dueSummary: () => invoke('payments.dueSummary'),
    status: (payload) => invoke('payments.status', payload),
    history: (payload) => invoke('payments.history', payload)
  },
  invoiceFiles: {
    open: (payload) => invoke('invoiceFiles.open', payload),
    saveAs: (payload) => invoke('invoiceFiles.saveAs', payload),
    read: (payload) => invoke('invoiceFiles.read', payload),
    list: (payload) => invoke('invoiceFiles.list', payload),
    add: (payload) => invoke('invoiceFiles.add', payload),
    delete: (payload) => invoke('invoiceFiles.delete', payload)
  },
  cashChecks: {
    list: (payload) => invoke('cashChecks.list', payload),
    create: (payload) => invoke('cashChecks.create', payload),
    setInspectors: (payload) => invoke('cashChecks.setInspectors', payload),
    exportPdf: (payload) => invoke('cashChecks.exportPdf', payload),
    getInspectorDefaults: () => invoke('cashChecks.getInspectorDefaults')
  },
  reports: {
    export: (payload) => invoke('reports.export', payload),
    exportFiscal: (payload) => invoke('reports.exportFiscal', payload),
    exportTreasurer: (payload) => invoke('reports.exportTreasurer', payload),
    summary: (payload) => invoke('reports.summary', payload),
    monthly: (payload) => invoke('reports.monthly', payload),
    // Expose daily buckets endpoint for Dashboard day-level charts
    daily: (payload) => invoke('reports.daily', payload),
    cashBalance: (payload) => invoke('reports.cashBalance', payload),
    years: () => invoke('reports.years')
  },
  activityReports: {
    list: (payload) => invoke('activityReports.list', payload),
    get: (payload) => invoke('activityReports.get', payload),
    save: (payload) => invoke('activityReports.save', payload),
    delete: (payload) => invoke('activityReports.delete', payload)
  },
  db: {
    export: () => invoke('db.export'),
    import: {
      pick: () => invoke('db.import.pick'),
      fromPath: (filePath: string) =>
        invokeRaw<RendererResultAt<'db.import.fromPath'>>('db.import.fromPath', { filePath })
    },
    smartRestore: {
      preview: () => invoke('db.smartRestore.preview'),
      apply: (payload: { action: 'useDefault' | 'migrateToDefault' }) =>
        invoke('db.smartRestore.apply', payload)
    },
    location: {
      get: () => invoke('db.location.get'),
      pick: () => invoke('db.location.pick'),
      migrateTo: (payload) => invoke('db.location.migrateTo', payload),
      useFolder: (payload) => invoke('db.location.useFolder', payload),
      chooseAndMigrate: () => invoke('db.location.chooseAndMigrate'),
      useExisting: () => invoke('db.location.useExisting'),
      resetDefault: () => invoke('db.location.resetDefault')
    },
    onInitFailed: (cb: (info: { message: string }) => void) => {
      const handler = (_event: IpcRendererEvent, info: { message: string }) => {
        try {
          cb(info)
        } catch {}
      }
      ipcRenderer.on('db:initFailed', handler)
      return () => ipcRenderer.removeListener('db:initFailed', handler)
    }
  },
  quotes: {
    weekly: (payload) => invoke('quotes.weekly', payload)
  },
  settings: {
    get: <T = unknown>(payload: { key: string }) =>
      invokeRaw<{ value: T }>('settings.get', payload),
    set: (payload) => invoke('settings.set', payload)
  },
  taxExemption: {
    get: () => invoke('taxExemption.get'),
    save: (payload) => invoke('taxExemption.save', payload),
    delete: () => invoke('taxExemption.delete'),
    updateValidity: (payload) => invoke('taxExemption.updateValidity', payload)
  },
  donations: {
    exportMoneyReceipt: (payload) => invoke('donations.exportMoneyReceipt', payload)
  },
  backup: {
    make: (reason?: string) =>
      invokeRaw<RendererResultAt<'backup.make'>>('backup.make', { reason }),
    list: () => invoke('backup.list'),
    openFolder: () => invoke('backup.openFolder'),
    getDir: () => invoke('backup.getDir'),
    setDir: () => invoke('backup.setDir'),
    resetDir: () => invoke('backup.resetDir'),
    inspect: (filePath: string) =>
      invokeRaw<RendererResultAt<'backup.inspect'>>('backup.inspect', { filePath }),
    inspectCurrent: () => invoke('backup.inspectCurrent'),
    restore: (filePath: string) =>
      invokeRaw<RendererResultAt<'backup.restore'>>('backup.restore', { filePath })
  },
  app: {
    version: () => invoke('app.version'),
    bootstrap: () => invoke('app.bootstrap'),
    notifyDataChanged: () => ipcRenderer.send('app.notifyDataChanged'),
    onDataChanged: (cb: () => void) => {
      const handler = () => cb()
      ipcRenderer.on('app:data-changed', handler)
      return () => ipcRenderer.removeListener('app:data-changed', handler)
    }
  },
  updates: {
    getState: () => invoke('updates.getState'),
    check: () => invoke('updates.check'),
    download: () => invoke('updates.download'),
    install: () => invoke('updates.install'),
    onStateChanged: (cb: (state: UpdateState) => void) => {
      const handler = (_event: IpcRendererEvent, state: UpdateState) => cb(state)
      ipcRenderer.on('updates:state', handler)
      return () => ipcRenderer.removeListener('updates:state', handler)
    }
  },
  imports: {
    preview: (payload) => invoke('imports.preview', payload),
    execute: (payload) => invoke('imports.execute', payload),
    analyze: (payload) => invoke('imports.analyze', payload),
    commitDraft: (payload) => invoke('imports.commitDraft', payload),
    createMissing: (payload) => invoke('imports.createMissing', payload),
    template: () => invoke('imports.template'),
    testdata: () => invoke('imports.testdata'),
    editableExport: () => invoke('imports.editableExport')
  },
  bankImports: {
    preview: (payload) => invoke('bankImports.preview', payload),
    commit: (payload) => invoke('bankImports.commit', payload)
  },
  bankTransactions: {
    list: (payload) => invoke('bankTransactions.list', payload),
    importStatus: () => invoke('bankTransactions.importStatus'),
    get: (payload) => invoke('bankTransactions.get', payload),
    matches: (payload) => invoke('bankTransactions.matches', payload),
    link: (payload) => invoke('bankTransactions.link', payload),
    check: (payload) => invoke('bankTransactions.check', payload),
    reopen: (payload) => invoke('bankTransactions.reopen', payload)
  },
  shell: {
    showItemInFolder: (fullPath: string) =>
      invokeRaw<RendererResultAt<'shell.showItemInFolder'>>('shell.showItemInFolder', { fullPath }),
    openPath: (fullPath: string) =>
      invokeRaw<RendererResultAt<'shell.openPath'>>('shell.openPath', { fullPath }),
    openExternal: (url: string) =>
      invokeRaw<RendererResultAt<'shell.openExternal'>>('shell.openExternal', { url })
  },
  submissions: {
    list: (payload) => invoke('submissions.list', payload),
    get: (payload) => invoke('submissions.get', payload),
    import: (payload) => invoke('submissions.import', payload),
    importFromFile: () => invoke('submissions.importFromFile'),
    exportCatalog: () => invoke('submissions.exportCatalog'),
    approve: (payload) => invoke('submissions.approve', payload),
    reject: (payload) => invoke('submissions.reject', payload),
    delete: (payload) => invoke('submissions.delete', payload),
    convert: (payload) => invoke('submissions.convert', payload),
    summary: () => invoke('submissions.summary'),
    readAttachment: (payload) => invoke('submissions.readAttachment', payload)
  },
  organizations: {
    list: () => invoke('organizations.list'),
    active: () => invoke('organizations.active'),
    create: (payload: { name: string }) => invoke('organizations.create', payload),
    switch: (payload: { orgId: string }) => invoke('organizations.switch', payload),
    rename: (payload: { orgId: string; name: string }) => invoke('organizations.rename', payload),
    delete: (payload: { orgId: string; deleteData?: boolean }) =>
      invoke('organizations.delete', payload),
    getAppearance: (payload: { orgId: string }) => invoke('organizations.getAppearance', payload),
    setAppearance: (payload: {
      orgId: string
      colorTheme?: string
      backgroundImage?: string
      customBackgroundImage?: string | null
      glassModals?: boolean
    }) => invoke('organizations.setAppearance', payload),
    activeAppearance: () => invoke('organizations.activeAppearance'),
    onSwitched: (cb: (org: { id: string; name: string; dbRoot: string }) => void) => {
      const handler = (
        _event: IpcRendererEvent,
        org: { id: string; name: string; dbRoot: string }
      ) => cb(org)
      ipcRenderer.on('organizations:switched', handler)
      return () => ipcRenderer.removeListener('organizations:switched', handler)
    }
  }
} satisfies RendererApi

contextBridge.exposeInMainWorld('api', rendererApi)

export {}
