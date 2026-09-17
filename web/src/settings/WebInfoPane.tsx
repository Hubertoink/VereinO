import React from 'react'
import type { TileKey } from '../../../src/renderer/views/Settings/types'
import type { User } from '../api'
import { AI_PATTERNS_CHANGED_EVENT, isBookingAIPatternsEnabled, setBookingAIPatternsEnabled } from '../../../src/renderer/utils/bookingAiPatterns'

const content: Record<string, { title: string; text: string; details: string[]; available: boolean }> = {
  storage: { title: 'Speicher & Backup', text: 'Der Web-Pilot speichert Buchungen, Stammdaten und Belege zentral in PostgreSQL.', details: ['Belege sind Bestandteil des Datenbank-Backups.', 'Backups und Wiederherstellungen werden vom Server-Administrator über Docker ausgeführt.', 'Lokale Desktop-Pfade und automatische Zeitpläne gehören nicht zum Browserbetrieb.'], available: true },
  docling: { title: 'Docling', text: 'Dokumentanalyse ist im Web-Pilot noch nicht aktiviert.', details: ['Rechnungsdateien können bereits als Beleg gespeichert werden.', 'OCR und automatische Felderkennung folgen mit dem Rechnungsmodul.', 'Bis dahin werden Dateien unverändert gespeichert und geprüft.'], available: false },
  import: { title: 'Datenimport', text: 'Der CSV-Bankimport ist verfügbar. Ein vollständiger SQLite-Import der Desktop-Daten ist noch nicht freigegeben.', details: ['CSV-Bankdateien werden unter „Bankimport“ geprüft und dedupliziert.', 'Der Import bestehender Desktop-Buchungen benötigt einen separaten Abgleich von Salden und Belegen.', 'Die Desktop-Datenbank bleibt unverändert.'], available: true },
  updates: { title: 'Updates', text: 'Updates des Web-Piloten werden als neues Docker-Image eingespielt.', details: ['Vor jedem Update ein PostgreSQL-Backup erstellen.', 'Migrationen laufen beim Backend-Start einmalig und transaktional.', 'Nach dem Update den Gesundheitsstatus und die Rollenrechte prüfen.'], available: true },
  aiPatterns: { title: 'KI-Muster', text: 'Lokale Buchungsvorschläge sind im Web-Pilot verfügbar.', details: ['Die eingebauten Regeln erkennen unter anderem Spenden, Mitgliedsbeiträge, Hosting.', 'Übernommene Buchungen lernen wiederkehrende Beschreibungen lokal im Browser, getrennt nach Benutzer und Organisation.', 'Vorschläge ändern keine Buchung automatisch; die Übernahme erfolgt immer per Klick.'], available: true },
  cashCheck: { title: 'Kassenprüfung', text: 'Kassenprüfungen sind im Web-Pilot noch nicht verfügbar.', details: ['Die Funktion benötigt Kassenstände, Prüfperioden und ein nachvollziehbares Prüfprotokoll.', 'Es werden keine vorläufigen Prüfergebnisse angezeigt.'], available: false },
  yearEnd: { title: 'Jahresabschluss', text: 'Der Jahresabschluss ist im Web-Pilot noch nicht verfügbar.', details: ['Jahreswechsel, Sperrung und Abschlussbuchungen folgen mit dem vollständigen Buchungsmodell.', 'Entwürfe verändern weiterhin keine Salden.'], available: false },
  donations: { title: 'Spenden', text: 'Spendenbescheinigungen und Beitragsabrechnung sind im Web-Pilot noch nicht verfügbar.', details: ['Mitglieder-Stammdaten sind bereits vorhanden.', 'Beitragseinzug, Zahlungshistorie und Bescheinigungen folgen separat.'], available: false },
  tutorial: { title: 'Einführung', text: 'Der Web-Pilot arbeitet mit drei Rollen und einem gemeinsamen Vereinsstand.', details: ['User erstellen eigene Entwürfe.', 'Editoren prüfen und übernehmen Entwürfe als Buchungen.', 'Admins verwalten Benutzer, Stammdaten und gebuchte Einträge.'], available: true },
  about: { title: 'Über VereinO', text: 'VereinO Web-Pilot', details: ['Zentrale Browseranwendung für mehrere PCs.', 'Server: PostgreSQL 16 · Betrieb: Docker Compose.', 'Die Desktop-Version und ihre SQLite-Daten bleiben unabhängig.'], available: true }
}

export default function WebInfoPane({ tile, user }: { tile: TileKey; user: User }) {
  const item = content[tile] || { title: 'Einstellungen', text: 'Dieser Bereich ist im Web-Pilot noch nicht verfügbar.', details: [], available: false }
  const [aiEnabled, setAiEnabled] = React.useState(() => isBookingAIPatternsEnabled())
  React.useEffect(() => {
    if (tile !== 'aiPatterns') return
    const refresh = () => setAiEnabled(isBookingAIPatternsEnabled())
    window.addEventListener(AI_PATTERNS_CHANGED_EVENT, refresh)
    return () => window.removeEventListener(AI_PATTERNS_CHANGED_EVENT, refresh)
  }, [tile])
  return <div className="settings-pane"><div className="card settings-card settings-pane-card">
    <div className="settings-title"><strong>{item.title}</strong>{item.available ? <span className="chip">Web-Pilot</span> : <span className="chip">In Vorbereitung</span>}</div>
    <p className="settings-sub">{item.text}</p>
    <ul className="settings-info-list">{item.details.map(detail => <li key={detail}>{detail}</li>)}</ul>
    {tile === 'aiPatterns' && <label className="settings-toggle-card"><span className="settings-toggle-card__copy"><strong>KI-Muster verwenden</strong><span>Zeigt passende Vorschläge direkt in der Buchungserfassung.</span></span><input className="toggle" role="switch" type="checkbox" checked={aiEnabled} onChange={event => setBookingAIPatternsEnabled(event.target.checked)} /></label>}
    {user.role === 'USER' && <p className="helper">Diese Hinweise gelten für den zentralen Vereinsbetrieb.</p>}
  </div></div>
}
