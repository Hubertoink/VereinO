import { useCallback, useMemo, useRef, useState, type DragEvent } from 'react'
import { filePreviewKey, isAiAttachmentFile } from './aiAttachments'
import { useAiAttachmentPreviews } from './useAiAttachmentPreviews'
import { activeMentionTrigger, mentionInsertToken } from './aiMentions'
import { normalizeLookup } from './aiText'
import type { AiMentionOption, Notify } from './aiViewTypes'

export function useAiComposer(notify: Notify, mentionOptions: AiMentionOption[]) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const promptInputRef = useRef<HTMLTextAreaElement | null>(null)
  const dragDepthRef = useRef(0)
  const [promptCursor, setPromptCursor] = useState(0)
  const [files, setFiles] = useState<File[]>([])
  const filePreviews = useAiAttachmentPreviews(files)
  const [isDraggingFiles, setIsDraggingFiles] = useState(false)
  const [prompt, setPrompt] = useState('')
  const appendFiles = useCallback(
    (incoming: FileList | File[] | null) => {
      const nextFiles = Array.from(incoming || [])
      if (!nextFiles.length) return
      const accepted = nextFiles.filter(isAiAttachmentFile)
      const skipped = nextFiles.length - accepted.length
      if (skipped > 0) {
        notify(
          'info',
          `${skipped} Datei(en) wurden übersprungen. Erlaubt sind PDF, PNG, JPG, XLSX, XLS, CSV und TSV.`
        )
      }
      if (!accepted.length) return
      setFiles((current) => {
        const existingKeys = new Set(current.map(filePreviewKey))
        const additions = accepted.filter((file) => !existingKeys.has(filePreviewKey(file)))
        return additions.length ? [...current, ...additions] : current
      })
    },
    [notify]
  )

  const handleComposerDragEnter = useCallback((event: DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer?.types?.includes('Files')) return
    event.preventDefault()
    dragDepthRef.current += 1
    setIsDraggingFiles(true)
  }, [])

  const handleComposerDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer?.types?.includes('Files')) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
    setIsDraggingFiles(true)
  }, [])

  const handleComposerDragLeave = useCallback((event: DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer?.types?.includes('Files')) return
    event.preventDefault()
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
    if (dragDepthRef.current === 0) setIsDraggingFiles(false)
  }, [])

  const handleComposerDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (!event.dataTransfer?.files?.length) return
      event.preventDefault()
      dragDepthRef.current = 0
      setIsDraggingFiles(false)
      appendFiles(event.dataTransfer.files)
    },
    [appendFiles]
  )

  const activeMention = useMemo(
    () => activeMentionTrigger(prompt, promptCursor),
    [prompt, promptCursor]
  )
  const visibleMentions = useMemo(() => {
    if (!activeMention) return []
    const query = normalizeLookup(activeMention.query)
    return mentionOptions
      .filter((option) => {
        if (!query) return true
        return normalizeLookup(`${option.label} ${option.insert} ${option.scope}`).includes(query)
      })
      .slice(0, 9)
  }, [activeMention, mentionOptions])
  const removeFile = (key: string) => {
    setFiles((current) => current.filter((file) => filePreviewKey(file) !== key))
  }

  const syncPromptCursor = () => {
    const element = promptInputRef.current
    if (element) setPromptCursor(element.selectionStart || 0)
  }

  const insertMention = (option: AiMentionOption) => {
    const trigger = activeMention || activeMentionTrigger(prompt, promptCursor)
    const token = mentionInsertToken(option)
    const start = trigger?.start ?? promptCursor
    const end = trigger?.end ?? promptCursor
    const nextPrompt = `${prompt.slice(0, start)}${token} ${prompt.slice(end)}`
    const nextCursor = start + token.length + 1
    setPrompt(nextPrompt)
    setPromptCursor(nextCursor)
    window.setTimeout(() => {
      promptInputRef.current?.focus()
      promptInputRef.current?.setSelectionRange(nextCursor, nextCursor)
    }, 0)
  }

  return {
    fileInputRef,
    promptInputRef,
    files,
    setFiles,
    filePreviews,
    prompt,
    setPrompt,
    setPromptCursor,
    visibleMentions,
    isDraggingFiles,
    appendFiles,
    removeFile,
    syncPromptCursor,
    insertMention,
    handleComposerDragEnter,
    handleComposerDragOver,
    handleComposerDragLeave,
    handleComposerDrop
  }
}
