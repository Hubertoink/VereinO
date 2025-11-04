/* eslint-disable */
import React, { useEffect, useMemo, useState } from 'react'

type NavLayout = 'left' | 'top'
type NavIconColorMode = 'color' | 'mono'
type ColorTheme = 'default' | 'fiery-ocean' | 'peachy-delight' | 'pastel-dreamland' | 'ocean-breeze' | 'earthy-tones' | 'monochrome-harmony' | 'vintage-charm'
type JournalRowStyle = 'both' | 'lines' | 'zebra' | 'none'
type JournalRowDensity = 'normal' | 'compact'

export default function SetupWizardModal({
    onClose,
    navLayout, setNavLayout,
    navIconColorMode, setNavIconColorMode,
    colorTheme, setColorTheme,
    journalRowStyle, setJournalRowStyle,
    journalRowDensity, setJournalRowDensity,
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
    existingTags: Array<{ name: string; color?: string | null }>
    notify: (type: 'success' | 'error' | 'info', text: string, ms?: number) => void
}) {
    const [step, setStep] = useState<number>(0)
    const [orgName, setOrgName] = useState<string>('')
    const [cashier, setCashier] = useState<string>('')

    // Defaults for first-run preview (as per request): top menu, colored icons, compact rows
    useEffect(() => {
        // Apply a pleasant preview immediately (non-destructive; persistence happens on Finish)
        try { setNavLayout('top') } catch {}
        try { setNavIconColorMode('color') } catch {}
        try { setJournalRowDensity('compact') } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

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

    async function finish(persistAndClose: boolean) {
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
            try { document.documentElement.setAttribute('data-color-theme', colorTheme) } catch {}
            try { document.documentElement.setAttribute('data-journal-row-style', journalRowStyle) } catch {}
            try { document.documentElement.setAttribute('data-journal-row-density', journalRowDensity) } catch {}

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
            if (persistAndClose) onClose()
        }
    }

    const LAST_STEP = 4

    function Header() {
        return (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 style={{ margin: 0 }}>Erste Schritte</h2>
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
        const zebra = journalRowStyle === 'zebra'
        const lines = journalRowStyle === 'lines' || journalRowStyle === 'both'
        return (
            <div className="card" style={{ padding: 10 }}>
                <div className="helper">Vorschau Buchungen</div>
                <table cellPadding={6} style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0 }}>
                    <thead>
                        <tr>
                            <th align="left" style={{ borderBottom: lines ? '1px solid var(--border)' : undefined, padding: `${density}px 8px` }}>Datum</th>
                            <th align="left" style={{ borderBottom: lines ? '1px solid var(--border)' : undefined, padding: `${density}px 8px` }}>Beschreibung</th>
                            <th align="right" style={{ borderBottom: lines ? '1px solid var(--border)' : undefined, padding: `${density}px 8px` }}>Brutto</th>
                        </tr>
                    </thead>
                    <tbody>
                        {demoRows.map((r, i) => (
                            <tr key={i} style={{ background: zebra && i % 2 === 1 ? 'color-mix(in oklab, var(--text)/6%, transparent)' : undefined }}>
                                <td style={{ padding: `${density}px 8px`, borderBottom: lines ? '1px solid var(--border)' : undefined }}>{r.a}</td>
                                <td style={{ padding: `${density}px 8px`, borderBottom: lines ? '1px solid var(--border)' : undefined }}>{r.b}</td>
                                <td style={{ padding: `${density}px 8px`, borderBottom: lines ? '1px solid var(--border)' : undefined }} align="right">{r.g}</td>
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
        if (step === 4) {
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

    function renderStep() {
        if (step === 0) {
            return (
                <div className="card" style={{ padding: 12 }}>
                    <div className="helper">Willkommen! Dieses kurze Setup richtet die wichtigsten Dinge ein. Du kannst jederzeit abbrechen und später in den Einstellungen alles ändern.</div>
                    <ul style={{ margin: '8px 0 0 18px', display: 'grid', gap: 6 }}>
                        <li>Organisation: Name und Kassier/Nutzer</li>
                        <li>Darstellung: Menü, Zeilenlayout/-höhe, Farben (mit Vorschau)</li>
                        <li>Tags: häufige Stichwörter anlegen</li>
                        <li>Backups: Speicherort wählen und Hinweise</li>
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
                <div className="card" style={{ padding: 12, display: 'grid', gap: 12 }}>
                    <div className="row">
                        <div className="field" style={{ minWidth: 220 }}>
                            <label>Menü-Layout</label>
                            <select className="input" value={navLayout} onChange={(e) => setNavLayout(e.target.value as NavLayout)}>
                                <option value="left">Links (klassisch)</option>
                                <option value="top">Oben (kompakt)</option>
                            </select>
                            <div className="helper">„Oben“ zeigt eine kompakte Icon-Leiste am oberen Rand.</div>
                        </div>
                        <div className="field" style={{ minWidth: 220 }}>
                            <label>Farbige Menü-Icons</label>
                            <select className="input" value={navIconColorMode} onChange={(e) => setNavIconColorMode(e.target.value as NavIconColorMode)}>
                                <option value="mono">Monochrom</option>
                                <option value="color">Farbig</option>
                            </select>
                        </div>
                        <div className="field" style={{ minWidth: 220 }}>
                            <label>Zeilenhöhe</label>
                            <select className="input" value={journalRowDensity} onChange={(e) => setJournalRowDensity(e.target.value as JournalRowDensity)}>
                                <option value="normal">Normal</option>
                                <option value="compact">Kompakt</option>
                            </select>
                        </div>
                        <div className="field" style={{ minWidth: 220 }}>
                            <label>Zeilenlayout</label>
                            <select className="input" value={journalRowStyle} onChange={(e) => setJournalRowStyle(e.target.value as JournalRowStyle)}>
                                <option value="both">Linien + Zebra</option>
                                <option value="lines">Nur Linien</option>
                                <option value="zebra">Nur Zebra</option>
                                <option value="none">Ohne Linien/Zebra</option>
                            </select>
                        </div>
                        <div className="field" style={{ minWidth: 220 }}>
                            <label>Farb-Theme</label>
                            <select className="input" value={colorTheme} onChange={(e) => setColorTheme(e.target.value as ColorTheme)}>
                                <option value="default">Standard</option>
                                <option value="fiery-ocean">Fiery Ocean</option>
                                <option value="peachy-delight">Peachy Delight</option>
                                <option value="pastel-dreamland">Pastel Dreamland</option>
                                <option value="ocean-breeze">Ocean Breeze</option>
                                <option value="earthy-tones">Earthy Tones</option>
                                <option value="monochrome-harmony">Monochrome Harmony</option>
                                <option value="vintage-charm">Vintage Charm</option>
                            </select>
                        </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <MiniNavPreview />
                        <MiniTablePreview />
                    </div>
                </div>
            )
        }
        if (step === 3) {
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
        // step === 4 Backup
        return (
            <div className="card" style={{ padding: 12, display: 'grid', gap: 12 }}>
                <div className="helper">Sicherungen enthalten u. a. die Datenbank (.sqlite) und werden im gewählten Ordner abgelegt. Beim Ordnerwechsel werden vorhandene .sqlite-Backups automatisch übernommen.</div>
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
            <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 820, display: 'grid', gap: 12 }}>
                <Header />
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {Array.from({ length: LAST_STEP + 1 }, (_, i) => i).map((i) => (
                        <div key={i} title={`Schritt ${i + 1}`} style={{ width: 26, height: 6, borderRadius: 4, background: i <= step ? 'var(--accent)' : 'var(--border)' }} />
                    ))}
                </div>
                {renderStep()}
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <button className="btn hover-highlight" onClick={() => setStep(s => Math.max(0, s - 1))} disabled={step === 0}>Zurück</button>
                    {step < LAST_STEP ? (
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button className="btn hover-highlight" onClick={() => setStep(s => Math.min(LAST_STEP, s + 1))}>Weiter</button>
                            <button className="btn ghost hover-highlight" onClick={() => finish(true)}>Später</button>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button className="btn ghost hover-highlight" onClick={() => finish(true)}>Später</button>
                            <button className="btn primary hover-highlight" onClick={() => finish(true)}>Fertig</button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
