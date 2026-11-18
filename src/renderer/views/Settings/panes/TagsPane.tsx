import { SettingsPageHeader } from '../components/SettingsPageHeader'
import TagDeleteModal, { TagDeleteTarget } from '../../../components/modals/TagDeleteModal'
import React from 'react'
import { IconPencil, IconTag } from '@tabler/icons-react'
import { TagsPaneProps } from '../types'
import TagModal, { TagValue } from '../../../components/modals/TagModal'
import AppIcon from '../../../components/common/AppIcon'
import { IconTrash } from '../../../utils/icons'

/**
 * TagsPane - Tag Management
 * Displays existing tags with usage counts and allows opening the global tag manager.
 */
export function TagsPane({ tagDefs, setTagDefs, notify, bumpDataVersion }: TagsPaneProps) {
  const [editTag, setEditTag] = React.useState<TagValue | null>(null)
  const [deleteConfirm, setDeleteConfirm] = React.useState<TagDeleteTarget | null>(null)

  // Refresh tags with usage counts
  async function refreshTags() {
    try {
      const res = await window.api?.tags?.list?.({ includeUsage: true })
      if (res?.rows) {
        setTagDefs(res.rows)
      }
    } catch (e: any) {
      notify('error', e?.message || String(e))
    }
  }

  // Load tags with usage on mount
  React.useEffect(() => {
    refreshTags()
  }, [])

  async function deleteTag(id: number) {
    try {
      const res = await window.api?.tags?.delete?.({ id })
      if (res?.id) {
        setTagDefs(prev => prev.filter(t => t.id !== id))
        notify('success', 'Tag gelöscht')
        bumpDataVersion()
        setDeleteConfirm(null)
      }
    } catch (e: any) {
      notify('error', e?.message || String(e))
    }
  }

  async function handleTagSaved() {
    await refreshTags()
    setEditTag(null)
    notify('success', 'Tag gespeichert')
    bumpDataVersion()
  }

  return (
    <div className="settings-page settings-records-pane">
      <SettingsPageHeader title="Tags" count={tagDefs.length} description="Verwalte Namen und Farben für die visuelle Orientierung in Buchungen." meta="Für diese Organisation" actions={<button className="btn primary" onClick={() => setEditTag({ name: '', color: null })}>+ Neuer Tag</button>} />

      {/* Tags Grid */}
      {tagDefs.length === 0 ? (
        <div className="tags-empty" style={{ padding: 32, textAlign: 'center' }}>
          <div className="tags-empty__icon"><AppIcon icon={IconTag} size="hero" /></div>
          <div className="helper">Noch keine Tags vorhanden.</div>
          <div className="helper" style={{ marginTop: 4 }}>Erstelle deinen ersten Tag mit dem Button oben.</div>
        </div>
      ) : (
        <div className="settings-record-list">
          {tagDefs.map(t => {
            return (
              <div 
                key={t.id} 
                className="settings-record-row"
              >
                <span className="settings-record-color" style={{ background: t.color || 'var(--border)' }} title={t.color || 'Keine Farbe'} />

                {/* Name and usage */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 'var(--type-small-text)', marginBottom: 2 }}>{t.name}</div>
                  <div className="helper">
                    {(t.usage ?? 0) === 0 ? 'Nicht verwendet' : `${t.usage} Buchung${(t.usage ?? 0) !== 1 ? 'en' : ''}`}
                  </div>
                </div>
                
                {/* Actions */}
                <div style={{ display: 'flex', gap: 4 }}>
                  <button 
                    className="btn btn-edit" 
                    onClick={() => setEditTag({ id: t.id, name: t.name, color: t.color ?? null })} 
                    title="Bearbeiten"
                    aria-label={`${t.name} bearbeiten`}
                  >
                    <AppIcon icon={IconPencil} size="control" />
                  </button>
                  <button 
                    className="btn ghost btn-trash" 
                    onClick={() => setDeleteConfirm({ id: t.id, name: t.name, usage: t.usage })}
                    title="Löschen"
                    aria-label={`${t.name} löschen`}
                    style={{ padding: '6px 8px' }}
                  >
                    <IconTrash size={16} />
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
        <TagDeleteModal tag={deleteConfirm} onClose={() => setDeleteConfirm(null)} onConfirm={() => deleteTag(deleteConfirm.id)} />
      )}
    </div>
  )
}
