import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const base = 'http://localhost:4317'
const source = path.resolve('submission-web/src')
const legacy = {
  id: 'old', date: '2026-11-17', type: 'OUT', sphere: 'IDEELL', paymentMethod: 'BANK',
  grossAmount: 1234, description: 'Altbestand', submittedBy: 'Testperson',
  attachment: { name: 'original.pdf', mimeType: 'application/pdf', dataBase64: 'AQID/w==' }
}

test.beforeEach(async ({ context }) => {
  await context.route(base + '/**', async route => {
    const name = new URL(route.request().url()).pathname.slice(1) || 'index.html'
    const contentType = { 'index.html': 'text/html', 'app.js': 'text/javascript',
      'submissionStore.js': 'text/javascript', 'styles.css': 'text/css' }[name]
    if (!contentType) return route.fulfill({ status: 404 })
    await route.fulfill({ contentType, body: await readFile(path.join(source, name)) })
  })
})

async function fill(page: Page, description: string) {
  await page.locator('#amount').fill('12.34')
  await page.locator('#description').fill(description)
  await page.locator('#submitter').fill('Testperson')
}

async function download(page: Page) {
  await page.locator('#nav-list').click()
  const event = page.waitForEvent('download')
  await page.locator('#btn-download').click()
  const file = await event
  expect(file.suggestedFilename()).toMatch(/\.vereino-submission\.json$/)
  return JSON.parse(await readFile((await file.path())!, 'utf8'))
}

async function counts(page: Page) {
  return page.evaluate(() => new Promise<number[]>((resolve, reject) => {
    const open = indexedDB.open('vereino-submissions')
    open.onsuccess = () => {
      const db = open.result
      const tx = db.transaction(['submissions', 'attachments'])
      const records = tx.objectStore('submissions').count()
      const files = tx.objectStore('attachments').count()
      tx.oncomplete = () => { db.close(); resolve([records.result, files.result]) }
      tx.onabort = () => reject(tx.error)
    }
    open.onerror = () => reject(open.error)
  }))
}

test('migrates and reopens legacy records, exports the same attachment, removes both stores on delete', async ({ page }) => {
  await page.goto(base)
  await page.evaluate(row => localStorage.setItem('vereino-submissions', JSON.stringify([row])), legacy)
  await page.reload()
  await expect(page.locator('#badge-count')).toHaveText('1')
  expect(await page.evaluate(() => localStorage.getItem('vereino-submissions'))).toBeNull()
  // Simulate a reload after the data committed but before legacy cleanup completed.
  await page.evaluate(row => localStorage.setItem('vereino-submissions', JSON.stringify([row])), legacy)
  await page.reload()
  await expect(page.locator('#badge-count')).toHaveText('1')
  expect(await counts(page)).toEqual([1, 1])
  expect(await download(page)).toMatchObject({ version: '1.1', submissions: [
    { externalId: 'old', grossAmount: 1234, description: 'Altbestand', attachment: legacy.attachment }
  ] })
  await page.locator('.btn-delete-submission').click()
  await page.locator('#confirm-ok').click()
  await expect(page.locator('#badge-count')).toHaveText('0')
  expect(await counts(page)).toEqual([0, 0])
  await page.reload()
  await expect(page.locator('#submissions-list .submission-card')).toHaveCount(0)
})

test('keeps legacy bytes and rolls back all rows on an unsuccessful migration', async ({ page }) => {
  await page.goto(base)
  const original = JSON.stringify([legacy, { ...legacy, description: 'duplicate ID' }])
  await page.evaluate(raw => localStorage.setItem('vereino-submissions', raw), original)
  await page.reload()
  await expect(page.locator('.toast.error')).toContainText('nicht geladen')
  expect(await page.evaluate(() => localStorage.getItem('vereino-submissions'))).toBe(original)
  expect(await counts(page)).toEqual([0, 0])
})

test('a failed attachment write rolls back metadata and leaves the draft ready for retry', async ({ page }) => {
  await page.goto(base)
  await fill(page, 'Beleg mit Datei')
  const payload = { name: 'original.pdf', mimeType: 'application/pdf', buffer: Buffer.from([1, 2, 3, 255]) }
  await page.locator('#image-input').setInputFiles(payload)
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.add
    IDBObjectStore.prototype.add = function (...args) {
      if (this.name === 'attachments') {
        IDBObjectStore.prototype.add = original
        throw new DOMException('quota', 'QuotaExceededError')
      }
      return original.apply(this, args)
    }
  })
  await page.locator('.form-submit').click()
  await expect(page.locator('.toast.error')).toContainText('nicht gespeichert')
  expect(await counts(page)).toEqual([0, 0])
  await expect(page.locator('#description')).toHaveValue('Beleg mit Datei')
  await page.locator('.form-submit').click()
  await expect(page.locator('#badge-count')).toHaveText('1')
  await page.reload()
  expect((await download(page)).submissions[0].attachment).toEqual(legacy.attachment)
  await page.locator('#btn-clear').click()
  await page.locator('#confirm-ok').click()
  await expect(page.locator('#badge-count')).toHaveText('0')
  expect(await counts(page)).toEqual([0, 0])
})

test('waits for the selected image, ignores an older decode, and clears the attachment for the next entry', async ({ page }) => {
  await page.goto(base)
  await fill(page, 'Erste Buchung')
  await page.evaluate(() => {
    const nativeDecode = HTMLImageElement.prototype.decode
    const queue: (() => void)[] = []
    Object.assign(window, { finishDecode: (index: number) => queue[index]() })
    HTMLImageElement.prototype.decode = function () {
      return new Promise<void>(resolve => queue.push(resolve)).then(() => nativeDecode.call(this))
    }
  })
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/VHM9WQAAAABJRU5ErkJggg==', 'base64')
  await page.locator('#image-input').setInputFiles({ name: 'alt.png', mimeType: 'image/png', buffer: png })
  await page.locator('#image-input').setInputFiles({ name: 'neu.png', mimeType: 'image/png', buffer: png })
  await page.locator('.form-submit').click()
  await expect(page.locator('#submission-form')).toHaveAttribute('aria-busy', 'true')
  await expect(page.locator('#badge-count')).toHaveText('0')
  await page.evaluate(() => (window as Window & { finishDecode(i: number): void }).finishDecode(1))
  await expect(page.locator('#badge-count')).toHaveText('1')
  await page.evaluate(() => (window as Window & { finishDecode(i: number): void }).finishDecode(0))
  await fill(page, 'Zweite Buchung')
  await page.locator('.form-submit').click()
  await expect(page.locator('#badge-count')).toHaveText('2')
  const rows = (await download(page)).submissions
  expect(rows[0].attachment).toMatchObject({ name: 'neu.jpg', mimeType: 'image/jpeg' })
  expect(Buffer.from(rows[0].attachment.dataBase64, 'base64').subarray(0, 2)).toEqual(Buffer.from([255, 216]))
  expect(rows[1].attachment).toBeNull()
})

test('retains independent writes from two tabs and exports a 6 MiB PDF byte for byte', async ({ page, context }) => {
  const other = await context.newPage()
  await Promise.all([page.goto(base), other.goto(base)])
  const bytes = Buffer.alloc(6 * 1024 * 1024, 0xa5)
  await Promise.all([fill(page, 'Großer Beleg'), fill(other, 'Zweiter Tab')])
  await page.locator('#image-input').setInputFiles({ name: 'stapel.pdf', mimeType: 'application/pdf', buffer: bytes })
  await Promise.all([page.locator('.form-submit').click(), other.locator('.form-submit').click()])
  await expect(page.locator('#amount')).toHaveValue('')
  await expect(other.locator('#amount')).toHaveValue('')
  await page.reload()
  await expect(page.locator('#badge-count')).toHaveText('2')
  expect(await counts(page)).toEqual([2, 1])
  expect(await page.evaluate(() => localStorage.getItem('vereino-submissions'))).toBeNull()
  const { submissions } = await download(page)
  const receipt = submissions.find((row: { description: string }) => row.description === 'Großer Beleg')
  expect(receipt.attachment.name).toBe('stapel.pdf')
  expect(Buffer.from(receipt.attachment.dataBase64, 'base64').equals(bytes)).toBe(true)
  expect(submissions.find((row: { description: string }) => row.description === 'Zweiter Tab').attachment).toBeNull()
})
