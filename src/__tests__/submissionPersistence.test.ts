import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'

function makeElement() {
  return {
    value: '', textContent: '' as string | number, innerHTML: '', className: '', src: '', hidden: false,
    dataset: {} as Record<string, unknown>,
    classList: { add: jest.fn(), remove: jest.fn() },
    addEventListener: jest.fn(), querySelectorAll: () => [], querySelector: () => null,
    remove: jest.fn()
  }
}

function startApp(initialSubmissions: Array<Record<string, unknown>> = []) {
  const elements = new Map<string, ReturnType<typeof makeElement>>()
  const element = (id: string) => {
    if (!elements.has(id)) elements.set(id, makeElement())
    return elements.get(id)!
  }
  const stored = new Map<string, string>([['vereino-submissions', JSON.stringify(initialSubmissions)]])
  let storageFails = false
  const setItem = jest.fn((key: string, value: string) => {
    if (storageFails) throw new Error('QuotaExceededError')
    stored.set(key, value)
  })
  const toDataURL = jest.fn(() => 'data:image/jpeg;base64,anBlZw==')
  const toasts: ReturnType<typeof makeElement>[] = []
  const context = vm.createContext({
    console: { error: jest.fn() },
    document: {
      getElementById: element,
      querySelectorAll: () => [],
      querySelector: (selector: string) => selector === '.toast' ? null : element(selector),
      addEventListener: jest.fn(),
      createElement: (tag: string) => tag === 'canvas'
        ? { getContext: () => ({ drawImage: jest.fn() }), toDataURL }
        : makeElement(),
      body: { appendChild: (node: ReturnType<typeof makeElement>) => toasts.push(node) }
    },
    localStorage: { getItem: (key: string) => stored.get(key) ?? null, setItem, removeItem: (key: string) => stored.delete(key) },
    requestAnimationFrame: (callback: () => void) => callback(),
    setTimeout: jest.fn(),
    FileReader: class {
      onload?: (event: { target: { result: string } }) => void
      readAsDataURL(file: { type: string }) {
        this.onload?.({ target: { result: `data:${file.type};base64,c291cmNl` } })
      }
    },
    Image: class {
      width = 1600
      height = 1200
      onload?: () => void
      set src(_value: string) { this.onload?.() }
    }
  })
  vm.runInContext(fs.readFileSync(path.join(process.cwd(), 'submission-web/src/app.js'), 'utf8'), context)
  function fillForm() {
    for (const [id, value] of Object.entries({ date: '2026-11-17', amount: '12.34',
      description: 'Fahrkarte', submitter: 'Testperson', type: 'OUT', sphere: 'IDEELL', paymentMethod: 'BANK' })) {
      element(id).value = value
    }
  }
  function selectFile(name = 'beleg.PNG', type = 'image/png') {
    context.handleImageSelect({ target: { files: [{ name, type, size: 100 }] } })
  }
  return {
    context, element, stored, setItem, toDataURL, toasts, fillForm, selectFile,
    setStorageFailure: (value: boolean) => { storageFails = value },
    submissions: () => vm.runInContext('submissions', context) as Array<Record<string, unknown>>,
    attachment: () => vm.runInContext('currentImage', context) as Record<string, unknown> | null,
    submit: () => context.handleFormSubmit({ preventDefault: jest.fn() }),
    confirm: () => vm.runInContext('confirmCallback()', context)
  }
}

it('keeps the draft, attachment, list and badges unchanged when persistence fails, and allows one successful retry', () => {
  const app = startApp()
  app.fillForm()
  app.selectFile()
  app.setStorageFailure(true)
  app.submit()

  expect(app.submissions()).toHaveLength(0)
  expect(JSON.parse(app.stored.get('vereino-submissions')!)).toEqual([])
  expect(app.element('badge-count').textContent).toBe(0)
  expect(app.element('nav-badge').dataset.count).toBe(0)
  expect(app.element('amount').value).toBe('12.34')
  expect(app.element('description').value).toBe('Fahrkarte')
  expect(app.attachment()).toMatchObject({ name: 'beleg.jpg', mimeType: 'image/jpeg' })
  expect(app.toasts.map(toast => toast.className)).toEqual(['toast error'])

  app.setStorageFailure(false)
  app.submit()
  expect(app.submissions()).toHaveLength(1)
  expect(JSON.parse(app.stored.get('vereino-submissions')!)).toEqual(app.submissions())
  expect(app.submissions()[0]).toMatchObject({ grossAmount: 1234, description: 'Fahrkarte',
    attachment: { name: 'beleg.jpg', mimeType: 'image/jpeg', dataBase64: 'anBlZw==' } })
  expect(app.element('badge-count').textContent).toBe(1)
  expect(app.element('amount').value).toBe('')
  expect(app.attachment()).toBeNull()
  expect(app.toasts.map(toast => toast.className)).toEqual(['toast error', 'toast success'])
})

it.each(['delete', 'clear'] as const)('preserves persisted and displayed submissions when %s cannot be saved', action => {
  const original = [{ id: 'existing', description: 'Vorhandene Buchung' }]
  const app = startApp(original)
  app.setStorageFailure(true)
  if (action === 'delete') app.context.handleDeleteSubmission('existing')
  else app.context.handleClearAll()
  app.confirm()

  expect(app.submissions()).toEqual(original)
  expect(JSON.parse(app.stored.get('vereino-submissions')!)).toEqual(original)
  expect(app.element('badge-count').textContent).toBe(1)
  expect(app.toasts.map(toast => toast.className)).toEqual(['toast error'])
})

it.each([['beleg.PNG', 'beleg.jpg'], ['scan.webp', 'scan.jpg'], ['foto', 'foto.jpg']])(
  'uses JPEG metadata after compressing %s', (name, expectedName) => {
    const app = startApp()
    app.selectFile(name, 'image/png')
    expect(app.toDataURL).toHaveBeenCalledWith('image/jpeg', 0.8)
    expect(app.attachment()).toEqual({ name: expectedName, mimeType: 'image/jpeg', dataBase64: 'anBlZw==' })
  }
)

it('preserves filename, MIME type and bytes for an uncompressed PDF', () => {
  const app = startApp()
  app.selectFile('rechnung.pdf', 'application/pdf')
  expect(app.toDataURL).not.toHaveBeenCalled()
  expect(app.attachment()).toEqual({ name: 'rechnung.pdf', mimeType: 'application/pdf', dataBase64: 'c291cmNl' })
})
