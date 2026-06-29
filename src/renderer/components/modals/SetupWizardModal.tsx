
import React, { useEffect, useMemo, useState } from 'react'
import { compressImageFileToDataUrl } from '../../utils/imageCompression'
import { BACKGROUND_IMAGE_OPTIONS, COLOR_THEME_OPTIONS, DATE_FORMAT_OPTIONS } from '../../utils/appearanceOptions'
import type { QuickAddAfterSave } from '../../context/UIPreferencesContextCore'

type NavLayout = 'left' | 'top'
type NavIconColorMode = 'color' | 'mono'
type ColorTheme = 'default' | 'fiery-ocean' | 'peachy-delight' | 'pastel-dreamland' | 'ocean-breeze' | 'earthy-tones' | 'monochrome-harmony' | 'vintage-charm' | 'soft-blush' | 'professional-light'
type JournalRowStyle = 'both' | 'lines' | 'zebra' | 'none'
type JournalRowDensity = 'normal' | 'compact'
type BackgroundImage = 'none' | 'cherry-blossom' | 'foggy-forest' | 'mountain-snow' | 'custom'
type DateFmt = 'ISO' | 'PRETTY' | 'DOT'
type ColKey = 'actions' | 'date' | 'voucherNo' | 'type' | 'sphere' | 'description' | 'note' | 'earmark' | 'budget' | 'paymentMethod' | 'attachments' | 'net' | 'vat' | 'gross'
type TablePreset = 'standard' | 'minimal' | 'details' | 'custom'

// Toggle button component for binary options
function ToggleButtons<T extends string>({ value, onChange, options }: {
    value: T
    onChange: (v: T) => void
    options: Array<{ value: T; label: string; icon?: string }>
}) {
    return (
        <div className="toggle-button-group">
            {options.map(opt => (
                <button
                    key={opt.value}
                    type="button"
                    className={`toggle-button ${value === opt.value ? 'active' : ''}`}
                    onClick={() => onChange(opt.value)}
                >
                    {opt.icon && <span className="toggle-icon">{opt.icon}</span>}
                    <span>{opt.label}</span>
                </button>
            ))}
        </div>
    )
}

export default function SetupWizardModal({
    onClose,
    navLayout, setNavLayout,
    navIconColorMode, setNavIconColorMode,
    colorTheme, setColorTheme,
    journalRowStyle, setJournalRowStyle,
    journalRowDensity, setJournalRowDensity,
    backgroundImage, setBackgroundImage,
    customBackgroundImage, setCustomBackgroundImage,
    glassModals, setGlassModals,
    dateFmt, setDateFmt,
    showBookingDraftTabs, setShowBookingDraftTabs,
    showBookingEditTabs, setShowBookingEditTabs,
    bookingsOpenDetached, setBookingsOpenDetached,
    allowVoucherDeletion, setAllowVoucherDeletion,
    quickAddAfterSave, setQuickAddAfterSave,
    existingTags,
    notify
}: {
    onClose: () => void
    navLayout: NavLayout
    setNavLayout: (v: NavLayout) => void
    navIconColorMode: NavIconColorMode
    setNavIconColorMode: (v: NavIconColorMode) => void
    colorTheme: ColorTheme
    setColorTheme: (v: ColorTheme) => void
    journalRowStyle: JournalRowStyle
    setJournalRowStyle: (v: JournalRowStyle) => void
    journalRowDensity: JournalRowDensity
    setJournalRowDensity: (v: JournalRowDensity) => void
    backgroundImage: BackgroundImage
    setBackgroundImage: (v: BackgroundImage) => void
    customBackgroundImage: string | null
    setCustomBackgroundImage: (v: string | null) => void
    glassModals: boolean
    setGlassModals: (v: boolean) => void
    dateFmt: DateFmt
    setDateFmt: (v: DateFmt) => void
    showBookingDraftTabs: boolean
    setShowBookingDraftTabs: (v: boolean) => void
    showBookingEditTabs: boolean
    setShowBookingEditTabs: (v: boolean) => void
    bookingsOpenDetached: boolean
    setBookingsOpenDetached: (v: boolean) => void
    allowVoucherDeletion: boolean
    setAllowVoucherDeletion: (v: boolean) => void
    quickAddAfterSave: QuickAddAfterSave
    setQuickAddAfterSave: (v: QuickAddAfterSave) => void
    existingTags: Array<{ name: string; color?: string | null }>
    notify: (type: 'success' | 'error' | 'info', text: string, ms?: number) => void
}) {
    const [step, setStep] = useState<number>(0)
    const [orgName, setOrgName] = useState<string>('')
    const [cashier, setCashier] = useState<string>('')
    const [tablePreset, setTablePreset] = useState<TablePreset>('standard')
    const [colsVisible, setColsVisible] = useState<Record<ColKey, boolean>>({
        actions: true, date: true, voucherNo: false, type: true, sphere: true, description: true, note: true, earmark: true, budget: true, paymentMethod: true, attachments: true, net: false, vat: false, gross: true
    })
    const [colsOrder, setColsOrder] = useState<ColKey[]>(['actions', 'date', 'type', 'sphere', 'description', 'note', 'earmark', 'budget', 'paymentMethod', 'attachments', 'gross', 'voucherNo', 'net', 'vat'])
    const mandatoryCols: ColKey[] = ['actions','date','description','gross']

    // The wizard shows current values and marks setup completed on "Fertig".

    // Load existing values to prefill
    useEffect(() => {
        let alive = true
        ;(async () => {
            try {
                const on = await (window as any).api?.settings?.get?.({ key: 'org.name' })
                const cn = await (window as any).api?.settings?.get?.({ key: 'org.cashier' })
                if (!alive) return
                setOrgName((on?.value as any) || '')
                setCashier((cn?.value as any) || '')
            } catch {}
        })()
        return () => { alive = false }
    }, [])

    const suggestedTags = useMemo(() => [
        // Einnahmen
        { name: 'Mitgliedsbeitrag', color: '#2E7D32' },
        { name: 'Spende', color: '#1565C0' },
        { name: 'Sponsor', color: '#6A1B9A' },
        { name: 'Event', color: '#00838F' },
        // Ausgaben
        { name: 'Material', color: '#8D6E63' },
        { name: 'Reise', color: '#AD1457' },
        { name: 'Gebühren', color: '#455A64' },
        { name: 'Miete', color: '#5D4037' }
    ], [])
    const existingSet = useMemo(() => new Set((existingTags || []).map(t => t.name.trim().toLowerCase())), [existingTags])
    const [selectedTags, setSelectedTags] = useState<Record<string, boolean>>(() => {
        const init: Record<string, boolean> = {}
        for (const t of suggestedTags) init[t.name] = !existingSet.has(t.name.toLowerCase()) // vorselektiert, wenn noch nicht vorhanden
        return init
    })
    const [customTag, setCustomTag] = useState<string>('')
    const [customTags, setCustomTags] = useState<string[]>([])
    const [backupDir, setBackupDir] = useState<string>('')
    const [backupMsg, setBackupMsg] = useState<string>('')
    const [backupMode, setBackupMode] = useState<'SILENT' | 'PROMPT' | 'OFF'>('PROMPT')
    const [backupIntervalDays, setBackupIntervalDays] = useState<number>(7)
    const [showAdvanced, setShowAdvanced] = useState<boolean>(false)
    const [isSaving, setIsSaving] = useState<boolean>(false)

    const customBgInputRef = React.useRef<HTMLInputElement | null>(null)
    const [isCustomBgProcessing, setIsCustomBgProcessing] = useState<boolean>(false)

    const openCustomBgPicker = () => {
        customBgInputRef.current?.click()
    }

    const handleCustomBgUpload = async (file: File) => {
        const MAX_FILE_BYTES = 25 * 1024 * 1024
        if (file.size > MAX_FILE_BYTES) {
            notify('error', 'Bitte ein kleineres Bild auswählen (max. 25 MB).')
            return
        }

        setIsCustomBgProcessing(true)
        try {
            const result = await compressImageFileToDataUrl(file, {
                maxDimension: 3000,
                targetBytes: 2 * 1024 * 1024,
            })
            setCustomBackgroundImage(result.dataUrl)
            setBackgroundImage('custom')
            notify('success', `Eigenes Hintergrundbild gespeichert (${Math.round(result.bytes / 1024)} KB).`)
        } catch (e: any) {
            notify('error', `Bild konnte nicht verarbeitet werden: ${String(e?.message || e)}`)
        } finally {
            setIsCustomBgProcessing(false)
        }
    }

    const handleRemoveCustomBg = () => {
        setCustomBackgroundImage(null)
        if (backgroundImage === 'custom') setBackgroundImage('none')
        notify('info', 'Eigenes Hintergrundbild entfernt.')
    }

    function applyTablePreset(preset: TablePreset) {
        if (preset === 'custom') return // custom handled by direct edits
        let cols: Record<ColKey, boolean>
        let order: ColKey[]
        if (preset === 'standard') {
            cols = { actions: true, date: true, voucherNo: false, type: true, sphere: true, description: true, note: true, earmark: true, budget: true, paymentMethod: true, attachments: true, net: false, vat: false, gross: true }
            order = ['actions', 'date', 'type', 'sphere', 'description', 'note', 'earmark', 'budget', 'paymentMethod', 'attachments', 'gross', 'voucherNo', 'net', 'vat']
        } else if (preset === 'minimal') {
            cols = { actions: true, date: true, voucherNo: false, type: false, sphere: false, description: true, note: false, earmark: false, budget: false, paymentMethod: false, attachments: false, net: false, vat: false, gross: true }
            order = ['actions', 'date', 'description', 'note', 'gross', 'voucherNo', 'type', 'sphere', 'earmark', 'budget', 'paymentMethod', 'attachments', 'net', 'vat']
        } else { // details
            cols = { actions: true, date: true, voucherNo: true, type: true, sphere: true, description: true, note: true, earmark: true, budget: true, paymentMethod: true, attachments: true, net: true, vat: true, gross: true }
            order = ['actions', 'date', 'voucherNo', 'type', 'sphere', 'description', 'note', 'earmark', 'budget', 'paymentMethod', 'attachments', 'net', 'vat', 'gross']
        }
        setColsVisible(cols)
        setColsOrder(order)
    }

    // Apply selected preset when tablePreset changes (excluding custom which modifies directly)
    useEffect(() => { applyTablePreset(tablePreset) }, [tablePreset])

    function toggleCol(key: ColKey) {
        if (mandatoryCols.includes(key)) return // keep mandatory columns
        setColsVisible(v => ({ ...v, [key]: !v[key] }))
        setTablePreset('custom')
    }
    function moveCol(key: ColKey, dir: -1 | 1) {
        setColsOrder(order => {
            const idx = order.indexOf(key)
            if (idx < 0) return order
            const newIdx = idx + dir
            if (newIdx < 0 || newIdx >= order.length) return order
            const copy = [...order]
            const [item] = copy.splice(idx, 1)
            copy.splice(newIdx, 0, item)
            return copy
        })
        setTablePreset('custom')
    }

    async function finish(persistAndClose: boolean) {
        if (isSaving) return
        setIsSaving(true)
        try {
            // Persist org data
            await (window as any).api?.settings?.set?.({ key: 'org.name', value: orgName })
            await (window as any).api?.settings?.set?.({ key: 'org.cashier', value: cashier })

            // Persist UI preferences
            try { localStorage.setItem('ui.navLayout', navLayout) } catch {}
            try { localStorage.setItem('ui.navIconColorMode', navIconColorMode) } catch {}
            try { localStorage.setItem('ui.colorTheme', colorTheme) } catch {}
            try { localStorage.setItem('ui.journalRowStyle', journalRowStyle) } catch {}
            try { localStorage.setItem('ui.journalRowDensity', journalRowDensity) } catch {}
            try { localStorage.setItem('ui.glassModals', String(glassModals)) } catch {}
            try { localStorage.setItem('ui.dateFmt', dateFmt) } catch {}
            try { localStorage.setItem('ui.showBookingDraftTabs', String(showBookingDraftTabs)) } catch {}
            try { localStorage.setItem('ui.showBookingEditTabs', String(allowVoucherDeletion && showBookingEditTabs)) } catch {}
            try { localStorage.setItem('ui.bookingsOpenDetached', String(bookingsOpenDetached)) } catch {}
            try { localStorage.setItem('ui.allowVoucherDeletion', String(allowVoucherDeletion)) } catch {}
            try { localStorage.setItem('ui.quickAddAfterSave', quickAddAfterSave) } catch {}
            try { document.documentElement.setAttribute('data-color-theme', colorTheme) } catch {}
            try { document.documentElement.setAttribute('data-journal-row-style', journalRowStyle) } catch {}
            try { document.documentElement.setAttribute('data-journal-row-density', journalRowDensity) } catch {}
            try { document.documentElement.setAttribute('data-glass-modals', String(glassModals)) } catch {}

            // Persist table column settings (from state; if not set ensure preset applied)
            if (tablePreset !== 'custom') applyTablePreset(tablePreset)
            try { localStorage.setItem('journalCols', JSON.stringify(colsVisible)) } catch {}
            try { localStorage.setItem('journalColsOrder', JSON.stringify(colsOrder)) } catch {}

            // Tags upsert
            const toCreate: Array<{ name: string; color?: string }> = []
            for (const t of suggestedTags) {
                if (selectedTags[t.name] && !existingSet.has(t.name.toLowerCase())) toCreate.push({ name: t.name, color: t.color })
            }
            for (const n of customTags) {
                const nm = n.trim()
                if (!nm) continue
                if (existingSet.has(nm.toLowerCase())) continue
                if (toCreate.find(x => x.name.toLowerCase() === nm.toLowerCase())) continue
                toCreate.push({ name: nm })
            }
            for (const t of toCreate) {
                try { await (window as any).api?.tags?.upsert?.({ name: t.name, color: t.color }) } catch {}
            }

            // Persist backup preferences (dir handled by choose/reset actions)
            try { await (window as any).api?.settings?.set?.({ key: 'backup.auto', value: backupMode }) } catch {}
            try { await (window as any).api?.settings?.set?.({ key: 'backup.intervalDays', value: Number(backupIntervalDays) }) } catch {}

            // Mark setup completed
            await (window as any).api?.settings?.set?.({ key: 'setup.completed', value: true })
            try { window.dispatchEvent(new Event('data-changed')) } catch {}
            notify('success', 'Setup gespeichert. Du kannst alles später unter „Einstellungen“ ändern.')
        } catch (e: any) {
            notify('error', e?.message || String(e))
        } finally {
            setIsSaving(false)
            if (persistAndClose) onClose()
        }
    }

    const setupSteps = ['Start', 'Organisation', 'Darstellung', 'Workflow', 'Buchungen', 'Tags', 'Backup'] as const
    const LAST_STEP = setupSteps.length - 1

    function Header() {
        return (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h2 style={{ margin: 0 }}>Erste Schritte</h2>
                    <div className="helper">{setupSteps[step]}</div>
                </div>
                {/* Später oben rechts entfernt – nur noch unten in der Button-Leiste */}
            </div>
        )
    }

    function MiniNavPreview() {
        const top = navLayout === 'top'
        return (
            <div className="card" style={{ padding: 10 }}>
                <div className="helper">Vorschau</div>
                <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                    {top ? (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4, padding: 6, borderBottom: '1px solid var(--border)' }}>
                            {['🏠','📒','📑'].map((i, idx) => (
                                <div key={idx} style={{ textAlign: 'center', opacity: 0.9, color: navIconColorMode === 'color' ? (idx===0?'#7C4DFF':idx===1?'#2962FF':'#00B8D4') : undefined }}>{i}</div>
                            ))}
                        </div>
                    ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: '60px 1fr' }}>
                            <div style={{ borderRight: '1px solid var(--border)', padding: 6, display: 'grid', gap: 6 }}>
                                {['🏠','📒','📑'].map((i, idx) => (
                                    <div key={idx} style={{ textAlign: 'center', opacity: 0.9, color: navIconColorMode === 'color' ? (idx===0?'#7C4DFF':idx===1?'#2962FF':'#00B8D4') : undefined }}>{i}</div>
                                ))}
                            </div>
                            <div style={{ padding: 6 }}>
                                <div className="helper">Inhalt</div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        )
    }

    function MiniTablePreview() {
        const demoRows = [
            { a: '11 Sep 2025', b: 'Mitgliedsbeitrag', g: '+ 50,00 €' },
            { a: '12 Sep 2025', b: 'Material', g: '− 12,90 €' },
        ]
        const density = journalRowDensity === 'compact' ? 4 : 8
        // Preview should mirror the real table behavior:
        // 'both' means zebra background AND separator lines
        const zebra = journalRowStyle === 'zebra' || journalRowStyle === 'both'
        const lines = journalRowStyle === 'lines' || journalRowStyle === 'both'
        return (
            <div className="card" style={{ padding: 10 }}>
                <div className="helper">Vorschau Buchungen</div>
                <table cellPadding={6} style={{ width: '100%', borderCollapse: 'collapse', borderSpacing: 0 }}>
                    <thead>
                        <tr>
                            <th align="left" style={{ borderBottom: lines ? '1px solid var(--border)' : '0', padding: `${density}px 8px` }}>Datum</th>
                            <th align="left" style={{ borderBottom: lines ? '1px solid var(--border)' : '0', padding: `${density}px 8px` }}>Beschreibung</th>
                            <th align="right" style={{ borderBottom: lines ? '1px solid var(--border)' : '0', padding: `${density}px 8px` }}>Brutto</th>
                        </tr>
                    </thead>
                    <tbody>
                        {demoRows.map((r, i) => (
                            <tr key={i} style={{ background: zebra && i % 2 === 1 ? 'var(--table-row-alt)' : undefined }}>
                                <td style={{ padding: `${density}px 8px`, borderBottom: lines ? '1px solid var(--border)' : '0' }}>{r.a}</td>
                                <td style={{ padding: `${density}px 8px`, borderBottom: lines ? '1px solid var(--border)' : '0' }}>{r.b}</td>
                                <td style={{ padding: `${density}px 8px`, borderBottom: lines ? '1px solid var(--border)' : '0' }} align="right">{r.g}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        )
    }

    // Load backup dir when entering the backup step
    useEffect(() => {
        let alive = true
        if (step === 6) {
            (async () => {
                try {
                    const res = await (window as any).api?.backup?.getDir?.()
                    if (alive && res?.ok) setBackupDir(String(res.dir || ''))
                } catch {}
                try {
                    const m = await (window as any).api?.settings?.get?.({ key: 'backup.auto' })
                    const v = String((m?.value as any) || 'PROMPT').toUpperCase()
                    if (alive) setBackupMode((['SILENT','PROMPT','OFF'] as const).includes(v as any) ? (v as any) : 'PROMPT')
                } catch {}
                try {
                    const i = await (window as any).api?.settings?.get?.({ key: 'backup.intervalDays' })
                    const n = Number((i?.value as any) ?? 7)
                    if (alive) setBackupIntervalDays(Number.isFinite(n) && n > 0 ? n : 7)
                } catch {}
            })()
        }
        return () => { alive = false }
    }, [step])

    async function chooseBackupDir() {
        try {
            const res = await (window as any).api?.backup?.setDir?.()
            if (res?.ok) {
                setBackupDir(String(res.dir || ''))
                const moved = Number(res.moved || 0)
                setBackupMsg(moved > 0 ? `${moved} vorhandene Sicherung(en) übernommen.` : 'Sicherungsordner aktualisiert.')
                notify('success', moved > 0 ? `Backup-Ordner gesetzt – ${moved} Datei(en) übernommen.` : 'Backup-Ordner gesetzt.')
                // Zusatz: Wenn im neu gewählten Ordner bereits eine Datenbank existiert, zeige Vergleichsmodal wie bei „Standard wiederherstellen“.
                try {
                    const preview = await (window as any).api?.db?.smartRestore?.preview?.({ mode: 'selectedFolder' })
                    // Erwartete Struktur ähnlich wie beim Standard: { current, default, recommendation }
                    // Wir tauschen hier 'default' gegen 'selected' aus, wenn vorhanden.
                    if (preview && preview.selected && preview.selected.exists) {
                        ;(window as any).dispatchEvent(new CustomEvent('setup-show-db-compare', { detail: { preview } }))
                    } else if (preview && preview.default && preview.default.exists && preview.current && preview.current.exists) {
                        // Fallback: älteres API ohne selected – zeige normalen Vergleich, falls sinnvoll
                        ;(window as any).dispatchEvent(new CustomEvent('setup-show-db-compare', { detail: { preview } }))
                    }
                } catch { /* ignore preview errors */ }
            } else if (res?.error) {
                notify('error', String(res.error))
            }
        } catch (e: any) { notify('error', e?.message || String(e)) }
    }
    async function useDefaultBackupDir() {
        try {
            const res = await (window as any).api?.backup?.resetDir?.()
            if (res?.ok) {
                setBackupDir(String(res.dir || ''))
                const moved = Number(res.moved || 0)
                setBackupMsg(moved > 0 ? `${moved} vorhandene Sicherung(en) übernommen.` : 'Standardordner aktiv.')
                notify('success', moved > 0 ? `Standardordner aktiv – ${moved} Datei(en) übernommen.` : 'Backup auf Standardordner zurückgesetzt.')
            } else if (res?.error) {
                notify('error', String(res.error))
            }
        } catch (e: any) { notify('error', e?.message || String(e)) }
    }

    const formatSummaryValue = (value: string | null | undefined) => {
        const text = String(value || '').trim()
        return text || 'Nicht gesetzt'
    }

    function renderStep() {
        if (step === 0) {
            return (
                <div className="card" style={{ padding: 12 }}>
                    <div className="helper">Willkommen! Dieses kurze Setup richtet die wichtigsten Dinge ein. Du kannst jederzeit abbrechen und später in den Einstellungen alles ändern.</div>
                    <ul style={{ margin: '8px 0 0 18px', display: 'grid', gap: 6 }}>
                        <li>Organisation: Name und Kassier/Nutzer</li>
                        <li>Darstellung: Menü, Farben, Hintergrund, Glaseffekt und Datumsformat</li>
                        <li>Workflow: Buchungsreiter, eigenes Buchungsfenster, Speichern-Verhalten und Storno/Löschen</li>
                        <li>Buchungsansicht: Spaltenanordnung und Sichtbarkeit</li>
                        <li>Tags und Backups: Startwerte und Sicherungsmodus</li>
                    </ul>
                </div>
            )
        }
        if (step === 1) {
            return (
                <div className="card" style={{ padding: 12, display: 'grid', gap: 10 }}>
                    <div className="helper">Diese Angaben erscheinen z. B. in der Titelleiste und in Exporten.</div>
                    <div className="row">
                        <div className="field" style={{ minWidth: 260 }}>
                            <label>Organisationsname</label>
                            <input className="input" value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="z. B. Sportverein Musterstadt e.V." />
                        </div>
                        <div className="field" style={{ minWidth: 220 }}>
                            <label>Kassier / Nutzer</label>
                            <input className="input" value={cashier} onChange={(e) => setCashier(e.target.value)} placeholder="z. B. Max Mustermann" />
                        </div>
                    </div>
                </div>
            )
        }
        if (step === 2) {
            return (
                <div className="card setup-appearance-card">
                    {/* Row 1: Binary toggles */}
                    <div className="setup-toggle-row">
                        <div className="setup-field">
                            <label>Menü-Layout</label>
                            <ToggleButtons
                                value={navLayout}
                                onChange={setNavLayout}
                                options={[
                                    { value: 'left', label: 'Links', icon: '' },
                                    { value: 'top', label: 'Oben', icon: '' }
                                ]}
                            />
                        </div>
                        <div className="setup-field">
                            <label>Menü-Icons</label>
                            <ToggleButtons
                                value={navIconColorMode}
                                onChange={setNavIconColorMode}
                                options={[
                                    { value: 'mono', label: 'Mono', icon: '' },
                                    { value: 'color', label: 'Farbig', icon: '' }
                                ]}
                            />
                        </div>
                        <div className="setup-field">
                            <label>Datumsformat</label>
                            <ToggleButtons
                                value={dateFmt}
                                onChange={setDateFmt}
                                options={DATE_FORMAT_OPTIONS.map((option) => ({ value: option.id, label: option.label }))}
                            />
                        </div>
                        <div className="setup-field">
                            <label>Glaseffekt</label>
                            <ToggleButtons
                                value={glassModals ? 'on' : 'off'}
                                onChange={(value) => setGlassModals(value === 'on')}
                                options={[
                                    { value: 'off', label: 'Aus' },
                                    { value: 'on', label: 'Ein' }
                                ]}
                            />
                        </div>
                    </div>

                    {/* Row 2: Theme selection */}
                    <div className="setup-section">
                        <label>Farb-Theme</label>
                        <div className="theme-picker">
                            {COLOR_THEME_OPTIONS.map(t => (
                                <button
                                    key={t.id}
                                    type="button"
                                    className={`theme-chip ${colorTheme === t.id ? 'active' : ''}`}
                                    onClick={() => setColorTheme(t.id)}
                                    data-theme={t.id}
                                >
                                    <span className="theme-swatch" data-theme={t.id} />
                                    <span>{t.name}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Row 3: Background image */}
                    <div className="setup-section">
                        <label>Hintergrundbild</label>
                        <div className="background-picker">
                            {BACKGROUND_IMAGE_OPTIONS.map(bg => (
                                <button
                                    key={bg.id}
                                    type="button"
                                    className={`background-chip ${backgroundImage === bg.id ? 'active' : ''}`}
                                    onClick={() => {
                                        if (bg.id !== 'custom') {
                                            setBackgroundImage(bg.id)
                                            return
                                        }
                                        // Custom: if we already have an image, just select; otherwise open picker
                                        if (customBackgroundImage) {
                                            setBackgroundImage('custom')
                                        } else {
                                            openCustomBgPicker()
                                        }
                                    }}
                                >
                                    {bg.id === 'custom' ? (
                                        <span
                                            className={`background-preview bg-custom${customBackgroundImage ? '' : ' custom-bg-preview--empty'}`}
                                            style={customBackgroundImage ? { backgroundImage: `url(${customBackgroundImage})` } : undefined}
                                        >
                                            {!customBackgroundImage ? '+' : null}
                                        </span>
                                    ) : (
                                        <span className={`background-preview bg-${bg.id}`} />
                                    )}
                                    <span>{bg.compactName}</span>
                                </button>
                            ))}
                        </div>

                        <input
                            ref={customBgInputRef}
                            type="file"
                            accept="image/*"
                            className="sr-only"
                            onChange={(e) => {
                                const f = e.target.files?.[0]
                                e.target.value = ''
                                if (f) void handleCustomBgUpload(f)
                            }}
                        />

                        {(backgroundImage === 'custom' || !!customBackgroundImage) && (
                            <div className="custom-bg-controls">
                                <div className="custom-bg-row">
                                    <div
                                        className={`custom-bg-preview ${customBackgroundImage ? '' : 'custom-bg-preview--empty'}`}
                                        style={customBackgroundImage ? { backgroundImage: `url(${customBackgroundImage})` } : undefined}
                                        aria-label={customBackgroundImage ? 'Eigenes Hintergrundbild' : 'Kein eigenes Hintergrundbild'}
                                    />
                                    <div className="custom-bg-actions">
                                        <button className="btn" type="button" onClick={openCustomBgPicker} disabled={isCustomBgProcessing}>
                                            {customBackgroundImage ? 'Bild ersetzen…' : 'Bild auswählen…'}
                                        </button>
                                        <button className="btn danger" type="button" onClick={handleRemoveCustomBg} disabled={!customBackgroundImage || isCustomBgProcessing}>
                                            Entfernen
                                        </button>
                                    </div>
                                </div>
                                <div className="helper">
                                    {isCustomBgProcessing ? 'Bild wird verarbeitet…' : 'Tipp: Große Fotos werden automatisch komprimiert.'}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Preview row */}
                    <div className="setup-preview-row">
                        <MiniNavPreview />
                        <MiniTablePreview />
                    </div>
                </div>
            )
        }
        if (step === 3) {
            return (
                <div className="card" style={{ padding: 12, display: 'grid', gap: 12 }}>
                    <div className="helper">Lege fest, wie sich das Buchungsfenster im Alltag verhält.</div>
                    <div className="settings-layout-grid settings-layout-grid--wide">
                        <label className="settings-toggle-card" htmlFor="setup-booking-draft-tabs">
                            <span className="settings-toggle-card__copy">
                                <strong>Buchungsreiter</strong>
                                <span>Mehrere offene Buchungsentwürfe im Hauptfenster halten.</span>
                            </span>
                            <input
                                id="setup-booking-draft-tabs"
                                role="switch"
                                aria-checked={showBookingDraftTabs}
                                className="toggle"
                                type="checkbox"
                                checked={showBookingDraftTabs}
                                onChange={(e) => setShowBookingDraftTabs(e.target.checked)}
                            />
                        </label>
                        <label className={`settings-toggle-card ${!allowVoucherDeletion ? 'is-disabled' : ''}`} htmlFor="setup-booking-edit-tabs">
                            <span className="settings-toggle-card__copy">
                                <strong>Bearbeitungen als Reiter</strong>
                                <span>{allowVoucherDeletion ? 'Mehrere geöffnete Bearbeitungen als eigene Reiter halten.' : 'Verfügbar, wenn endgültiges Löschen erlaubt ist.'}</span>
                            </span>
                            <input
                                id="setup-booking-edit-tabs"
                                role="switch"
                                aria-checked={allowVoucherDeletion && showBookingEditTabs}
                                className="toggle"
                                type="checkbox"
                                checked={allowVoucherDeletion && showBookingEditTabs}
                                disabled={!allowVoucherDeletion}
                                onChange={(e) => setShowBookingEditTabs(e.target.checked)}
                            />
                        </label>
                        <label className="settings-toggle-card" htmlFor="setup-bookings-open-detached">
                            <span className="settings-toggle-card__copy">
                                <strong>Eigenes Buchungsfenster</strong>
                                <span>Neue und bearbeitete Buchungen in einem separaten Fenster öffnen.</span>
                            </span>
                            <input
                                id="setup-bookings-open-detached"
                                role="switch"
                                aria-checked={bookingsOpenDetached}
                                className="toggle"
                                type="checkbox"
                                checked={bookingsOpenDetached}
                                onChange={(e) => setBookingsOpenDetached(e.target.checked)}
                            />
                        </label>
                        <div className="settings-layout-control">
                            <div className="settings-layout-label-row">
                                <label>Nach Speichern</label>
                                <span>Standardaktion nach einer gespeicherten Buchung.</span>
                            </div>
                            <div className="btn-group">
                                <button type="button" className={`btn-option ${quickAddAfterSave === 'close' ? 'active' : ''}`} onClick={() => setQuickAddAfterSave('close')}>Schließen</button>
                                <button type="button" className={`btn-option ${quickAddAfterSave === 'new' ? 'active' : ''}`} onClick={() => setQuickAddAfterSave('new')}>Neue Buchung</button>
                            </div>
                        </div>
                        <label className="settings-toggle-card" htmlFor="setup-voucher-delete-mode">
                            <span className="settings-toggle-card__copy">
                                <strong>Buchungen endgültig löschen</strong>
                                <span>Aus nutzt Storno, Ein erlaubt dauerhaftes Entfernen.</span>
                            </span>
                            <input
                                id="setup-voucher-delete-mode"
                                role="switch"
                                aria-checked={allowVoucherDeletion}
                                className="toggle"
                                type="checkbox"
                                checked={allowVoucherDeletion}
                                onChange={(e) => {
                                    setAllowVoucherDeletion(e.target.checked)
                                    if (!e.target.checked) setShowBookingEditTabs(false)
                                }}
                            />
                        </label>
                    </div>
                </div>
            )
        }
        if (step === 4) {
            const baseDensity = journalRowDensity === 'compact' ? 4 : 8
            const density = Math.max(2, Math.round(baseDensity * 0.7)) // etwas kompakter für die Vorschau
            const zebra = journalRowStyle === 'zebra' || journalRowStyle === 'both'
            const lines = journalRowStyle === 'lines' || journalRowStyle === 'both'
            const demoRows = [
                { actions: '✏️', date: '11 Sep', voucherNo: 'V001', type: 'IN', sphere: 'IDEELL', description: 'Mitgliedsbeitrag', note: '', earmark: '—', budget: '2025', paymentMethod: 'BANK', attachments: '📎', net: '+50,00 €', vat: '0,00 €', gross: '+50,00 €' },
                { actions: '✏️', date: '12 Sep', voucherNo: 'V002', type: 'OUT', sphere: 'IDEELL', description: 'Material', note: '', earmark: '—', budget: '2025', paymentMethod: 'BANK', attachments: '📎', net: '−12,90 €', vat: '0,00 €', gross: '−12,90 €' }
            ]
            const headerLabels: Record<ColKey, string> = {
                actions: 'Aktionen', date: 'Datum', voucherNo: 'Nr.', type: 'Art', sphere: 'Sphäre', description: 'Beschreibung', note: 'Kommentar', earmark: 'Zw.', budget: 'Budget', paymentMethod: 'Zahlweg', attachments: 'Anh.', net: 'Netto', vat: 'MwSt', gross: 'Brutto'
            }
            return (
                <div className="card" style={{ padding: 12, display: 'grid', gap: 12 }}>
                    <div className="helper">Lege Zeilenhöhe, Zeilenlayout und die sichtbaren Spalten in der Buchungsübersicht fest.</div>
                    <div className="setup-toggle-row">
                        <div className="setup-field">
                            <label>Zeilenhöhe</label>
                            <ToggleButtons
                                value={journalRowDensity}
                                onChange={setJournalRowDensity}
                                options={[
                                    { value: 'normal', label: 'Normal' },
                                    { value: 'compact', label: 'Kompakt' }
                                ]}
                            />
                        </div>
                        <div className="setup-field">
                            <label>Zeilenlayout</label>
                            <select className="input" value={journalRowStyle} onChange={(e) => setJournalRowStyle(e.target.value as JournalRowStyle)}>
                                <option value="both">Linien + Zebra</option>
                                <option value="lines">Nur Linien</option>
                                <option value="zebra">Nur Zebra</option>
                                <option value="none">Ohne</option>
                            </select>
                        </div>
                    </div>
                    <div className="field" style={{ minWidth: 300 }}>
                        <label>Spalten-Preset</label>
                        <select className="input" value={tablePreset} onChange={(e) => setTablePreset(e.target.value as TablePreset)}>
                            <option value="standard">Voreinstellung: Standard</option>
                            <option value="minimal">Voreinstellung: Minimal</option>
                            <option value="details">Voreinstellung: Details</option>
                            <option value="custom">Benutzerdefiniert (eigene Auswahl)</option>
                        </select>
                        <div className="helper" style={{ marginTop: 6 }}>
                            {tablePreset === 'standard' && 'Standard: Häufig genutzte Spalten'}
                            {tablePreset === 'minimal' && 'Minimal: nur Kernspalten'}
                            {tablePreset === 'details' && 'Details: alle Spalten sichtbar'}
                            {tablePreset === 'custom' && 'Benutzerdefiniert: unten angepasst'}
                        </div>
                    </div>
                    <button className="btn ghost hover-highlight" style={{ justifySelf: 'flex-start' }} onClick={() => setShowAdvanced(s => !s)}>Erweitert: Spalten individuell {showAdvanced ? 'ausblenden' : 'anpassen'}</button>
                    {showAdvanced && (
                        <div className="card" style={{ padding: 10, display: 'grid', gap: 8 }}>
                            <div className="helper">Sichtbarkeit & Reihenfolge (Pflichtspalten sind fixiert)</div>
                            <div style={{ display: 'grid', gap: 6 }}>
                                {colsOrder.map(key => (
                                    <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
                                            <input type="checkbox" disabled={mandatoryCols.includes(key)} checked={!!colsVisible[key]} onChange={() => toggleCol(key)} /> {headerLabels[key]} {mandatoryCols.includes(key) && <span className="helper" style={{ fontSize: 11 }}>(Pflicht)</span>}
                                        </label>
                                        <div style={{ display: 'flex', gap: 4 }}>
                                            <button className="btn ghost hover-highlight" style={{ padding: '2px 6px' }} disabled={colsOrder.indexOf(key) === 0} onClick={() => moveCol(key, -1)}>↑</button>
                                            <button className="btn ghost hover-highlight" style={{ padding: '2px 6px' }} disabled={colsOrder.indexOf(key) === colsOrder.length - 1} onClick={() => moveCol(key, 1)}>↓</button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                    <div className="card" style={{ padding: 10 }}>
                        <div className="helper">Vorschau der Buchungsansicht</div>
                        <div style={{ overflowX: 'auto' }}>
                            <table cellPadding={4} style={{ width: '100%', borderCollapse: 'collapse', borderSpacing: 0, minWidth:  colsOrder.length * 80, fontSize: 12 }}>
                                <thead>
                                    <tr>
                                        {colsOrder.filter(c => colsVisible[c]).map(col => (
                                            <th key={col} align={['net','vat','gross'].includes(col) ? 'right' : col === 'attachments' ? 'center' : 'left'} style={{ borderBottom: lines ? '1px solid var(--border)' : '0', padding: `${density}px 6px` }}>{headerLabels[col]}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {demoRows.map((r, i) => (
                                        <tr key={i} style={{ background: zebra && i % 2 === 1 ? 'var(--table-row-alt)' : undefined }}>
                                            {colsOrder.filter(c => colsVisible[c]).map(col => (
                                                <td key={col} align={['net','vat','gross'].includes(col) ? 'right' : col === 'attachments' ? 'center' : 'left'} style={{ padding: `${density}px 6px`, borderBottom: lines ? '1px solid var(--border)' : '0' }}>{(r as any)[col]}</td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )
        }
        if (step === 5) {
            const all = suggestedTags
            return (
                <div className="card" style={{ padding: 12, display: 'grid', gap: 12 }}>
                    <div className="helper">Wähle häufige Stichwörter. Du kannst später jederzeit weitere Tags anlegen.</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                        {all.map(t => (
                            <label key={t.name} className="chip" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                                <input type="checkbox" checked={!!selectedTags[t.name]} onChange={(e) => setSelectedTags({ ...selectedTags, [t.name]: e.currentTarget.checked })} />
                                <span style={{ width: 12, height: 12, borderRadius: 4, background: t.color || 'var(--border)' }} aria-hidden />
                                <span>{t.name}</span>
                                {existingSet.has(t.name.toLowerCase()) && <span className="helper">(vorhanden)</span>}
                            </label>
                        ))}
                    </div>
                    <div className="row">
                        <div className="field" style={{ minWidth: 260 }}>
                            <label>Eigener Tag</label>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <input className="input" value={customTag} onChange={(e) => setCustomTag(e.target.value)} placeholder="z. B. Projekt ABC" />
                                <button className="btn hover-highlight" onClick={() => { const v = customTag.trim(); if (v) { setCustomTags([...customTags, v]); setCustomTag('') } }}>Hinzufügen</button>
                            </div>
                        </div>
                    </div>
                    {customTags.length > 0 && (
                        <div className="helper">Eigene Tags: {customTags.join(', ')}</div>
                    )}
                </div>
            )
        }
    // step === 6 Backup
    return (
            <div className="card" style={{ padding: 12, display: 'grid', gap: 12 }}>
                <div className="helper">Sicherungen enthalten u. a. die Datenbank (.sqlite) und werden im gewählten Ordner abgelegt. Beim Ordnerwechsel werden vorhandene .sqlite-Backups automatisch übernommen.</div>
                <div className="setup-summary-grid">
                    <div><span>Organisation</span><strong>{formatSummaryValue(orgName)}</strong></div>
                    <div><span>Darstellung</span><strong>{COLOR_THEME_OPTIONS.find((theme) => theme.id === colorTheme)?.name || colorTheme}</strong></div>
                    <div><span>Buchungsfenster</span><strong>{bookingsOpenDetached ? 'Eigenes Fenster' : showBookingDraftTabs ? 'Reiter im Hauptfenster' : 'Ein Fenster'}</strong></div>
                    <div><span>Nach Speichern</span><strong>{quickAddAfterSave === 'new' ? 'Neue Buchung' : 'Schließen'}</strong></div>
                </div>
                <div className="row">
                    <div className="field" style={{ minWidth: 420 }}>
                        <label>Aktueller Sicherungsordner</label>
                        <input className="input" value={backupDir} readOnly />
                        {backupMsg && <div className="helper">{backupMsg}</div>}
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button className="btn hover-highlight" onClick={chooseBackupDir}>Ordner wählen…</button>
                    <button className="btn ghost hover-highlight" onClick={useDefaultBackupDir}>Standard verwenden</button>
                    <button className="btn ghost hover-highlight" onClick={async() => { try { await (window as any).api?.backup?.openFolder?.() } catch {} }}>Ordner öffnen</button>
                </div>
                <div className="row">
                    <div className="field" style={{ minWidth: 260 }}>
                        <label>Sicherungsmodus</label>
                        <div style={{ display: 'grid', gap: 6 }}>
                            <label className="chip" style={{ cursor: 'pointer' }}>
                                <input type="radio" name="backupMode" checked={backupMode === 'SILENT'} onChange={() => setBackupMode('SILENT')} /> Automatisch im Hintergrund
                            </label>
                            <label className="chip" style={{ cursor: 'pointer' }}>
                                <input type="radio" name="backupMode" checked={backupMode === 'PROMPT'} onChange={() => setBackupMode('PROMPT')} /> Nachfragen (Hinweis anzeigen)
                            </label>
                            <label className="chip" style={{ cursor: 'pointer' }}>
                                <input type="radio" name="backupMode" checked={backupMode === 'OFF'} onChange={() => setBackupMode('OFF')} /> Aus
                            </label>
                        </div>
                    </div>
                    <div className="field" style={{ minWidth: 220 }}>
                        <label>Intervall</label>
                        <select className="input" value={backupIntervalDays} onChange={(e) => setBackupIntervalDays(Number(e.target.value))} disabled={backupMode === 'OFF'}>
                            {[1,3,7,14,30].map(d => <option key={d} value={d}>{d} Tag{d>1?'e':''}</option>)}
                        </select>
                        <div className="helper">Wie oft überprüft wird, ob eine Sicherung fällig ist.</div>
                    </div>
                </div>
                <div className="helper">Empfehlung: Lege den Ordner in einem Cloud-Sync-Verzeichnis (z. B. OneDrive) ab, damit Backups zusätzlich gesichert sind.</div>
            </div>
        )
    }

    return (
        <div className="modal-overlay" role="dialog" aria-modal="true" onClick={() => { /* avoid closing by overlay */ }}>
            <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 'clamp(1000px, 92vw, 1400px)', display: 'grid', gap: 12 }}>
                <Header />
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {setupSteps.map((label, i) => (
                        <div key={label} title={label} style={{ width: 26, height: 6, borderRadius: 4, background: i <= step ? 'var(--accent)' : 'var(--border)' }} />
                    ))}
                </div>
                {renderStep()}
                <div style={{ display: 'flex', justifyContent: step > 0 ? 'space-between' : 'flex-end', gap: 8 }}>
                    {step > 0 && (
                            <button className="btn hover-highlight" disabled={isSaving} onClick={() => setStep(s => Math.max(0, s - 1))}>Zurück</button>
                    )}
                    {step < LAST_STEP ? (
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button className="btn hover-highlight" disabled={isSaving} onClick={() => setStep(s => Math.min(LAST_STEP, s + 1))}>Weiter</button>
                            <button className="btn ghost hover-highlight" disabled={isSaving} onClick={onClose}>Später</button>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button className="btn ghost hover-highlight" disabled={isSaving} onClick={onClose}>Später</button>
                            <button className="btn primary hover-highlight" disabled={isSaving} onClick={() => finish(true)}>{isSaving ? 'Speichere...' : 'Fertig'}</button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
