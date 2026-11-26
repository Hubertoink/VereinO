import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { initializeExistingOrganization } from './fixtures/initializedOrganization'

const width = 960, height = 540
let profile: string
let app: ElectronApplication

test.beforeEach(async () => {
  profile = await fs.mkdtemp(path.join(os.tmpdir(), 'vereino-camera-'))
  const fixture = path.join(profile, 'receipt.y4m')
  const pixels = Buffer.alloc(width * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Shelves and a bright window around a low-contrast page; a hand breaks its right edge.
      let level = x < 310 ? (y % 90 < 10 || x % 29 < 5 ? 154 : 61) : x > 710 ? 229 : 168
      const left = 333 - Math.round(y / 65)
      const right = 622 + Math.round(y / 85)
      if (x >= left && x < right && y >= 67 - Math.round((x - left) / 62) && y < 484) {
        const ink = x > 355 && x < 594 && y > 91 && y < 455 && y % 17 < 3 && x % 13 < 10
        level = ink ? 95 : 205
      }
      if (x > 587 && x < 680 && y > 180 && y < 230) level = 150
      // One-sided ink mark to verify orientation in the encoded JPEG.
      if (x > 350 && x < 400 && y > 112 && y < 155) level = 25
      pixels[y * width + x] = level
    }
  }
  await fs.writeFile(fixture, Buffer.concat([Buffer.from(`YUV4MPEG2 W${width} H${height} F15:1 Ip A1:1 C420jpeg\nFRAME\n`), pixels, Buffer.alloc(width * height / 2, 128)]))
  const main = path.join(profile, 'camera-test.cjs')
  // Load the built app with its production file URLs and content security policy.
  await fs.writeFile(main, "Object.defineProperty(require('electron').app, 'isPackaged', { value: true });\nrequire(" + JSON.stringify(path.resolve('dist-electron/main/index.cjs')) + ")")
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  app = await electron.launch({ args: [main, '--user-data-dir=' + profile,
    '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--use-file-for-fake-video-capture=' + fixture], env })
  await initializeExistingOrganization(await app.firstWindow())
})

test.afterEach(async () => {
  await app?.evaluate(({ app }) => app.exit(0)).catch(() => undefined)
  await fs.rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
})

test('webcam capture reviews a cropped receipt, retakes and attaches one JPEG', async () => {
    const page = await app.firstWindow()
    await page.keyboard.press('Alt+n')
    const booking = page.locator('.compact-booking-flyout')
    await expect(booking).toBeVisible()
    await booking.getByRole('button', { name: 'Einnahme', exact: true }).click()
    await booking.getByRole('button', { name: '+ Anhang', exact: true }).click()
    const camera = booking.getByRole('button', { name: 'Kamera öffnen' })
    await camera.click()
    const dialog = page.getByRole('dialog', { name: 'Beleg fotografieren' })
    await expect(dialog.getByRole('button', { name: 'Foto aufnehmen' })).toBeEnabled()
    const track = await dialog.locator('video').evaluateHandle(video => (video.srcObject as MediaStream).getVideoTracks()[0])
    const frame = await dialog.locator('video').boundingBox()
    expect(frame!.width / frame!.height).toBeCloseTo(0.75, 2)
    const preview = dialog.getByRole('img')
    await expect(preview).toBeVisible({ timeout: 20000 })
    expect(await track.evaluate(t => t.readyState)).toBe('ended')
    const aspect = () => preview.evaluate(img => (img as HTMLImageElement).naturalWidth / (img as HTMLImageElement).naturalHeight)
    expect(await aspect()).toBeCloseTo(0.71, 1)
    const mirror = dialog.getByRole('checkbox', { name: 'Horizontal spiegeln' })
    await expect(mirror).toBeChecked()
    const rightMark = () => preview.evaluate(async el => {
      const img = el as HTMLImageElement
      await img.decode()
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = 100
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, 100, 100)
      return ctx.getImageData(85, 16, 1, 1).data[0] < 70
    })
    await expect.poll(rightMark).toBe(true)
    await mirror.uncheck()
    await expect.poll(rightMark).toBe(false)
    await dialog.getByRole('button', { name: 'Erneut aufnehmen' }).click()
    await dialog.getByRole('button', { name: 'Foto aufnehmen' }).click()
    await expect(preview).toBeVisible()
    expect(await aspect()).toBeCloseTo(0.75, 2)
    await dialog.getByRole('button', { name: 'Als Anhang übernehmen' }).click()
    await expect(dialog).toHaveCount(0)
    await expect(booking.getByRole('button', { name: /^Beleg-.*\.jpg anzeigen$/ })).toHaveCount(1)
    await camera.click()
    await expect(mirror).not.toBeChecked()
    await dialog.getByLabel('Bildausschnitt').selectOption('full')
    await expect(dialog.getByRole('button', { name: 'Foto aufnehmen' })).toBeEnabled()
    const fullFrame = await dialog.locator('video').boundingBox()
    expect(fullFrame!.width / fullFrame!.height).toBeCloseTo(width / height, 2)
    const abandoned = await dialog.locator('video').evaluateHandle(video => (video.srcObject as MediaStream).getVideoTracks()[0])
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    expect(await abandoned.evaluate(t => t.readyState)).toBe('ended')
    await expect(booking).toBeVisible()
    await page.evaluate(() => {
      navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Denied', 'NotAllowedError') }
    })
    await camera.click()
    await expect(dialog.getByRole('alert')).toContainText('Kamerazugriff verweigert')
    await dialog.getByRole('button', { name: 'Kamera schließen' }).click()
    await expect(booking.getByRole('button', { name: /^Beleg-.*\.jpg anzeigen$/ })).toHaveCount(1)
})

test('a translated noisy burst preserves print edges and reduces pixel error', async () => {
  const page = await app.firstWindow()
  const metrics = await page.evaluate(async () => {
    const w = 240, h = 180
    const clean = (x: number, y: number) => {
      const row = Math.floor(y / 13)
      return (x + row * 3) % (12 + row % 5) < 6 && y % 13 < 7 ? 42 : 208
    }
    let seed = 42
    const frames = [[0,0], [3,2], [-1,3], [2,-2], [-3,-1]].map(([dx, dy]) => {
      const frame = new ImageData(w, h)
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
        const value = clean(x - dx, y - dy) + (seed % 19) - 9
        frame.data.set([value, value, value, 255], 4 * (y * w + x))
      }
      return frame
    })
    const worker = new Worker(new URL('./scanner/document-worker.js', document.baseURI))
    try {
      const fused = await new Promise<ImageData>((resolve, reject) => {
        worker.onerror = () => reject(new Error('Scanner worker failed'))
        worker.onmessage = ({ data }) => {
          if (data.type === 'ready') worker.postMessage({ type: 'capture', frames })
          else if (data.type === 'capture') resolve(data.image)
          else reject(new Error('Burst failed'))
        }
      })
      let before = 0, after = 0, worst = 0
      for (let y = 8; y < h-8; y++) for (let x = 8; x < w-8; x++) {
        const i = 4 * (y * w + x), target = clean(x, y)
        before += (frames[0].data[i] - target) ** 2
        after += (fused.data[i] - target) ** 2
        worst = Math.max(worst, Math.abs(fused.data[i] - target))
      }
      // A soft ink edge should gain contrast without creating dark or light halos.
      const ramp = [40, 40, 40, 55, 85, 155, 185, 200, 200, 200]
      const soft = new ImageData(ramp.length, 10)
      for (let p = 0; p < ramp.length * 10; p++) {
        const level = ramp[p % ramp.length]
        soft.data.set([level, level, level, 255], 4 * p)
      }
      const sharpened = await new Promise<ImageData>((resolve, reject) => {
        worker.onmessage = ({ data }) => data.type === 'capture' ? resolve(data.image) : reject(new Error('Capture failed'))
        worker.postMessage({ type: 'capture', frames: [soft] })
      })
      const row = ramp.map((_, x) => sharpened.data[4 * (5 * ramp.length + x)])
      return { ratio: after / before, worst, contrastGain: (row[5] - row[4]) - (ramp[5] - ramp[4]),
        darkest: Math.min(...row), lightest: Math.max(...row) }
    } finally { worker.terminate() }
  })
  expect(metrics.ratio).toBeLessThan(0.6)
  expect(metrics.worst).toBeLessThanOrEqual(9)
  expect(metrics.contrastGain).toBeGreaterThan(0)
  expect(metrics.darkest).toBe(40)
  expect(metrics.lightest).toBe(200)
})

test('single invoice flyout passes the confirmed camera photo and guidance to AI extraction', async () => {
  const page = await app.firstWindow()
  await app.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('ocr.extract')
    ipcMain.handle('ocr.extract', () => {
      const text = 'Angebot\nEndsumme EUR 3.998,40'
      return { text, confidence: 92, pages: [{ text, confidence: 92, words: [
        { text: 'Angebot', x: 20, y: 30, width: 45, height: 12 },
        { text: 'Endsumme', x: 30, y: 180, width: 55, height: 12 },
        { text: 'EUR', x: 120, y: 180, width: 20, height: 12 },
        { text: '3.998,40', x: 190, y: 180, width: 50, height: 12 }
      ] }] }
    })
    ipcMain.removeHandler('ai.settings.get')
    ipcMain.handle('ai.settings.get', () => ({ hasApiKey: true, provider: 'openai' }))
    ipcMain.removeHandler('ai.invoice.extract')
    ipcMain.handle('ai.invoice.extract', (_event, { file, guidance }) => {
      if (file.mimeType !== 'image/jpeg' || file.dataBytes[0] !== 0xff || file.dataBytes[1] !== 0xd8
        || guidance?.instructions !== 'Sommerfest') throw new Error('Foto oder KI-Vorgaben fehlen')
      return {
        result: { invoiceNumber: 'KAMERA-123', description: 'Angebot', grossAmount: 3998.40, netAmount: 3998, taxAmount: 638.43,
          fieldSources: [{ field: 'description', text: 'Angebot', page: 1 }],
          type: 'OUT', sphere: 'IDEELL', warnings: [], budgets: [], earmarks: [], tags: [] },
        timings: { totalMs: 1, analysisMs: 1, doclingMs: null, ocrMs: null }
      }
    })
  })
  await page.locator('[data-shortcut-nav="Buchungen"]').click()
  await page.locator('.invoice-split-fab__new:visible').click()
  const upload = page.locator('.invoice-single-upload-flyout')
  await upload.getByText('KI-Vorgaben', { exact: true }).click()
  await upload.getByLabel('Hinweis an die KI').fill('Sommerfest')
  await upload.getByRole('button', { name: 'Kamera öffnen' }).click()
  const camera = page.getByRole('dialog', { name: 'Beleg fotografieren' })
  await camera.getByRole('button', { name: 'Foto für Rechnung verwenden' }).click()
  const recognition = page.locator('.local-invoice-scan')
  await expect(recognition.getByText(/^Beleg-.*\.jpg$/).first()).toBeVisible()
  await recognition.getByRole('button', { name: 'Mit KI auslesen' }).click()
  await expect(recognition.locator('input[value="KAMERA-123"]')).toBeVisible()
  const gross = recognition.getByRole('button', { name: 'Brutto: Endsumme EUR 3.998,40', exact: true })
  await expect(gross).toBeVisible()
  await gross.click()
  await expect(recognition.getByLabel('Brutto (€)')).toBeFocused()
  await expect(recognition.getByRole('button', { name: /^Netto:/ })).toHaveCount(0)
  await recognition.getByLabel('Brutto (€)').fill('3998.41')
  await expect(gross).toHaveCount(0)
})
