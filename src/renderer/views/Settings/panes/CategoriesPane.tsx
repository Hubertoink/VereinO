import CategoryIcon from '../../../components/common/CategoryIcon'
import { SettingsPageHeader } from '../components/SettingsPageHeader'
import ModalHeader from '../../../components/ModalHeader'
import React from 'react'
import type { ClassificationValue, OrganizationProfile } from '../../../../../shared/classification'
import CategoryModal, { type CategoryValue } from '../../../components/modals/CategoryModal'
import { IconTag, IconPencil, IconArchive, IconArchiveOff } from '@tabler/icons-react'
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

  return <div className="settings-page settings-records-pane">
    <SettingsPageHeader title="Kategorien" count={values.length} description="Verwalte Namen, Farben und Zeichen zur Gliederung von Buchungen und Auswertungen." meta="Für diese Organisation" actions={<button className="btn primary" onClick={() => setEditCategory({ name: '', color: '#00C853', icon: null })}>+ Neue Kategorie</button>} />

    {values.length === 0 ? <div className="settings-empty"><IconTag size={32} aria-hidden="true" style={{ marginBottom: 8 }} /><div className="helper">Noch keine Kategorien vorhanden.</div><div className="helper" style={{ marginTop: 4 }}>Erstelle deine erste Kategorie mit dem Button oben.</div></div> : <div className="settings-record-list">
      {values.map((category) => {
        const color = category.color || 'var(--muted)'
        return <div key={category.id} className="settings-record-row" style={{ opacity: category.isActive ? 1 : .58 }}>
          <span className="settings-record-color" style={{ background: color }} title={category.color || 'Keine Farbe'} />
          {category.icon && <CategoryIcon value={category.icon} size={18} />}
          <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>{category.name}</div><div className="helper" style={{ fontSize: 11 }}>{category.isActive ? 'Aktiv' : 'Archiviert'}</div></div>
          <div style={{ display: 'flex', gap: 4 }}><button className="btn btn-edit" onClick={() => setEditCategory({ id: category.id, name: category.name, color: category.color, icon: category.icon })} title="Bearbeiten" aria-label={`${category.name} bearbeiten`}><IconPencil size={16} aria-hidden="true" /></button><button className="btn ghost" onClick={() => setArchiveConfirm(category)} aria-label={`${category.name} ${category.isActive ? 'archivieren' : 'reaktivieren'}`} title={category.isActive ? 'Archivieren' : 'Reaktivieren'} style={{ padding: '6px 8px' }}>{category.isActive ? <IconArchive size={16} aria-hidden="true" /> : <IconArchiveOff size={16} aria-hidden="true" />}</button></div>
        </div>
      })}
    </div>}
    {editCategory && <CategoryModal value={editCategory} onClose={() => setEditCategory(null)} onSaved={() => { void onSaved() }} notify={notify} />}
    {archiveConfirm && <div className="modal-overlay" role="dialog" aria-modal="true" onClick={() => setArchiveConfirm(null)}><div className="modal modal-inset-header" style={{ maxWidth: 480, display: 'grid', gap: 12 }} onClick={(event) => event.stopPropagation()}><ModalHeader
                                                                                                                                                                                                                                                        title={<>{archiveConfirm.isActive ? 'Kategorie archivieren' : 'Kategorie reaktivieren'}</>}
                                                                                                                                                                                                                                                        onClose={() => setArchiveConfirm(null)}
                                                                                                                                                                                                                                                        closeLabel="Schließen"
                                                                                                                                                                                                                                                        closeOnEscape={false}
                                                                                                                                                                                                                                                      /><div className="helper">{archiveConfirm.isActive ? <>Die Kategorie <strong>{archiveConfirm.name}</strong> wird für neue Buchungen ausgeblendet. Bestehende Buchungen bleiben unverändert.</> : <>Die Kategorie <strong>{archiveConfirm.name}</strong> wird wieder für neue Buchungen verfügbar.</>}</div><div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}><button className="btn" onClick={() => setArchiveConfirm(null)}>Abbrechen</button><button className="btn primary" disabled={busy} onClick={() => void toggleArchive()}>{archiveConfirm.isActive ? 'Archivieren' : 'Reaktivieren'}</button></div></div></div>}
  </div>
}
