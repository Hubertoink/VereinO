import { clipboard } from 'electron'

/** Read the native image only in response to an explicit paste action. */
export async function readClipboardImage() {
  const extensions = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }
  for (const item of await clipboard.read()) {
    const mimeType = (Object.keys(extensions) as Array<keyof typeof extensions>).find(type => item.types.includes(type))
    if (!mimeType) continue
    const blob = await item.getType(mimeType)
    if (!('arrayBuffer' in blob) || !blob.size) continue
    if (blob.size > 25 * 1024 * 1024) throw new Error('Das Bild aus der Zwischenablage darf maximal 25 MB groß sein.')
    return { dataBytes: new Uint8Array(await blob.arrayBuffer()), mimeType,
      fileName: `Foto-${new Date().toISOString().replace(/[:.]/g, '-')}.${extensions[mimeType]}` }
  }
  return null
}
