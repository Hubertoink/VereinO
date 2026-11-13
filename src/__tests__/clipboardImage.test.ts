const mockRead = jest.fn()
jest.mock('electron', () => ({ clipboard: { read: mockRead } }))

import { readClipboardImage } from '../../electron/main/services/clipboardImage'

it('returns no file when the native clipboard is empty or contains only text', async () => {
  mockRead.mockResolvedValueOnce([])
  await expect(readClipboardImage()).resolves.toBeNull()
  const getType = jest.fn()
  mockRead.mockResolvedValueOnce([{ types: ['text/plain'], getType }])
  await expect(readClipboardImage()).resolves.toBeNull()
  expect(getType).not.toHaveBeenCalled()
})

it('reads native image data through the Electron 44 MIME API', async () => {
  const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const getType = jest.fn().mockResolvedValue(new Blob([png], { type: 'image/png' }))
  mockRead.mockResolvedValue([{ types: ['text/html', 'image/png'], getType }])
  const result = (await readClipboardImage())!
  expect(getType).toHaveBeenCalledWith('image/png')
  expect(result.dataBytes).toEqual(new Uint8Array(png))
  expect(result.mimeType).toBe('image/png')
  expect(result.fileName).toMatch(/^Foto-[\dT\-]+Z\.png$/)
  expect(result.fileName).not.toMatch(/[:/\\]/)
})

it.each([['image/jpeg', 'jpg'], ['image/webp', 'webp']])('preserves %s image format', async (mimeType, extension) => {
  mockRead.mockResolvedValue([{ types: [mimeType], getType: async () => new Blob(['image'], { type: mimeType }) }])
  const result = (await readClipboardImage())!
  expect(result.mimeType).toBe(mimeType)
  expect(result.fileName.endsWith(`.${extension}`)).toBe(true)
})

it('enforces the invoice upload size limit before allocating image bytes', async () => {
  const arrayBuffer = jest.fn()
  mockRead.mockResolvedValue([{ types: ['image/png'], getType: async () => ({ size: 25 * 1024 * 1024 + 1, arrayBuffer }) }])
  await expect(readClipboardImage()).rejects.toThrow('maximal 25 MB')
  expect(arrayBuffer).not.toHaveBeenCalled()
})

it('propagates native read errors to the paste error handler', async () => {
  mockRead.mockRejectedValueOnce(new Error('Zwischenablage nicht verfügbar'))
  await expect(readClipboardImage()).rejects.toThrow('Zwischenablage nicht verfügbar')
})
