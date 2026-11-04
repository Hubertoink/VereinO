import { useRef, useState } from 'react'
import { IconCheck, IconPencil, IconX } from '@tabler/icons-react'
import AppIcon from '../common/AppIcon'

export default function InvoiceFileName({ file, onRename, disabled }: { file: File; onRename: (file: File) => void; disabled?: boolean }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const editButton = useRef<HTMLButtonElement>(null)
  const dot = file.name.lastIndexOf('.')
  const extension = dot > 0 ? file.name.slice(dot) : ''
  const close = () => { setEditing(false); setError(''); requestAnimationFrame(() => editButton.current?.focus()) }
  const save = () => {
    const base = name.trim()
    if (!base || /[<>:"/\\|?*\x00-\x1f]/.test(base) || /[. ]$/.test(base) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(base)) {
      setError('Bitte einen gültigen Dateinamen ohne Sonderzeichen wie / oder : eingeben.')
      return
    }
    if ((base + extension).length > 255) { setError('Der Dateiname darf höchstens 255 Zeichen lang sein.'); return }
    if (base + extension !== file.name) onRename(new File([file], base + extension, { type: file.type, lastModified: file.lastModified }))
    close()
  }
  return <div className="invoice-file-name">
    {editing ? <>
      <div className="invoice-file-name__editor">
        <input className="input" value={name} aria-label="Dateiname ohne Dateiendung" aria-invalid={Boolean(error)} disabled={disabled}
          ref={(input) => { if (input && document.activeElement !== input) { input.focus(); input.select() } }}
          onChange={(event) => { setName(event.target.value); setError('') }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close() }
            if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); save() }
          }} />
        {extension && <span className="invoice-file-name__extension">{extension}</span>}
        <button type="button" className="btn ghost" disabled={disabled} title="Dateiname übernehmen" aria-label="Dateiname übernehmen" onClick={save}><AppIcon icon={IconCheck} size="control" /></button>
        <button type="button" className="btn ghost" title="Umbenennen abbrechen" aria-label="Umbenennen abbrechen" onClick={close}><AppIcon icon={IconX} size="control" /></button>
      </div>
      {error && <div className="invoice-file-name__error" role="alert">{error}</div>}
    </> : <div className="invoice-file-name__display">
      <strong title={file.name}>{file.name}</strong>
      <button ref={editButton} type="button" className="btn ghost invoice-file-name__edit" disabled={disabled} title="Datei umbenennen" aria-label="Datei umbenennen"
        onClick={() => { setName(extension ? file.name.slice(0, -extension.length) : file.name); setEditing(true) }}><AppIcon icon={IconPencil} size="control" /></button>
    </div>}
  </div>
}
