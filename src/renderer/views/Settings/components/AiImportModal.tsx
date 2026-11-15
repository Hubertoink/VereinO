import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import ResponsiveSearch from '../../../components/common/ResponsiveSearch'
import { IconAlertTriangle, IconArrowLeft, IconCheck, IconCircleCheck, IconDatabase, IconDeviceFloppy, IconFileImport, IconFileText, IconLink, IconPlayerPause, IconSparkles } from '@tabler/icons-react'
import ModalHeader from '../../../components/ModalHeader'
import type { AiImportOptions, AiImportPreview, AiImportSession } from '../../../../../shared/aiImport'
import type { ImportMasterRow } from '../../../../../shared/importMasterData'
import { dispatchDataChanged } from '../../../utils/refresh'
import { AiImportSetup } from './aiImport/AiImportSetup'
import { AiImportProgress } from './aiImport/AiImportProgress'
import { AiImportBookings } from './aiImport/AiImportBookings'
import { AiImportRowDetail } from './aiImport/AiImportRowDetail'
import { AiImportRelations } from './aiImport/AiImportRelations'
import { AiImportMasterReview } from './aiImport/AiImportMasterReview'
import { masterFieldByEntity, matchesFilter, phaseLabels, rowState, splitTags, uniqueValues, type RowFilter } from './aiImport/model'
import './aiImportModal.css'

type Tab = 'bookings' | 'relations' | 'masters'
const listFields = { category: 'categories', paymentAccount: 'paymentAccounts', budget: 'budgets', earmarkCode: 'earmarks' } as const

export function AiImportModal({ onClose }: { onClose: () => void }) {
  const [preview, setPreview] = useState<AiImportPreview | null>(null)
  const [file, setFile] = useState<{ fileName: string; fileBase64: string } | null>(null)
  const [sheetName, setSheetName] = useState('')
  const [mapping, setMapping] = useState<Record<string, string | null>>({})
  const [options, setOptions] = useState<AiImportOptions>({ guidance: '', defaultAccount: '', tags: 'none', budgets: 'none', suggestCategories: false })
  const [session, setSession] = useState<AiImportSession | null>(null)
  const [recent, setRecent] = useState<Array<Pick<AiImportSession, 'id' | 'fileName' | 'status' | 'updatedAt'>>>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [dirty, setDirty] = useState(false)
  const [tab, setTab] = useState<Tab>('bookings')
  const [filter, setFilter] = useState<RowFilter>('all')
  const [confirmClose, setConfirmClose] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [editVersion, setEditVersion] = useState(0)
  const mounted = useRef(true)
  const api = window.api!.imports

  useEffect(() => {
    if (!editVersion || !dirty || busy || !session || session.phase !== 'done') return
    let cancelled = false
    const timer = setTimeout(() => {
      void api.aiReview({ id: session.id, revision: session.revision, rows: session.rows, masterData: session.masterData, masterDataAccepted: session.masterDataAccepted }).then(next => {
        if (!cancelled) setSession(next)
      }).catch(e => { if (!cancelled) setError(e.message) })
    }, 350)
    return () => { cancelled = true; clearTimeout(timer) }
    // A review updates session without starting another review. New edits cancel stale results.
  }, [editVersion, busy])

  const refreshRecent = () => void api.aiList().then(setRecent).catch(e => setError(e.message))
  useEffect(() => {
    mounted.current = true
    refreshRecent()
    return () => { mounted.current = false }
  }, [])
  useEffect(() => {
    if (session?.status !== 'running') return
    let pending = false, cancelled = false
    const timer = setInterval(async () => {
      if (pending) return
      pending = true
      try {
        const next = await api.aiGet({ id: session.id })
        if (!cancelled) setSession(next)
      } catch (e) { if (!cancelled) setError((e as Error).message) }
      finally { pending = false }
    }, 1200)
    return () => { cancelled = true; clearInterval(timer) }
  }, [session?.id, session?.status])

  const running = session?.status === 'running'
  const finished = session?.status === 'committed'
  const reviewing = session?.phase === 'done' && !finished
  const editable = !!reviewing && !running && !busy
  const general = (session?.profile || preview?.profile) === 'GENERAL'
  const rows = session?.rows || []
  const selected = rows.filter(r => r.selected)
  const masterErrors = session?.masterData.filter(m => m.status === 'error').length || 0
  const newMasters = session?.masterData.filter(m => m.status === 'new').length || 0
  const blockedRows = selected.filter(r => r.draft.issues.some(i => i.level === 'error')).length
  const bookingErrors = selected.filter(r => r.draft.issues.some(i => i.level === 'error' && i.code !== 'relation')).length
  const openRelations = session?.relations.filter(rel => rel.rowIds.some(id => rows.some(r => r.draft.id === id && r.selected && !r.relationsChecked))).length || 0
  const mastersReady = !masterErrors && (!newMasters || !!session?.masterDataAccepted)
  const ready = editable && !dirty && selected.length > 0 && blockedRows === 0 && mastersReady
  const attention = selected.filter(r => matchesFilter(rowState(r), 'attention')).length

  const navRows = rows.filter(r => matchesFilter(rowState(r), filter))
  const detailList = navRows.some(r => r.draft.id === detailId) ? navRows : rows
  const detailIndex = detailList.findIndex(r => r.draft.id === detailId)
  const detail = detailIndex >= 0 ? detailList[detailIndex] : undefined

  async function perform(action: () => Promise<void>) {
    if (busy) return
    setBusy(true); setError('')
    try { await action() } catch (e) { if (mounted.current) setError((e as Error).message || String(e)) }
    finally { if (mounted.current) setBusy(false) }
  }
  async function loadFile(f: File) {
    await perform(async () => {
      if (!/\.(xlsx|csv)$/i.test(f.name)) throw new Error('Bitte eine Excel-Datei (.xlsx) oder CSV-Datei auswählen.')
      if (f.size > 10 * 1024 * 1024) throw new Error('Bitte eine Datei bis 10 MB auswählen.')
      const fileBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result).split(',')[1])
        reader.onerror = () => reject(new Error('Datei konnte nicht gelesen werden.'))
        reader.readAsDataURL(f)
      })
      const nextFile = { fileName: f.name, fileBase64 }
      const result = await api.aiPreview(nextFile)
      const sheet = result.sheets.find(s => /^(buchungen|import)$/i.test(s.name)) || result.sheets[0]
      if (!sheet) throw new Error('Keine Buchungstabelle gefunden.')
      setFile(nextFile); setPreview(result); setSheetName(sheet.name); setMapping(sheet.mapping)
      setOptions(prev => ({ ...prev, defaultAccount: '', suggestCategories: false }))
    })
  }
  async function save(accept = session?.masterDataAccepted || false) {
    if (!session) return
    const next = await api.aiSave({ id: session.id, revision: session.revision, rows: session.rows, masterData: session.masterData, masterDataAccepted: accept })
    setSession(next); setDirty(false)
    return next
  }
  async function close(confirmed = false) {
    if (busy) return
    if (!confirmed && (session || file) && !finished) { setConfirmClose(true); return }
    if (dirty) await perform(async () => { await save(); onClose() })
    else onClose()
  }
  function reset() {
    setSession(null); setPreview(null); setFile(null); setDetailId(null); setTab('bookings'); setFilter('all')
    refreshRecent()
  }
  function updateRows(update: (row: AiImportSession['rows'][number]) => AiImportSession['rows'][number], resetMasters = false) {
    setEditVersion(v => v + 1)
    setDirty(true)
    setSession(prev => prev && ({ ...prev, ...(resetMasters ? { masterDataAccepted: false } : {}), rows: prev.rows.map(update) }))
  }
  function changeRow(id: string, field: string, value: unknown) {
    updateRows(row => row.draft.id !== id ? row : field === 'selected' || field === 'relationsChecked' || field === 'acceptedBudgetYear'
      ? { ...row, [field]: value }
      : { ...row, origins: { ...row.origins, [field]: 'user' }, draft: { ...row.draft, values: { ...row.draft.values, [field]: value } } })
  }
  function selectRows(ids: readonly string[], value: boolean) {
    const set = new Set(ids)
    updateRows(row => set.has(row.draft.id) && row.draft.status !== 'ignored' ? { ...row, selected: value } : row)
  }
  function applyBulk(field: string, value: string, onlyEmpty: boolean) {
    updateRows(r => !r.selected || (onlyEmpty && String(r.draft.values[field] || '').trim()) ? r
      : { ...r, origins: { ...r.origins, [field]: 'user' }, draft: { ...r.draft, values: { ...r.draft.values, [field]: value } } }, true)
  }
  function changeMaster(id: string, field: keyof ImportMasterRow, value: string) {
    setEditVersion(v => v + 1)
    setDirty(true)
    setSession(prev => prev && ({ ...prev, masterDataAccepted: false, masterData: prev.masterData.map(m => m.id === id ? { ...m, [field]: value } : m) }))
  }
  function replaceMaster(master: ImportMasterRow, target: string) {
    setEditVersion(v => v + 1)
    const field = masterFieldByEntity[master.entity]
    const names = [master.name, master.reference].map(n => n.toLowerCase())
    setDirty(true)
    setSession(prev => prev && ({ ...prev, masterDataAccepted: false, masterData: prev.masterData.filter(m => m.id !== master.id), rows: prev.rows.map(r => {
      const value = String(r.draft.values[field] || '')
      const next = field === 'tags'
        ? [...new Set(splitTags(value).map(t => names.includes(t.toLowerCase()) ? target : t).filter(Boolean))].join('; ')
        : names.includes(value.toLowerCase()) ? target : value
      return next === value ? r : { ...r, draft: { ...r.draft, values: { ...r.draft.values, [field]: next } } }
    }) }))
  }
  function mergeTag(master: ImportMasterRow, rawTarget: string) {
    const target = rawTarget.trim()
    if (!target || /[;,]/.test(target) || [master.name, master.reference].some(n => n.toLowerCase() === target.toLowerCase())) return
    replaceMaster(master, target)
  }
  function openRow(id: string) { setTab('bookings'); setDetailId(id) }

  const stepIndex = finished ? 3 : reviewing ? 2 : session ? 1 : 0
  const steps = [
    { label: 'Datei auswählen', hint: session?.fileName || file?.fileName || 'Excel oder CSV' },
    { label: 'KI-Analyse', hint: session ? session.phase === 'done' ? `${rows.length} Buchungen erkannt` : phaseLabels[session.phase] : 'Spalten, Konten, Gruppen' },
    { label: 'Daten prüfen', hint: reviewing || finished ? `${selected.length} ausgewählt · ${attention} Hinweise` : 'Korrigieren und freigeben' },
    { label: 'Übernehmen', hint: finished ? `${session?.imported ?? 0} übernommen` : 'In VereinO buchen' }
  ]
  const tabs: Array<{ id: Tab; label: string; count: number; open: boolean; Icon: typeof IconFileText }> = session ? [
    { id: 'bookings', label: 'Buchungen', count: rows.length, open: bookingErrors > 0, Icon: IconFileText },
    { id: 'relations', label: 'Beziehungen', count: session.relations.length, open: openRelations > 0, Icon: IconLink },
    { id: 'masters', label: 'Stammdaten', count: session.masterData.length, open: masterErrors > 0 || (newMasters > 0 && !session.masterDataAccepted), Icon: IconDatabase }
  ] : []
  const checks = [
    { tab: 'bookings' as const, ok: !bookingErrors, label: bookingErrors ? `${bookingErrors} ${bookingErrors === 1 ? 'Buchung' : 'Buchungen'} korrigieren` : 'Buchungen geprüft' },
    { tab: 'relations' as const, ok: !openRelations, label: openRelations ? `${openRelations} ${openRelations === 1 ? 'Beziehung' : 'Beziehungen'} offen` : 'Beziehungen geprüft' },
    { tab: 'masters' as const, ok: mastersReady, label: masterErrors ? `${masterErrors} Stammdaten korrigieren` : mastersReady ? 'Stammdaten bereit' : 'Stammdaten freigeben' }
  ]

  return createPortal(<div className="modal-overlay ai-import-overlay" onClickCapture={e => {
    if (!detail || tab !== 'bookings' || (e.target as Element).closest('.ai-import-detail')) return
    setDetailId(null)
    // The first backdrop click dismisses the details, keeping the import open.
    if (e.target === e.currentTarget) { e.preventDefault(); e.stopPropagation() }
  }} onClick={() => void close()}>
    <div className="modal ai-import-modal" role="dialog" aria-modal="true" aria-labelledby="ai-import-title" onClick={e => e.stopPropagation()}>
      <ModalHeader title="KI-Import" titleId="ai-import-title" icon={<IconSparkles size={20} aria-hidden="true" />}
        subtitle={session ? `${session.fileName} · ${session.sheetName}` : 'Buchungen aus Excel oder CSV vorbereiten, prüfen und gemeinsam übernehmen'}
        onClose={() => void close()} closeDisabled={busy} />
      <ol className="ai-import-steps" aria-label="Importfortschritt">{steps.map((step, i) => {
        const state = i < stepIndex || (finished && i === stepIndex) ? 'done' : i === stepIndex ? 'current' : 'pending'
        return <li key={step.label} className={`is-${state}`} aria-current={i === stepIndex ? 'step' : undefined}>
          <b>{state === 'done' ? <IconCheck size={14} stroke={2.6} aria-hidden="true" /> : i + 1}</b>
          <span><strong>{step.label}</strong><small>{step.hint}</small></span>
        </li>
      })}</ol>

      <div className={`ai-import-body ${reviewing ? 'is-review' : ''}`}>
        {error && <p className="ai-import-callout is-danger" role="alert"><IconAlertTriangle size={16} aria-hidden="true" /><span>{error}</span></p>}
        {!session && <AiImportSetup recent={recent} busy={busy} fileName={file?.fileName} preview={preview} sheetName={sheetName} mapping={mapping} options={options}
          onDeleteJob={id => void perform(async () => { await api.aiDelete({ id }); refreshRecent() })}
          onOpenJob={id => void perform(async () => { setSession(await api.aiGet({ id })); setDirty(false) })}
          onFile={f => void loadFile(f)} onDropError={setError}
          onSheet={name => { setSheetName(name); setMapping(preview!.sheets.find(s => s.name === name)!.mapping) }}
          onMapping={setMapping} onOptions={setOptions} />}
        {session && !reviewing && !finished && <AiImportProgress session={session} />}

        {session && reviewing && <>
          {session.warnings.map(w => <p className="ai-import-callout is-warning" key={w}><IconAlertTriangle size={16} aria-hidden="true" /><span>{w}</span></p>)}
          <div className="ai-import-review-nav"><div className="ai-import-tabs" role="tablist" aria-label="Importprüfung">{tabs.map(t => <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>
            <t.Icon size={16} aria-hidden="true" />{t.label} <span className="ai-import-tab-count">({t.count})</span>{t.open && <i className="ai-import-tab-dot" aria-hidden="true" />}
          </button>)}</div>{tab === 'bookings' && <div className="ai-import-search-anchor"><ResponsiveSearch forceCompact value={search} onChange={setSearch} label="Suche" placeholder="Suche (Text, Kategorie, Konto …)" /></div>}</div>
          {tab === 'bookings' && <div className={`ai-import-workspace ${detail ? 'has-detail' : ''}`}>
            <AiImportBookings onSearch={setSearch} search={search} rows={rows} general={general} editable={editable} detailId={detail ? detailId : null} filter={filter} onFilter={setFilter} onOpen={setDetailId} onSelect={selectRows} onBulk={applyBulk} />
            {detail && <AiImportRowDetail row={detail} general={general} editable={editable} sheetName={session.sheetName} position={`${detailIndex + 1} von ${detailList.length}`}
              onChange={(field, value) => changeRow(detail.draft.id, field, value)} onClose={() => setDetailId(null)}
              onPrev={detailIndex > 0 ? () => setDetailId(detailList[detailIndex - 1].draft.id) : undefined}
              onNext={detailIndex < detailList.length - 1 ? () => setDetailId(detailList[detailIndex + 1].draft.id) : undefined} />}
          </div>}
          {tab === 'relations' && <AiImportRelations relations={session.relations} rows={rows} editable={editable} onChangeRow={changeRow} onOpenRow={openRow}
            onConfirmAll={ids => { const set = new Set(ids); updateRows(r => set.has(r.draft.id) ? { ...r, relationsChecked: true } : r) }} />}
          {tab === 'masters' && <AiImportMasterReview masters={session.masterData} rows={rows} general={general} editable={editable} dirty={dirty} accepted={session.masterDataAccepted}
            onChange={changeMaster} onRemove={m => replaceMaster(m, '')} onMergeTag={mergeTag}
            onValidate={() => void perform(async () => { await save() })} onAccept={() => void perform(async () => { await save(true) })} />}
          {Object.entries(listFields).map(([field, entity]) => <datalist key={field} id={`ai-import-list-${field}`}>
            {[...new Set([...uniqueValues(rows, field), ...session.masterData.filter(m => m.entity === entity).map(m => m.name)])].map(v => <option key={v} value={v} />)}
          </datalist>)}
        </>}

        {finished && <div className="ai-import-success" role="status">
          <span className="ai-import-success__icon"><IconCircleCheck size={36} aria-hidden="true" /></span>
          <h3>{session.imported} Buchungen übernommen.</h3>
          <p>Der Auftrag ist abgeschlossen. Ein erneutes Übernehmen desselben Auftrags erzeugt keine weiteren Buchungen.</p>
        </div>}
      </div>

      <footer className="ai-import-footer">
        <div className="ai-import-footer__status">
          {busy ? <span className="ai-import-muted">Arbeite …</span>
            : reviewing ? <>
              {checks.map(c => <button key={c.tab} type="button" className={`ai-import-check-chip ${c.ok ? 'is-ok' : 'is-open'}`} onClick={() => setTab(c.tab)}>
                {c.ok ? <IconCheck size={14} aria-hidden="true" /> : <IconAlertTriangle size={14} aria-hidden="true" />}{c.label}
              </button>)}
              {dirty && <span className="ai-import-check-chip is-open"><IconDeviceFloppy size={14} aria-hidden="true" />Ungespeichert</span>}
            </>
              : <span className="ai-import-muted">{session ? running ? 'Die Analyse läuft im Hintergrund weiter.' : session.status === 'failed' ? 'Analyse unterbrochen – du kannst sie fortsetzen.' : finished ? 'Import abgeschlossen' : 'Analyse pausiert' : 'Bis zu 500 Quellzeilen pro Auftrag'}</span>}
        </div>
        <div className="ai-import-footer__actions">
          {session && !running && !dirty && !finished && <button type="button" className="btn btn-with-icon" disabled={busy} onClick={reset}><IconArrowLeft size={16} aria-hidden="true" />Zur Dateiauswahl</button>}
          {!session && preview && <button type="button" className="btn primary btn-with-icon" disabled={busy || !preview.hasApiKey || !file} onClick={() => void perform(async () => {
            const created = await api.aiCreate({ ...file!, sheetName, mapping, options }); setSession(created)
            setSession(await api.aiStart({ id: created.id, revision: created.revision }))
          })}><IconSparkles size={16} aria-hidden="true" />{busy ? 'Datei wird vorbereitet …' : 'KI-Analyse starten'}</button>}
          {running && <button type="button" className="btn btn-with-icon" disabled={busy} onClick={() => void perform(async () => setSession(await api.aiCancel({ id: session!.id, revision: session!.revision })))}><IconPlayerPause size={16} aria-hidden="true" />Analyse pausieren</button>}
          {session && !running && session.phase !== 'done' && !finished && <button type="button" className="btn primary btn-with-icon" disabled={busy} onClick={() => void perform(async () => setSession(await api.aiStart({ id: session.id, revision: session.revision })))}><IconSparkles size={16} aria-hidden="true" />Analyse fortsetzen</button>}
          {editable && <button type="button" className="btn btn-with-icon" onClick={() => void perform(async () => { await save() })}><IconDeviceFloppy size={16} aria-hidden="true" />Speichern & prüfen</button>}
          {reviewing && <button type="button" className="btn primary btn-with-icon" disabled={!ready} title={ready ? undefined : 'Erst alle offenen Punkte links erledigen und speichern.'} onClick={() => void perform(async () => {
            const result = await api.aiCommit({ id: session.id, revision: session.revision }); setSession(result); setDirty(false); dispatchDataChanged()
          })}><IconFileImport size={16} aria-hidden="true" />Auswahl übernehmen ({selected.length})</button>}
          {finished && <>
            <button type="button" className="btn" onClick={reset}>Weitere Datei importieren</button>
            <button type="button" className="btn primary" onClick={onClose}>Fertig</button>
          </>}
        </div>
      </footer>
    </div>
    {confirmClose && <div className="modal-overlay ai-import-close-overlay" onClick={e => e.stopPropagation()}><div className="modal ai-import-close-dialog" role="alertdialog" aria-modal="true" aria-labelledby="ai-import-close-title">
      <ModalHeader title="Import schließen?" titleId="ai-import-close-title" onClose={() => setConfirmClose(false)} closeDisabled={busy} />
      <div className="ai-import-close-body">
        <p>{session ? 'Dein Auftrag bleibt gespeichert und kann später wieder geöffnet werden. Änderungen am Entwurf werden vor dem Schließen gespeichert.' : 'Die ausgewählte Datei und deine Einstellungen werden beim Schließen verworfen.'}</p>
        {running && <p className="ai-import-muted">Die laufende Analyse wird im Hintergrund fortgesetzt.</p>}
        {error && <p role="alert" className="ai-import-problem">{error}</p>}
        <div className="ai-import-close-actions"><button type="button" className="btn" disabled={busy} onClick={() => setConfirmClose(false)}>Weiter bearbeiten</button><button type="button" className="btn primary" disabled={busy} onClick={() => void close(true)}>Import schließen</button></div>
      </div>
    </div></div>}
  </div>, document.body)
}
