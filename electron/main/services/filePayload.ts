import type { FileDataPayload, UploadFilePayload } from '../../../shared/filePayload'

export function filePayloadToBuffer(payload: FileDataPayload): Buffer {
  if (payload.dataBytes instanceof Uint8Array) {
    return Buffer.from(
      payload.dataBytes.buffer,
      payload.dataBytes.byteOffset,
      payload.dataBytes.byteLength
    )
  }
  if (typeof payload.dataBase64 === 'string' && payload.dataBase64.length > 0) {
    return Buffer.from(payload.dataBase64, 'base64')
  }
  throw new Error('Dateidaten fehlen.')
}

export function filePayloadToBase64(payload: FileDataPayload): string {
  return filePayloadToBuffer(payload).toString('base64')
}

export function normalizeUploadFilesForJson(
  files: UploadFilePayload[] | undefined
): Array<{ name: string; dataBase64: string; mime?: string }> {
  return (files || []).map((file) => ({
    name: file.name,
    dataBase64: filePayloadToBase64(file),
    mime: file.mime
  }))
}
