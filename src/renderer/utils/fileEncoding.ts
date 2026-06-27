export type Base64UploadFile = {
  name: string
  dataBase64: string
  mime?: string
}

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

export async function encodeFileForUpload(file: File): Promise<Base64UploadFile> {
  return {
    name: file.name,
    dataBase64: bufferToBase64Safe(await file.arrayBuffer()),
    mime: file.type || undefined
  }
}

export async function encodeFilesForUpload(files: File[]): Promise<Base64UploadFile[]> {
  return Promise.all(files.map((file) => encodeFileForUpload(file)))
}
