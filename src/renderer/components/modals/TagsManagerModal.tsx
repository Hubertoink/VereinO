import ModalHeader, { ModalCloseButton } from '../ModalHeader'
import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import TagModal, { TagValue } from './TagModal'
import TagDeleteModal, { TagDeleteTarget } from './TagDeleteModal'

export default function TagsManagerModal({ onClose, notify, onChanged }: { onClose: () => void; notify: (type: 'success' | 'error' | 'info', text: string, ms?: number) => void; onChanged?: () => void }) {
    const [tags, setTags] = useState<Array<{ id: number; name: string; color?: string | null; usage?: number }>>([])
    const [edit, setEdit] = useState<null | TagValue>(null)
    const [busy, setBusy] = useState(false)
    const [deleteConfirm, setDeleteConfirm] = useState<TagDeleteTarget | null>(null)
    async function refresh() {
        try {
            setBusy(true)
            const res = await (window as any).api?.tags?.list?.({ includeUsage: true })
            if (res?.rows) setTags(res.rows)
        } finally { setBusy(false) }
    }
    useEffect(() => { refresh() }, [])
    const colorSwatch = (c?: string | null) => c ? (<span title={c} style={{ display: 'inline-block', width: 16, height: 16, borderRadius: 4, background: c, verticalAlign: 'middle' }} />) : '—'
    return createPortal(
        <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
            <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 'min(860px, 96vw)' }}>
                <ModalHeader >
                    <h2 style={{ margin: 0 }}>Tags verwalten</h2>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button className="btn" onClick={refresh} disabled={busy}>Aktualisieren</button>
                        <button className="btn primary" onClick={() => setEdit({ name: '', color: null })}>+ Neu</button>
                        <ModalCloseButton onClick={onClose} />
                    </div>
                </ModalHeader>
                {busy && <div className="helper">Lade …</div>}
                <table cellPadding={6} style={{ marginTop: 4, width: '100%' }}>
                    <thead>
                        <tr>
                            <th align="left">Tag</th>
                            <th align="left">Farbe</th>
                            <th align="right">Nutzung</th>
                            <th align="center">Aktionen</th>
                        </tr>
                    </thead>
                    <tbody>
                        {tags.map(t => (
                            <tr key={t.id}>
                                <td>{t.name}</td>
                                <td>{colorSwatch(t.color)}</td>
                                <td align="right">{t.usage ?? '—'}</td>
                                <td align="center" style={{ whiteSpace: 'nowrap' }}>
                                    <button className="btn" onClick={() => setEdit({ id: t.id, name: t.name, color: t.color ?? null })}>✎</button>
                                    <button className="btn danger" onClick={() => setDeleteConfirm({ id: t.id, name: t.name, usage: t.usage })}>🗑</button>
                                </td>
                            </tr>
                        ))}
                        {tags.length === 0 && (
                            <tr><td colSpan={4} style={{ color: 'var(--muted)', fontStyle: 'italic' }}>Keine Tags vorhanden.</td></tr>
                        )}
                    </tbody>
                </table>
                {edit && (
                    <TagModal
                        value={edit}
                        onClose={() => setEdit(null)}
                        onSaved={async () => { await refresh(); setEdit(null); notify('success', 'Tag gespeichert'); onChanged?.() }}
                        notify={notify}
                    />
                )}
                {deleteConfirm && (
                    <TagDeleteModal tag={deleteConfirm} onClose={() => setDeleteConfirm(null)} onConfirm={async () => {
                        try {
                            await (window as any).api?.tags?.delete?.({ id: deleteConfirm.id })
                            notify('success', `Tag "${deleteConfirm.name}" gelöscht`)
                            setDeleteConfirm(null)
                            await refresh()
                            window.dispatchEvent(new Event('tags-changed'))
                            onChanged?.()
                        } catch (e: any) {
                            notify('error', e?.message || String(e))
                        }
                    }} />
                )}
            </div>
        </div>,
        document.body
    )
}
