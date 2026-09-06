import type React from 'react'

type AttachmentPreview = { key: string; name: string; url: string | null; badge: string }
type MentionOption = {
  id: string
  label: string
  scope: 'Bereich' | 'Tag' | 'Kategorie' | 'Zweckbindung' | 'Zahlungskonto' | 'Sphäre'
  insert: string
  description: string
  plannerHint: string
}

type Props = {
  placement: 'initial' | 'followup'
  busy: boolean
  prompt: string
  files: File[]
  filePreviews: AttachmentPreview[]
  visibleMentions: MentionOption[]
  isDraggingFiles: boolean
  promptInputRef: React.RefObject<HTMLTextAreaElement>
  fileInputRef: React.RefObject<HTMLInputElement>
  onPromptChange: (value: string, cursor: number) => void
  onCursorSync: () => void
  onSubmit: () => void
  onAppendFiles: (files: FileList | null) => void
  onRemoveFile: (key: string) => void
  onInsertMention: (option: MentionOption) => void
  onDragEnter: (event: React.DragEvent<HTMLDivElement>) => void
  onDragOver: (event: React.DragEvent<HTMLDivElement>) => void
  onDragLeave: (event: React.DragEvent<HTMLDivElement>) => void
  onDrop: (event: React.DragEvent<HTMLDivElement>) => void
}

/** Reine Composer-Darstellung; Dateien, Mentions und Senden bleiben beim jeweiligen Hook. */
export function AiComposer({
  placement,
  busy,
  prompt,
  files,
  filePreviews,
  visibleMentions,
  isDraggingFiles,
  promptInputRef,
  fileInputRef,
  onPromptChange,
  onCursorSync,
  onSubmit,
  onAppendFiles,
  onRemoveFile,
  onInsertMention,
  onDragEnter,
  onDragOver,
  onDragLeave,
  onDrop
}: Props) {
  return (
    <section className={`card ai-composer-card ${placement === 'followup' ? 'ai-composer-card--followup' : ''}`}>
      {filePreviews.length > 0 && (
        <div className="ai-attachment-strip">
          {filePreviews.map((file) => (
            <span key={file.key} className="ai-attachment-preview">
              <button className="ai-attachment-remove" type="button" onClick={() => onRemoveFile(file.key)} aria-label={`${file.name} entfernen`}>×</button>
              {file.url ? <img src={file.url} alt={file.name} /> : <i aria-hidden="true">{file.badge}</i>}
              <strong>{file.name}</strong>
            </span>
          ))}
        </div>
      )}
      <div className={`ai-prompt-box ${busy ? 'is-busy' : ''} ${isDraggingFiles ? 'is-dragover' : ''}`} aria-busy={busy} onDragEnter={onDragEnter} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
        {!busy && <button className="btn ai-icon-btn" type="button" onClick={() => fileInputRef.current?.click()} aria-label="Anhänge hinzufügen">+</button>}
        <textarea
          ref={promptInputRef}
          className="input ai-prompt-input"
          value={prompt}
          disabled={busy}
          onChange={(event) => onPromptChange(event.target.value, event.target.selectionStart || 0)}
          onClick={onCursorSync}
          onKeyUp={onCursorSync}
          onSelect={onCursorSync}
          placeholder={placement === 'followup' ? 'Nachfrage oder nächste Aufgabe...' : 'Was möchtest du erledigen?'}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !(event.nativeEvent as any).isComposing) {
              event.preventDefault()
              onSubmit()
            }
          }}
        />
        {!busy && visibleMentions.length > 0 && <div className="ai-mention-menu">
          {visibleMentions.map((option) => <button key={option.id} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => onInsertMention(option)}><span>{option.scope}</span><strong>@{option.insert}</strong><small>{option.description}</small></button>)}
        </div>}
        {!busy && isDraggingFiles && <div className="ai-prompt-drop-hint" aria-hidden="true">Dateien hier ablegen, um sie an die Anfrage anzuhängen</div>}
        <button className="btn primary ai-send-btn" type="button" disabled={busy || (!prompt.trim() && !files.length)} onClick={onSubmit}>{busy ? <span className="ai-send-spinner" aria-hidden="true" /> : 'Senden'}</button>
        <input ref={fileInputRef} type="file" multiple accept=".pdf,.xlsx,.xls,.csv,.tsv,image/png,image/jpeg" hidden onChange={(event) => { onAppendFiles(event.target.files); event.target.value = '' }} />
      </div>
    </section>
  )
}
