import { clipboard } from 'electron'

/** Read the native image only in response to an explicit paste action. */
export function readClipboardImage() {
  const image = clipboard.readImage()
  if (image.isEmpty()) return null
  const dataBytes = image.toPNG()
  if (dataBytes.byteLength > 25 * 1024 * 1024) throw new Error('Das Bild aus der Zwischenablage darf maximal 25 MB groß sein.')
  return { dataBytes: new Uint8Array(dataBytes), fileName: `Foto-${new Date().toISOString().replace(/[:.]/g, '-')}.png` }
}
