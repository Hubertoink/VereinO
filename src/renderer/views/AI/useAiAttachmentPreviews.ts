import { useEffect, useState } from 'react'
import { attachmentBadge, filePreviewKey, type AiAttachmentPreview } from './aiAttachments'

/** Verwaltet Objekt-URLs zentral und gibt sie beim Wechsel oder Unmount frei. */
export function useAiAttachmentPreviews(files: File[]) {
  const [previews, setPreviews] = useState<AiAttachmentPreview[]>([])

  useEffect(() => {
    const nextPreviews = files.map((file) => ({
      key: filePreviewKey(file),
      name: file.name,
      url: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
      badge: attachmentBadge(file)
    }))
    setPreviews(nextPreviews)
    return () => nextPreviews.forEach((preview) => preview.url && URL.revokeObjectURL(preview.url))
  }, [files])

  return previews
}
