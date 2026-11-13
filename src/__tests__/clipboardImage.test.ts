const mockReadImage = jest.fn()
jest.mock('electron', () => ({ clipboard: { readImage: mockReadImage } }))

import { readClipboardImage } from '../../electron/main/services/clipboardImage'

it('returns no file when the native clipboard contains no image', () => {
  const toPNG = jest.fn()
  mockReadImage.mockReturnValue({ isEmpty: () => true, toPNG })
  expect(readClipboardImage()).toBeNull()
  expect(toPNG).not.toHaveBeenCalled()
})

it('converts a native clipboard image into transferable PNG bytes and a valid filename', () => {
  const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  mockReadImage.mockReturnValue({ isEmpty: () => false, toPNG: () => png })
  const result = readClipboardImage()!
  expect(result.dataBytes).toEqual(new Uint8Array(png))
  expect(result.fileName).toMatch(/^Foto-[\dT\-]+Z\.png$/)
  expect(result.fileName).not.toMatch(/[:/\\]/)
})

it('enforces the invoice upload size limit before sending image data to the renderer', () => {
  mockReadImage.mockReturnValue({ isEmpty: () => false, toPNG: () => ({ byteLength: 25 * 1024 * 1024 + 1 }) })
  expect(() => readClipboardImage()).toThrow('maximal 25 MB')
})
