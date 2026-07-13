import type { IDataAdapter } from './IDataAdapter'
import type { RendererApi } from '../../../types/api'

function browserApi(): RendererApi {
  return (globalThis as typeof globalThis & { window: { api: RendererApi } }).window.api
}

/**
 * Adapter for the Electron preload API and local SQLite database.
 */
export class LocalAdapter implements IDataAdapter {
  constructor(private readonly api: RendererApi = browserApi()) {}

  vouchers: IDataAdapter['vouchers'] = {
    list: async (params) => {
      const limit = params.limit ?? 50
      const offset = params.page && params.page > 1 ? (params.page - 1) * limit : 0
      const yearFilter = params.year
        ? { from: `${params.year}-01-01`, to: `${params.year}-12-31` }
        : {}
      return this.api.vouchers.list({ limit, offset, ...yearFilter })
    },
    recent: (params) => this.api.vouchers.recent(params),
    create: (params) => this.api.vouchers.create(params),
    update: (params) => this.api.vouchers.update(params),
    delete: (params) => this.api.vouchers.delete(params),
    reverse: (params) => this.api.vouchers.reverse(params)
  }

  members: IDataAdapter['members'] = {
    list: (params) => this.api.members.list({
      q: params.search,
      status: params.active ? 'ACTIVE' : undefined
    }),
    get: (params) => this.api.members.get(params),
    create: (params) => this.api.members.create(params),
    update: (params) => this.api.members.update(params),
    delete: (params) => this.api.members.delete(params),
    payments: {
      list: async (params) => {
        const result = await this.api.payments.history({ memberId: params.memberId })
        return { rows: result.rows, total: result.total }
      },
      create: async () => {
        throw new Error('Member payment creation is not available through the local adapter yet.')
      }
    }
  }

  attachments: IDataAdapter['attachments'] = {
    list: (params) => this.api.attachments.list(params),
    add: async (params) => {
      const files: Array<{ id: number }> = []
      for (const source of params.files) {
        const file = source instanceof File
          ? {
              name: source.name,
              dataBytes: new Uint8Array(await source.arrayBuffer()),
              mimeType: source.type || undefined
            }
          : source
        const result = await this.api.attachments.add({
          voucherId: params.voucherId,
          fileName: file.name || 'Datei',
          ...('dataBytes' in file
            ? { dataBytes: file.dataBytes }
            : { dataBase64: file.dataBase64 }),
          mimeType: file.mimeType || ('mime' in file ? file.mime : undefined)
        })
        if (typeof result.id !== 'number') {
          throw new Error('Attachment upload returned no file id.')
        }
        files.push({ id: result.id })
      }
      return { files }
    },
    delete: (params) => this.api.attachments.delete({ fileId: params.id }),
    download: (params) => this.api.attachments.saveAs({ fileId: params.id })
  }

  bindings: IDataAdapter['bindings'] = {
    list: (params) => this.api.bindings.list(params),
    create: (params) => this.api.bindings.upsert(params),
    update: (params) => this.api.bindings.upsert(params),
    delete: (params) => this.api.bindings.delete(params)
  }

  budgets: IDataAdapter['budgets'] = {
    list: (params) => this.api.budgets.list(params),
    create: (params) => this.api.budgets.upsert(params),
    update: (params) => this.api.budgets.upsert(params),
    delete: (params) => this.api.budgets.delete(params)
  }

  tags: IDataAdapter['tags'] = {
    list: (params) => this.api.tags.list(params),
    create: (params) => this.api.tags.upsert(params),
    update: (params) => this.api.tags.upsert(params),
    delete: (params) => this.api.tags.delete(params)
  }

  settings: IDataAdapter['settings'] = {
    get: <T = unknown>(params: { key: string }) => this.api.settings.get<T>(params),
    set: (params) => this.api.settings.set(params),
    delete: (params) => this.api.settings.set({ key: params.key, value: null })
  }

  reports: IDataAdapter['reports'] = {
    years: () => this.api.reports.years(),
    summary: (params) => this.api.reports.summary(params)
  }

  yearEnd: IDataAdapter['yearEnd'] = {
    status: () => this.api.yearEnd.status(),
    preview: (params) => this.api.yearEnd.preview(params),
    export: (params) => this.api.yearEnd.export(params),
    close: (params) => this.api.yearEnd.close(params),
    reopen: (params) => this.api.yearEnd.reopen(params)
  }

  backup: IDataAdapter['backup'] = {
    create: () => this.api.backup.make('manual'),
    restore: (filePath) => this.api.backup.restore(filePath),
    inspect: (dbPath) => this.api.backup.inspect(dbPath),
    inspectCurrent: () => this.api.backup.inspectCurrent()
  }

  db: IDataAdapter['db'] = {
    smartRestore: {
      preview: () => this.api.db.smartRestore.preview(),
      apply: (params) => this.api.db.smartRestore.apply(params)
    }
  }
}
