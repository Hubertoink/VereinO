import React from 'react'
import { TagsPaneProps } from '../types'
import TagModal, { TagValue } from '../../../components/modals/TagModal'

/**
 * TagsPane - Tag Management
 * Displays existing tags with usage counts and allows opening the global tag manager.
 */
export function TagsPane({ tagDefs, setTagDefs, notify, openTagsManager, bumpDataVersion }: TagsPaneProps) {
  const [editTag, setEditTag] = React.useState<TagValue | null>(null)
  const [deleteConfirm, setDeleteConfirm] = React.useState<{ id: number; name: string } | null>(null)
  const [busy, setBusy] = React.useState(false)

  // Refresh tags with usage counts
  async function refreshTags() {
    setBusy(true)
    try {
      const res = await window.api?.tags?.list?.({ includeUsage: true })
      if (res?.rows) {
        setTagDefs(res.rows)
      }
    } catch (e: any) {
      notify('error', e?.message || String(e))
    } finally {
      setBusy(false)
    }
  }

  // Load tags with usage on mount
  React.useEffect(() => {
    refreshTags()
  }, [])

  async function deleteTag(id: number, name: string) {
    try {
      const res = await window.api?.tags?.delete?.({ id })
      if (res?.id) {
        setTagDefs(prev => prev.filter(t => t.id !== id))
        notify('success', 'Tag gelöscht')
        bumpDataVersion()
      }
    } catch (e: any) {
      notify('error', e?.message || String(e))
    } finally {
      setDeleteConfirm(null)
    }
  }

  async function handleTagSaved() {
    await refreshTags()
    setEditTag(null)
    notify('success', 'Tag gespeichert')
    bumpDataVersion()
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div>
        <strong>Tags</strong>
        <div className="helper">Verwalte Farben & Namen. Tags färben Buchungszeilen zur schnelleren visuellen Orientierung.</div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center' }}>
        <button className="btn primary" onClick={() => setEditTag({ name: '', color: null })}>+ Neu</button>
      </div>
      <div className="card" style={{ padding: 12, display: 'grid', gap: 10 }}>
        <div className="helper">Bestehende Tags:</div>
        <div style={{ display: 'grid', gap: 6 }}>
          {tagDefs.length === 0 && <div className="helper">Keine Tags vorhanden.</div>}
          {tagDefs.map(t => (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', border: '1px solid var(--border)', borderRadius: 8 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                {t.color && <span style={{ width: 16, height: 16, borderRadius: 4, background: t.color }} title={t.color} />}
                <strong>{t.name}</strong>
              </span>
              <span className="helper" style={{ marginLeft: 'auto' }}>Verwendung: {t.usage ?? 0}</span>
              <button className="btn ghost" onClick={() => setEditTag({ id: t.id, name: t.name, color: t.color ?? null })} title="Bearbeiten">✎</button>
              <button className="btn ghost" onClick={() => setDeleteConfirm({ id: t.id, name: t.name })} title="Löschen">✕</button>
            </div>
          ))}
        </div>
      </div>

      {editTag && (
        <TagModal
          value={editTag}
          onClose={() => setEditTag(null)}
          onSaved={handleTagSaved}
          notify={notify}
        />
      )}

      {deleteConfirm && (
        <div className="modal-overlay" role="dialog" aria-modal="true" onClick={() => setDeleteConfirm(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480, display: 'grid', gap: 12 }}>
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ margin: 0 }}>Tag löschen</h2>
              <button className="btn ghost" onClick={() => setDeleteConfirm(null)} aria-label="Schließen">✕</button>
            </header>
            <div className="helper">
              Möchtest du den Tag <strong>{deleteConfirm.name}</strong> wirklich löschen?
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn" onClick={() => setDeleteConfirm(null)}>Abbrechen</button>
              <button className="btn danger" onClick={() => deleteTag(deleteConfirm.id, deleteConfirm.name)}>Löschen</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
