import type { UploadFilePayload } from '../../../shared/filePayload'

export type BinaryUploadFile = UploadFilePayload & { dataBytes: Uint8Array }

export function bufferToBase64Safe(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  const chunk = 0x8000
  let binary = ''
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)))
  }
  return btoa(binary)
}

export function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export function base64ToFile(name: string, dataBase64: string, mime?: string): File {
  const bytes = base64ToUint8Array(dataBase64)
  const stableBytes = new Uint8Array(bytes.length)
  stableBytes.set(bytes)
  return new File([stableBytes], name, { type: mime || '' })
}

export function uploadPayloadToFile(payload: UploadFilePayload): File {
  if (payload.dataBytes instanceof Uint8Array) {
    const bytes = new Uint8Array(payload.dataBytes.byteLength)
    bytes.set(payload.dataBytes)
    return new File([bytes], payload.name, { type: payload.mime || '' })
  }
  return base64ToFile(payload.name, payload.dataBase64 || '', payload.mime)
}

export async function encodeFileForUpload(file: File): Promise<BinaryUploadFile> {
  return {
    name: file.name,
    dataBytes: new Uint8Array(await file.arrayBuffer()),
    mime: file.type || undefined
  }
}

export async function encodeFilesForUpload(files: File[]): Promise<BinaryUploadFile[]> {
  return Promise.all(files.map((file) => encodeFileForUpload(file)))
}
