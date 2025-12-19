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
    <div style={{ display: 'grid', gap: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 20 }}>🏷️</span>
            <strong style={{ fontSize: 16 }}>Tags</strong>
            <span className="chip" style={{ marginLeft: 8, fontSize: 11 }}>{tagDefs.length}</span>
          </div>
          <div className="helper">Verwalte Farben & Namen. Tags färben Buchungszeilen zur schnelleren visuellen Orientierung.</div>
        </div>
        <button className="btn primary" onClick={() => setEditTag({ name: '', color: null })} style={{ whiteSpace: 'nowrap' }}>
          + Neuer Tag
        </button>
      </div>

      {/* Tags Grid */}
      {tagDefs.length === 0 ? (
        <div className="card" style={{ padding: 32, textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🏷️</div>
          <div className="helper">Noch keine Tags vorhanden.</div>
          <div className="helper" style={{ marginTop: 4 }}>Erstelle deinen ersten Tag mit dem Button oben.</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
          {tagDefs.map(t => {
            const bgColor = t.color ? `${t.color}20` : 'var(--muted)'
            const borderColor = t.color || 'var(--border)'
            return (
              <div 
                key={t.id} 
                className="card"
                style={{ 
                  padding: '12px 14px', 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: 10,
                  background: bgColor,
                  borderLeft: `4px solid ${borderColor}`,
                  transition: 'transform 0.15s ease, box-shadow 0.15s ease'
                }}
              >
                {/* Color indicator */}
                <div 
                  style={{ 
                    width: 32, 
                    height: 32, 
                    borderRadius: 8, 
                    background: t.color || 'var(--muted)', 
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff',
                    fontWeight: 600,
                    fontSize: 14,
                    textShadow: '0 1px 2px rgba(0,0,0,0.3)'
                  }} 
                  title={t.color || 'Keine Farbe'}
                >
                  {t.name.charAt(0).toUpperCase()}
                </div>
                
                {/* Name and usage */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>{t.name}</div>
                  <div className="helper" style={{ fontSize: 11 }}>
                    {(t.usage ?? 0) === 0 ? 'Nicht verwendet' : `${t.usage} Buchung${(t.usage ?? 0) !== 1 ? 'en' : ''}`}
                  </div>
                </div>
                
                {/* Actions */}
                <div style={{ display: 'flex', gap: 4 }}>
                  <button 
                    className="btn btn-edit" 
                    onClick={() => setEditTag({ id: t.id, name: t.name, color: t.color ?? null })} 
                    title="Bearbeiten"
                  >
                    ✎
                  </button>
                  <button 
                    className="btn ghost" 
                    onClick={() => setDeleteConfirm({ id: t.id, name: t.name })} 
                    title="Löschen"
                    style={{ padding: '6px 8px' }}
                  >
                    🗑️
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

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
