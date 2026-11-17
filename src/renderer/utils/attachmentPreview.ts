export const isPdfAttachment = (file: File) => file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
export const canPreviewAttachment = (file: File) => isPdfAttachment(file) || /^image\/(png|jpeg|webp|gif|avif|bmp)$/.test(file.type) || /\.(png|jpe?g|webp|gif|avif|bmp)$/i.test(file.name)

export type AttachmentPreviewRequest = {
  file: File
  origin: { x: number; y: number; width: number; height: number }
}
