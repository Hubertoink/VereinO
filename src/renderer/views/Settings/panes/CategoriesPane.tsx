import React from 'react'
import type { ClassificationValue, OrganizationProfile } from '../../../../../shared/classification'
import CategoryModal, { type CategoryValue } from '../../../components/modals/CategoryModal'
import { IconTrash, ICONS } from '../../../utils/icons'
import type { OrgPaneProps } from '../types'
import { dispatchDataChanged } from '../../../utils/refresh'

export function CategoriesPane({ notify }: OrgPaneProps) {
  const [profile, setProfile] = React.useState<OrganizationProfile | null>(null)
  const [values, setValues] = React.useState<ClassificationValue[]>([])
  const [editCategory, setEditCategory] = React.useState<CategoryValue | null>(null)
  const [archiveConfirm, setArchiveConfirm] = React.useState<ClassificationValue | null>(null)
  const [busy, setBusy] = React.useState(false)

  const load = React.useCallback(async () => {
    const result = await window.api?.classifications?.primary?.list?.()
    if (!result) return
    setProfile(result.profile)
    setValues(result.values || [])
  }, [])

  React.useEffect(() => { void load().catch((error) => notify('error', String(error?.message || error))) }, [load, notify])

  const onSaved = async () => {
    await load()
    setEditCategory(null)
    dispatchDataChanged(['settings'])
    notify('success', 'Kategorie gespeichert')
  }

  const toggleArchive = async () => {
    if (!archiveConfirm || busy) return
    setBusy(true)
    try {
      await window.api.classifications.primary.update({ id: archiveConfirm.id, isActive: !archiveConfirm.isActive })
      await load()
      dispatchDataChanged(['settings'])
      notify('success', archiveConfirm.isActive ? 'Kategorie archiviert' : 'Kategorie reaktiviert')
      setArchiveConfirm(null)
    } catch (error: any) {
      notify('error', error?.message || String(error))
    } finally { setBusy(false) }
  }

  if (profile === 'NONPROFIT') return <div className="card" style={{ padding: 16 }}><strong>Kategorien</strong><div className="helper" style={{ marginTop: 6 }}>Dieses Profil nutzt die festen steuerlichen Sphären. Wechsle unter „Organisation“ zur allgemeinen Budgetverwaltung, um eigene Kategorien anzulegen.</div></div>

  return <div style={{ display: 'grid', gap: 16 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}><span style={{ fontSize: 20 }}>🏷️</span><strong style={{ fontSize: 16 }}>Kategorien</strong><span className="chip" style={{ marginLeft: 8, fontSize: 11 }}>{values.length}</span></div>
        <div className="helper">Verwalte Namen, Farben und Zeichen. Kategorien gliedern Buchungen und Auswertungen.</div>
      </div>
      <button className="btn primary" onClick={() => setEditCategory({ name: '', color: '#00C853', icon: null })} style={{ whiteSpace: 'nowrap' }}>+ Neue Kategorie</button>
    </div>

    {values.length === 0 ? <div className="card" style={{ padding: 32, textAlign: 'center' }}><div style={{ fontSize: 32, marginBottom: 8 }}>🏷️</div><div className="helper">Noch keine Kategorien vorhanden.</div><div className="helper" style={{ marginTop: 4 }}>Erstelle deine erste Kategorie mit dem Button oben.</div></div> : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
      {values.map((category) => {
        const color = category.color || 'var(--muted)'
        return <div key={category.id} className="card" style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10, opacity: category.isActive ? 1 : .58, background: category.color ? `${category.color}20` : 'var(--muted)', borderLeft: `4px solid ${color}` }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: color, flexShrink: 0, display: 'grid', placeItems: 'center', fontSize: 16 }} title={category.color || 'Keine Farbe'}>{category.icon || '🏷️'}</div>
          <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>{category.name}</div><div className="helper" style={{ fontSize: 11 }}>{category.isActive ? 'Aktiv' : 'Archiviert'}</div></div>
          <div style={{ display: 'flex', gap: 4 }}><button className="btn btn-edit" onClick={() => setEditCategory({ id: category.id, name: category.name, color: category.color, icon: category.icon })} title="Bearbeiten">{ICONS.EDIT}</button><button className="btn ghost btn-trash" onClick={() => setArchiveConfirm(category)} title={category.isActive ? 'Archivieren' : 'Reaktivieren'} style={{ padding: '6px 8px' }}><IconTrash size={16} /></button></div>
        </div>
      })}
    </div>}
    {editCategory && <CategoryModal value={editCategory} onClose={() => setEditCategory(null)} onSaved={() => { void onSaved() }} notify={notify} />}
    {archiveConfirm && <div className="modal-overlay" role="dialog" aria-modal="true" onClick={() => setArchiveConfirm(null)}><div className="modal" style={{ maxWidth: 480, display: 'grid', gap: 12 }} onClick={(event) => event.stopPropagation()}><header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><h2 style={{ margin: 0 }}>{archiveConfirm.isActive ? 'Kategorie archivieren' : 'Kategorie reaktivieren'}</h2><button className="btn ghost" onClick={() => setArchiveConfirm(null)} aria-label="Schließen">✕</button></header><div className="helper">{archiveConfirm.isActive ? <>Die Kategorie <strong>{archiveConfirm.name}</strong> wird für neue Buchungen ausgeblendet. Bestehende Buchungen bleiben unverändert.</> : <>Die Kategorie <strong>{archiveConfirm.name}</strong> wird wieder für neue Buchungen verfügbar.</>}</div><div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}><button className="btn" onClick={() => setArchiveConfirm(null)}>Abbrechen</button><button className="btn primary" disabled={busy} onClick={() => void toggleArchive()}>{archiveConfirm.isActive ? 'Archivieren' : 'Reaktivieren'}</button></div></div></div>}
  </div>
}
