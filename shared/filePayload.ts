export type FileDataPayload = {
  dataBytes?: Uint8Array
  dataBase64?: string
}

export type UploadFilePayload = FileDataPayload & {
  name: string
  mime?: string
}
