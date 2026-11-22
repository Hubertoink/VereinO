import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'

function makeElement() {
  return {
    value: '', textContent: '' as string | number, innerHTML: '', className: '', src: '', hidden: false,
    dataset: {} as Record<string, unknown>,
    classList: { add: jest.fn(), remove: jest.fn() },
    addEventListener: jest.fn(), querySelectorAll: () => [], querySelector: () => null,
    setAttribute: jest.fn(), removeAttribute: jest.fn(), remove: jest.fn()
  }
}

function startApp(initialSubmissions: Array<Record<string, unknown>> = []) {
  const elements = new Map<string, ReturnType<typeof makeElement>>()
  const element = (id: string) => {
    if (!elements.has(id)) {
      const node = makeElement()
      node.hidden = id === 'list-view'
      elements.set(id, node)
    }
    return elements.get(id)!
  }
  const stored = new Map<string, string>([['vereino-submissions', JSON.stringify(initialSubmissions)]])
  let storageFails = false
  let records = [...initialSubmissions]
  let attachmentBlob: Blob | undefined
  const write = (next: Array<Record<string, unknown>>) => {
    if (storageFails) throw new Error('QuotaExceededError')
    records = next
    return next
  }
  const toBlob = jest.fn((callback: (value: Blob) => void) => callback(new Blob(['jpeg'], { type: 'image/jpeg' })))
  const toasts: ReturnType<typeof makeElement>[] = []
  const context = vm.createContext({
    console: { error: jest.fn() },
    listSubmissions: async () => records,
    deleteSubmission: (id: string) => write(records.filter(row => row.id !== id)),
    clearSubmissions: () => write([]),
    addSubmission: (row: Record<string, unknown>, blob?: Blob) => {
      const saved = write([...records, row])
      attachmentBlob = blob
      return saved
    },
    URL: { createObjectURL: () => 'blob:test', revokeObjectURL: jest.fn() },
    document: {
      getElementById: element,
      querySelectorAll: () => [],
      querySelector: (selector: string) => selector === '.toast' ? null : element(selector),
      addEventListener: jest.fn(),
      createElement: (tag: string) => tag === 'canvas'
        ? { getContext: () => ({ drawImage: jest.fn() }), toBlob }
        : makeElement(),
      body: { appendChild: (node: ReturnType<typeof makeElement>) => toasts.push(node) }
    },
    localStorage: { getItem: (key: string) => stored.get(key) ?? null, setItem: jest.fn(), removeItem: (key: string) => stored.delete(key) },
    requestAnimationFrame: (callback: () => void) => callback(),
    setTimeout: jest.fn(),
    Image: class {
      width = 1600
      height = 1200
      async decode() {}
    }
  })
  const script = fs.readFileSync(path.join(process.cwd(), 'submission-web/src/app.js'), 'utf8')
  vm.runInContext(script.replace(/^import .*submissionStore\.js'$/m, ''), context)
  function fillForm() {
    for (const [id, value] of Object.entries({ date: '2026-11-17', amount: '12.34',
      description: 'Fahrkarte', submitter: 'Testperson', type: 'OUT', sphere: 'IDEELL', paymentMethod: 'BANK' })) {
      element(id).value = value
    }
  }
  function selectFile(name = 'beleg.PNG', type = 'image/png') {
    context.handleImageSelect({ target: { files: [new File(['source'], name, { type })] } })
    return vm.runInContext('selectedAttachment.ready', context)
  }
  return {
    context, element, records: () => records, savedBlob: () => attachmentBlob, toBlob, toasts, fillForm, selectFile,
    setStorageFailure: (value: boolean) => { storageFails = value },
    submissions: () => vm.runInContext('submissions', context) as Array<Record<string, unknown>>,
    attachment: () => vm.runInContext('selectedAttachment', context) as Record<string, unknown> | null,
    submit: () => context.handleFormSubmit({ preventDefault: jest.fn() }),
    confirm: () => vm.runInContext('confirmCallback()', context)
  }
}

it('keeps the draft, attachment, list and badges unchanged when persistence fails, and allows one successful retry', async () => {
  const app = startApp()
  app.fillForm()
  await app.selectFile()
  app.setStorageFailure(true)
  await app.submit()

  expect(app.submissions()).toHaveLength(0)
  expect(app.records()).toEqual([])
  expect(app.element('badge-count').textContent).toBe(0)
  expect(app.element('nav-badge').dataset.count).toBe(0)
  expect(app.element('amount').value).toBe('12.34')
  expect(app.element('description').value).toBe('Fahrkarte')
  expect(app.attachment()).toBeTruthy()
  expect(app.toasts.map(toast => toast.className)).toEqual(['toast error'])

  app.setStorageFailure(false)
  await app.submit()
  expect(app.submissions()).toHaveLength(1)
  expect(app.records()).toEqual(app.submissions())
  expect(app.submissions()[0]).toMatchObject({ grossAmount: 1234, description: 'Fahrkarte',
    attachment: { name: 'beleg.jpg', mimeType: 'image/jpeg' } })
  expect(await app.savedBlob()?.text()).toBe('jpeg')
  expect(app.element('badge-count').textContent).toBe(1)
  expect(app.element('amount').value).toBe('')
  expect(app.attachment()).toBeNull()
  expect(app.toasts.map(toast => toast.className)).toEqual(['toast error', 'toast success'])
})

it.each(['delete', 'clear'] as const)('preserves persisted and displayed submissions when %s cannot be saved', async action => {
  const original = [{ id: 'existing', description: 'Vorhandene Buchung' }]
  const app = startApp(original)
  app.setStorageFailure(true)
  if (action === 'delete') app.context.handleDeleteSubmission('existing')
  else app.context.handleClearAll()
  await app.confirm()

  expect(app.submissions()).toEqual(original)
  expect(app.records()).toEqual(original)
  expect(app.element('badge-count').textContent).toBe(1)
  expect(app.toasts.map(toast => toast.className)).toEqual(['toast error'])
})

it.each([['beleg.PNG', 'beleg.jpg'], ['scan.webp', 'scan.jpg'], ['foto', 'foto.jpg']])(
  'uses JPEG metadata after compressing %s', async (name, expectedName) => {
    const app = startApp()
    const attachment = await app.selectFile(name, 'image/png')
    expect(app.toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/jpeg', 0.8)
    expect(attachment.name).toBe(expectedName)
    expect(attachment.blob.type).toBe('image/jpeg')
  }
)

it('preserves filename, MIME type and bytes for an uncompressed PDF', async () => {
  const app = startApp()
  const attachment = await app.selectFile('rechnung.pdf', 'application/pdf')
  expect(app.toBlob).not.toHaveBeenCalled()
  expect(attachment.name).toBe('rechnung.pdf')
  expect(attachment.blob.type).toBe('application/pdf')
  expect(await attachment.blob.text()).toBe('source')
})
