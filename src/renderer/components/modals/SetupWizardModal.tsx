import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom'
import { IconArrowLeft, IconArrowRight, IconCheck, IconBuildingCommunity, IconLayoutDashboard, IconShieldCheck, IconRocket, IconFolder, IconTags, IconInfoCircle } from '@tabler/icons-react'
import ModalHeader from '../ModalHeader'
import appLogo from '../../../../build/Icon.ico'
import { COLOR_THEME_OPTIONS } from '../../utils/appearanceOptions'
import { dispatchDataChanged } from '../../utils/refresh'
import type { ColorTheme } from '../../context/uiTheme'
import './setupBookingView.css'
import './setupWizard.css'

const STEPS = [
  { label: 'Willkommen', title: 'Willkommen bei VereinO', description: 'Dein Verein. Deine Finanzen. In wenigen Schritten startklar.', icon: IconBuildingCommunity },
  { label: 'Deine Ansicht', title: 'So behältst du den Überblick', description: 'Wähle die Ansicht, mit der du dich wohlfühlst. Du kannst sie jederzeit ändern.', icon: IconLayoutDashboard },
  { label: 'Datensicherung', title: 'Deine Daten gut gesichert', description: 'Bestimme, wie VereinO dich beim Sichern deiner Daten unterstützt.', icon: IconShieldCheck },
  { label: 'Startklar', title: 'Bereit für deine erste Buchung', description: 'Prüfe deine Auswahl. Danach kannst du direkt loslegen.', icon: IconRocket },
]
const BACKUP_MODES = [
  { value: 'SILENT', title: 'Automatisch sichern', description: 'VereinO erstellt fällige Sicherungen im Hintergrund.' },
  { value: 'PROMPT', title: 'Vorher nachfragen', description: 'Du erhältst einen Hinweis, wenn eine Sicherung fällig ist.' },
  { value: 'OFF', title: 'Manuell sichern', description: 'Du startest Sicherungen selbst in den Einstellungen.' },
] as const
const COMMON_TAGS = [{ name: 'Material', color: '#8D6E63' }, { name: 'Reise', color: '#AD1457' }, { name: 'Gebühren', color: '#455A64' }, { name: 'Miete', color: '#5D4037' }]
const VEREIN_TAGS = [{ name: 'Mitgliedsbeitrag', color: '#2E7D32' }, { name: 'Spende', color: '#1565C0' }, { name: 'Sponsor', color: '#6A1B9A' }, { name: 'Event', color: '#00838F' }]

type Props = {
  onClose: () => void
  bookingView: 'classic' | 'plus'
  setBookingView: (value: 'classic' | 'plus') => void
  colorTheme: ColorTheme
  setColorTheme: (value: ColorTheme) => void
  existingTags: Array<{ name: string; color?: string | null }>
  notify: (type: 'success' | 'error' | 'info', text: string, ms?: number) => void
}

export default function SetupWizardModal({ onClose, bookingView, setBookingView, colorTheme, setColorTheme, existingTags, notify }: Props) {
  const id = useId()
  const [step, setStep] = useState(0)
  const [orgName, setOrgName] = useState('')
  const [cashier, setCashier] = useState('')
  const [orgId, setOrgId] = useState<string | null>(null)
  const [generalProfile, setGeneralProfile] = useState(false)
  const [draftView, setDraftView] = useState(bookingView)
  const [draftTheme, setDraftTheme] = useState(colorTheme)
  const [backupMode, setBackupMode] = useState<'SILENT' | 'PROMPT' | 'OFF'>('PROMPT')
  const [intervalDays, setIntervalDays] = useState(7)
  const [backupDir, setBackupDir] = useState('')
  const [chosenDir, setChosenDir] = useState<string | null>(null)
  const [pickingDir, setPickingDir] = useState(false)
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [customTag, setCustomTag] = useState('')
  const [customTags, setCustomTags] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [loadError, setLoadError] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveStarted, setSaveStarted] = useState(false)
  const busyRef = useRef(false)
  const dialogRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const previousFocus = useRef(document.activeElement as HTMLElement | null)
  const existingSet = useMemo(() => new Set(existingTags.map(tag => tag.name.trim().toLocaleLowerCase('de'))), [existingTags])
  const suggestions = generalProfile ? COMMON_TAGS : [...VEREIN_TAGS, ...COMMON_TAGS]
  const tagNames = [...selectedTags, ...customTags].filter(name => !existingSet.has(name.toLocaleLowerCase('de')))

  useEffect(() => {
    let alive = true
    setLoading(true); setLoadError('')
    Promise.all([
      window.api.settings.get({ key: 'org.name' }), window.api.settings.get({ key: 'org.cashier' }),
      window.api.settings.get({ key: 'backup.auto' }), window.api.settings.get({ key: 'backup.intervalDays' }),
      window.api.backup.getDir(), window.api.organizations.active(),
    ]).then(([name, person, mode, interval, dir, active]) => {
      if (!alive) return
      if (!dir.ok) throw new Error(dir.error || 'Sicherungsordner konnte nicht geladen werden.')
      setOrgName(String(name.value || active.organization?.name || ''))
      setCashier(String(person.value || ''))
      setOrgId(active.organization?.id || null)
      setGeneralProfile(active.organization?.profile === 'GENERAL')
      setBackupMode(mode.value === 'OFF' || mode.value === 'SILENT' ? mode.value : 'PROMPT')
      const days = Number(interval.value ?? 7)
      setIntervalDays(Number.isInteger(days) && days > 0 ? days : 7)
      setBackupDir(dir.dir || '')
    }).catch(e => { if (alive) setLoadError(e?.message || String(e)) }).finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [loadAttempt])

  useEffect(() => {
    if (!loading) titleRef.current?.focus()
    if (bodyRef.current) bodyRef.current.scrollTop = 0
  }, [step, loading])
  useEffect(() => { const previous = previousFocus.current; return () => { if (previous?.isConnected) previous.focus() } }, [])

  useEffect(() => {
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || saving || pickingDir) return
      const dialogs = Array.from(document.querySelectorAll('[role="dialog"], [role="alertdialog"]'))
      if (dialogs.at(-1)?.contains(dialogRef.current)) { event.preventDefault(); onClose() }
    }
    window.addEventListener('keydown', onEscape)
    return () => window.removeEventListener('keydown', onEscape)
  }, [onClose, saving, pickingDir])

  async function chooseDirectory() {
    const trigger = document.activeElement as HTMLElement | null
    setPickingDir(true); setError('')
    try {
      const result = await window.api.backup.pickDir()
      if (result.canceled) return
      if (!result.ok || !result.dir) throw new Error(result.error || 'Ordner konnte nicht ausgewählt werden.')
      setChosenDir(result.dir)
    } catch (e: any) { setError(e?.message || String(e)) }
    finally { setPickingDir(false); requestAnimationFrame(() => { if (trigger?.isConnected) trigger.focus() }) }
  }

  async function finish() {
    if (busyRef.current || loading || loadError) return
    if (!orgName.trim()) { setStep(0); setError('Bitte gib einen Namen für die Organisation an.'); return }
    busyRef.current = true; setSaving(true); setSaveStarted(true); setError('')
    try {
      const active = await window.api.organizations.active()
      if (active.organization?.id !== orgId) throw new Error('Die Organisation wurde gewechselt. Bitte öffne das Setup erneut.')
      if (chosenDir) {
        const result = await window.api.backup.setDir({ dir: chosenDir })
        if (!result.ok) throw new Error(result.error || 'Sicherungsordner konnte nicht übernommen werden.')
        setBackupDir(result.dir || chosenDir); setChosenDir(null)
        if (result.warning) notify('info', result.warning, 10000)
      }
      for (const [key, value] of [['org.name', orgName.trim()], ['org.cashier', cashier.trim()], ['backup.auto', backupMode], ['backup.intervalDays', intervalDays]] as const) {
        const result = await window.api.settings.set({ key, value })
        if (!result.ok) throw new Error('Die Einstellungen konnten nicht gespeichert werden.')
      }
      if (tagNames.length) {
        // A previous completion attempt may already have created some tags.
        const currentTags = await window.api.tags.list()
        const known = new Set(currentTags.rows.map(tag => tag.name.trim().toLocaleLowerCase('de')))
        for (const name of tagNames) {
          if (known.has(name.toLocaleLowerCase('de'))) continue
          await window.api.tags.upsert({ name, color: suggestions.find(tag => tag.name === name)?.color })
          known.add(name.toLocaleLowerCase('de'))
        }
      }
      if (orgId) {
        const result = await window.api.organizations.setAppearance({ orgId, colorTheme: draftTheme, bookingView: draftView })
        if (!result.success) throw new Error('Die Ansicht konnte nicht gespeichert werden.')
      }
      const completed = await window.api.settings.set({ key: 'setup.completed', value: true })
      if (!completed.ok) throw new Error('Die Einrichtung konnte nicht abgeschlossen werden.')
      setBookingView(draftView); setColorTheme(draftTheme)
      dispatchDataChanged(['settings', 'organizations', 'tags'])
      notify('success', 'VereinO ist eingerichtet. Viel Freude beim Start!')
      onClose()
    } catch (e: any) { setError(e?.message || String(e)) }
    finally { busyRef.current = false; setSaving(false) }
  }

  function changeStep(next: number) {
    if (saving || loading || loadError) return
    if (!orgName.trim() && next > 0) { setError('Bitte gib einen Namen für die Organisation an.'); return }
    setError(''); setStep(next)
  }
  function addCustomTag() {
    const name = customTag.trim()
    if (name && !existingSet.has(name.toLocaleLowerCase('de')) && ![...selectedTags, ...customTags].some(tag => tag.toLocaleLowerCase('de') === name.toLocaleLowerCase('de'))) setCustomTags(tags => [...tags, name])
    setCustomTag('')
  }
  const selectedTheme = COLOR_THEME_OPTIONS.find(theme => theme.id === draftTheme)
  const previewMode = selectedTheme?.mode === 'auto' ? document.documentElement.dataset.theme || 'dark' : selectedTheme?.mode || 'dark'
  const currentStep = STEPS[step]
  const StepIcon = currentStep.icon
  return createPortal(<div className="modal-overlay setup-wizard-overlay" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} onKeyDown={event => {
    event.stopPropagation()
    if (event.key === 'Escape') { event.preventDefault(); if (!saving && !pickingDir) onClose() }
    if (event.key === 'Tab') {
      const controls = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), summary') || []).filter(el => el.getClientRects().length)
      const first = controls[0], last = controls[controls.length - 1]
      if (event.shiftKey && (document.activeElement === first || document.activeElement === titleRef.current)) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
  }}>
    <div ref={dialogRef} className="modal setup-wizard" aria-busy={saving || loading}>
      <ModalHeader title="Erste Schritte" subtitle="VereinO einrichten" icon={<img src={appLogo} width="27" height="27" alt="" />} />
      <nav className="setup-steps" aria-label="Einrichtungsschritte"><ol>{STEPS.map((item, index) => <li key={item.label}><button type="button" disabled={index > step || saving || loading || !!loadError} aria-current={step === index ? 'step' : undefined} onClick={() => changeStep(index)}><span className="setup-step-number">{index < step ? <IconCheck size={15} /> : index + 1}</span><span>{item.label}</span></button></li>)}</ol></nav>
      <div className="setup-wizard-body" ref={bodyRef}>
        <div className="setup-step-intro"><span className="setup-step-icon"><StepIcon size={23} aria-hidden="true" /></span><div><h2 id={`${id}-title`} ref={titleRef} tabIndex={-1}>{currentStep.title}</h2><p>{currentStep.description}</p></div></div>
        {loading ? <p role="status">Deine Einstellungen werden geladen …</p> : loadError ? <div role="alert" className="setup-error">{loadError}<button type="button" className="btn" onClick={() => setLoadAttempt(value => value + 1)}>Erneut laden</button></div> : <fieldset className="setup-step-content" disabled={saving || pickingDir}>
          {step === 0 && <>
            <div className="setup-welcome-note"><IconShieldCheck size={20} aria-hidden="true" /><span>Deine Buchhaltung bleibt auf deinem Rechner. Du kannst alle Einstellungen später anpassen.</span></div>
            <div className="dialog-form-grid">
              <div className="field"><label htmlFor={`${id}-name`}>Name der Organisation <span className="req-asterisk">*</span></label><input id={`${id}-name`} className="input" value={orgName} onChange={e => setOrgName(e.target.value)} placeholder="z. B. Förderverein Musterstadt" required /></div>
              <div className="field"><label htmlFor={`${id}-cashier`}>Verantwortliche Person <span className="setup-optional">Optional</span></label><input id={`${id}-cashier`} className="input" value={cashier} onChange={e => setCashier(e.target.value)} placeholder="Vor- und Nachname" /><span className="helper">Zum Beispiel Kassiererin, Kassier oder Nutzer.</span></div>
            </div>
            <p className="setup-note">Diese Angaben erscheinen in der App und in Exporten.</p>
          </>}
          {step === 1 && <>
                    <fieldset className="setup-booking-views">
                        <legend>Buchungsansicht wählen</legend>
                        {(['plus', 'classic'] as const).map(view => (
                            <label key={view} className={`setup-booking-choice${draftView === view ? ' is-selected' : ''}`}>
                                <span className="setup-booking-choice__heading"><input type="radio" name="setup-booking-view" value={view} checked={draftView === view} onChange={() => setDraftView(view)} /><strong>{view === 'plus' ? 'Buchungen Plus' : 'Buchungen klassisch'}</strong></span>
                                <span className="setup-booking-choice__description">{view === 'plus' ? 'Kalender, schnelle Filter und Buchungsdetails nebeneinander.' : 'Tabellenübersicht mit frei wählbaren Spalten und Zeilenlayout.'}</span>
                                <span className={`setup-booking-preview setup-theme-preview setup-booking-preview--${view}`} data-color-theme={draftTheme} data-theme={previewMode} aria-hidden="true">
                                    {view === 'plus' ? <>
                                        <span className="setup-booking-preview__sidebar"><b>September</b><span className="setup-booking-preview__calendar">{Array.from({ length: 21 }, (_, index) => <span key={index} className={index === 10 ? 'is-selected' : undefined}>{index + 1}</span>)}</span><b>Filter</b><span className="setup-booking-preview__tag">Spende</span></span>
                                        <span className="setup-booking-preview__list"><b>Buchungen</b><span className="setup-booking-preview__row is-selected"><span>11 Sep<strong>Mitgliedsbeitrag</strong><small>Ideell · Bank</small></span><b className="setup-preview-income">+50,00 €</b></span><span className="setup-booking-preview__row"><span>12 Sep<strong>Material</strong><small>Vereinsbedarf</small></span><b className="setup-preview-expense">−12,90 €</b></span></span>
                                        <span className="setup-booking-preview__details"><b>Details</b><span>Mitgliedsbeitrag</span><strong className="setup-preview-income">+50,00 €</strong><span>Bank</span><span className="setup-booking-preview__tag">Mitgliedschaft</span></span>
                                    </> : <span className="setup-booking-preview__table"><span><b>Datum</b><b>Beschreibung</b><b>Zahlweg</b><b>Betrag</b></span><span><span>11 Sep</span><span>Mitgliedsbeitrag</span><span>Bank</span><b className="setup-preview-income">+50,00 €</b></span><span><span>12 Sep</span><span>Material</span><span>Bank</span><b className="setup-preview-expense">−12,90 €</b></span><span><span>13 Sep</span><span>Spende</span><span>Bank</span><b className="setup-preview-income">+25,00 €</b></span></span>}
                                </span>
                            </label>
                        ))}
                    </fieldset>

            <details className="setup-optional-section"><summary>Farbschema anpassen <span>{COLOR_THEME_OPTIONS.find(theme => theme.id === draftTheme)?.name}</span></summary><div className="setup-theme-options">{COLOR_THEME_OPTIONS.map(theme => <button key={theme.id} type="button" className={`theme-chip${draftTheme === theme.id ? ' active' : ''}`} aria-pressed={draftTheme === theme.id} onClick={() => setDraftTheme(theme.id)}><span className="theme-swatch" data-theme={theme.id} aria-hidden="true" />{theme.name}</button>)}</div><p className="setup-note">Die Buchungsvorschauen zeigen dein gewähltes Farbschema. Die App übernimmt es erst beim Abschluss.</p></details>
            <p className="setup-note">Spalten, Darstellung und Buchungsabläufe passt du später unter Einstellungen an.</p>
          </>}
          {step === 2 && <>
            <div className="setup-backup-options" role="radiogroup" aria-label="Sicherungsmodus">{BACKUP_MODES.map(mode => <label key={mode.value} className={`setup-backup-choice${backupMode === mode.value ? ' is-selected' : ''}`}><input type="radio" name={`${id}-backup`} value={mode.value} checked={backupMode === mode.value} onChange={() => setBackupMode(mode.value)} /><span><strong>{mode.title}</strong><small>{mode.description}</small></span></label>)}</div>
            <div className="setup-backup-fields"><div className="field"><label htmlFor={`${id}-dir`}><IconFolder size={15} aria-hidden="true" /> Sicherungsordner</label><input id={`${id}-dir`} className="input" value={chosenDir || backupDir} readOnly title={chosenDir || backupDir} /><div className="setup-folder-actions"><button type="button" className="btn" onClick={() => void chooseDirectory()}>Ordner wählen…</button>{chosenDir && <button type="button" className="btn ghost" onClick={() => setChosenDir(null)}>Auswahl zurücksetzen</button>}</div><span className="helper">{chosenDir ? 'Wird erst beim Abschluss übernommen. Vorhandene Sicherungen werden dann kopiert.' : 'Dieser Ordner wird auch für manuell gestartete Sicherungen verwendet.'}</span></div>
              {backupMode !== 'OFF' && <div className="field"><label htmlFor={`${id}-interval`}>Intervall</label><select id={`${id}-interval`} className="input" value={intervalDays} onChange={e => setIntervalDays(Number(e.target.value))}>{Array.from(new Set([1, 3, 7, 14, 30, intervalDays])).sort((a, b) => a - b).map(days => <option key={days} value={days}>{days === 1 ? 'Täglich' : `Alle ${days} Tage`}</option>)}</select><span className="helper">Wird geprüft, während VereinO läuft.</span></div>}
            </div>
            <p className="setup-note"><IconInfoCircle size={16} aria-hidden="true" />Ein anderes Laufwerk oder ein synchronisierter Ordner schützt zusätzlich bei einem Geräteausfall.</p>
          </>}
          {step === 3 && <>
            <dl className="setup-review"><div><dt>Organisation</dt><dd>{orgName}</dd></div><div><dt>Buchungsansicht</dt><dd>{draftView === 'plus' ? 'Buchungen Plus' : 'Buchungen klassisch'}</dd></div><div><dt>Farbschema</dt><dd>{COLOR_THEME_OPTIONS.find(theme => theme.id === draftTheme)?.name}</dd></div><div><dt>Datensicherung</dt><dd>{BACKUP_MODES.find(mode => mode.value === backupMode)?.title}{backupMode !== 'OFF' && ` · ${intervalDays === 1 ? 'täglich' : `alle ${intervalDays} Tage`}`}</dd></div><div className="setup-review-wide"><dt>Sicherungsordner</dt><dd>{chosenDir || backupDir}</dd></div></dl>
            <details className="setup-optional-section"><summary><IconTags size={17} aria-hidden="true" />Starter-Tags hinzufügen <span>{tagNames.length ? `${tagNames.length} ausgewählt` : 'Optional'}</span></summary><p className="setup-note">Tags helfen dir, Buchungen später wiederzufinden. Wähle nur, was du brauchst.</p><div className="setup-tag-options">{suggestions.map(tag => <label key={tag.name}><input type="checkbox" disabled={existingSet.has(tag.name.toLocaleLowerCase('de'))} checked={existingSet.has(tag.name.toLocaleLowerCase('de')) || selectedTags.includes(tag.name)} onChange={e => setSelectedTags(names => e.target.checked ? [...names, tag.name] : names.filter(name => name !== tag.name))} /><span>{tag.name}{existingSet.has(tag.name.toLocaleLowerCase('de')) && ' (vorhanden)'}</span></label>)}</div><div className="setup-custom-tag"><label htmlFor={`${id}-tag`}>Eigener Tag</label><div><input id={`${id}-tag`} className="input" value={customTag} onChange={e => setCustomTag(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustomTag() } }} placeholder="z. B. Sommerfest" /><button type="button" className="btn" disabled={!customTag.trim()} onClick={addCustomTag}>Hinzufügen</button></div></div>{customTags.length > 0 && <div className="setup-tag-options">{customTags.map(name => <button type="button" key={name} className="btn" aria-label={`Tag ${name} entfernen`} onClick={() => setCustomTags(tags => tags.filter(tag => tag !== name))}>{name} ×</button>)}</div>}</details>
            <p className="setup-note">Weitere Optionen für Darstellung und Arbeitsweise findest du jederzeit in den Einstellungen.</p>
          </>}
        </fieldset>}
        {error && <div className="setup-error" role="alert">{error}{saveStarted && <p>Die Einrichtung ist noch nicht abgeschlossen. Bereits gespeicherte Angaben bleiben erhalten. Du kannst den Abschluss erneut versuchen.</p>}</div>}
      </div>
      <footer className="setup-wizard-footer"><button type="button" className="btn ghost" onClick={onClose} disabled={saving || pickingDir}>{saveStarted ? 'Schließen' : 'Später einrichten'}</button><div><span className="setup-step-count">Schritt {step + 1} von {STEPS.length}</span>{step > 0 && <button type="button" className="btn" onClick={() => changeStep(step - 1)} disabled={saving || pickingDir}><IconArrowLeft size={16} aria-hidden="true" />Zurück</button>}{step < STEPS.length - 1 ? <button type="button" className="btn primary" disabled={loading || !!loadError || pickingDir} onClick={() => changeStep(step + 1)}>Weiter<IconArrowRight size={16} aria-hidden="true" /></button> : <button type="button" className="btn primary" disabled={saving || pickingDir} onClick={() => void finish()}>{saving ? 'Wird eingerichtet …' : 'VereinO starten'}{!saving && <IconArrowRight size={16} aria-hidden="true" />}</button>}</div></footer>
    </div>
  </div>, document.body)
}
