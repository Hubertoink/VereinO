# VereinO Web / Mehrbenutzerbetrieb

Stand: 16.09.2026. Entwicklungsbranch: `feature/web-multiuser`.

Dieser Plan ersetzt für die aktuelle Umsetzung die Statusangaben im älteren
`DOCKER_MIGRATION_PLAN.md`. Die Desktop-Version bleibt unabhängig nutzbar. Der erste
Pilot verwendet eigene Tabellen und stellt noch keine vollständige Portierung dar.

## Vereinbarte Rollen

- **Admin:** Benutzer verwalten, Buchungen erstellen und ändern, Entwürfe prüfen.
- **Editor:** Buchungen erstellen, noch nicht übernommene Entwürfe ergänzen/bearbeiten sowie eingereichte Entwürfe validieren und als
  Buchung übernehmen oder mit Begründung zurückgeben. Keine Änderung bereits
  gebuchter Einträge und keine Benutzerverwaltung.
- **User:** Eigene Entwürfe erstellen, bearbeiten und einreichen; deren Status
  verfolgen. Kein Zugriff auf andere Entwürfe oder das allgemeine Buchungsjournal.

## Meilensteine

### M1: Ausführbarer Web-Pilot

- [x] Eigener Branch und eigener Browser-Einstieg.
- [x] Docker Compose mit Web-Proxy, API und PostgreSQL; keine veröffentlichten DB-Ports.
- [x] Einmaliges Admin-Setup, Anmeldung, Logout und widerrufbare Sessions.
- [x] Benutzerverwaltung, Rollen, Sperren und Passwortänderung/-zurücksetzen.
- [x] Rollen und Eigentümer serverseitig durchsetzen.
- [x] Entwurf -> Eingereicht -> Freigegeben oder Zurückgegeben.
- [x] Admin und Editor können validieren und verbindliche Pilotbuchungen erstellen.
- [x] Versionsprüfung, transaktionale Freigabe und eindeutige Belegnummern.
- [x] Automatisierte Prüfungen an echter PostgreSQL-Datenbank.
- [x] Docker-Container lokal gestartet; PostgreSQL 16, API und Weboberfläche geprüft. Anmeldung, Rollenrechte und Logout für alle drei Rollen im Browser erfolgreich (15.09.2026).

### M2: Fachliche Angleichung und Belege

Bereits umgesetzt (15.09.2026): Der Web-Einstieg verwendet die bestehenden
`TopNav`/`SideNav`, die Original-Styles und das VereinO-Logo. `BookingsPlusView`,
`VoucherInfoModal` und `CompactBookingFlyout` werden direkt aus dem Renderer importiert,
auch für die Entwurfserfassung. Rollen und noch nicht unterstützte Aktionen werden
über optionale Fähigkeiten der Komponenten gesteuert; Desktop-Vorgaben bleiben erhalten.
Der Browseradapter bildet die Pilotbuchungen auf die bestehenden Leseschnittstellen ab.
Filter, Sortierung, Pagination und Summen werden aktuell aus den Serverbuchungen im
Browser berechnet; serverseitige Skalierung und vollständige API-Abdeckung folgen.


- [ ] Heutiges Desktop-Buchungsmodell und API-Funktionen vollständig inventarisieren.
- [ ] Gemeinsame Schemas/Fachregeln extrahieren und in Desktop und Web verwenden.
- [ ] Steuern, Buchungskonten, Umbuchungen, Storno, Sperren und Jahreswechsel portieren.
- [x] Anhänge hochladen/herunterladen mit Eigentümer- und Rollenprüfung (PDF/PNG/JPEG/WebP bis 10 MB, Originalbytes in PostgreSQL).
- [x] Dateiinhalte/Größe validieren; Datenbankbackup enthält die Belegdateien.
- [x] Budget-/Zweckbindungszuordnungen mit transaktionaler Speicherung, Versionsprüfung und tatsächlicher Auslastung anbinden.
- [ ] Buchungen-Plus-Komponenten über einen vollständigen Browseradapter anbinden.
- [ ] Suchfilter, Pagination und nachvollziehbare Änderungsansicht ergänzen.

### M3: Datenübernahme und Pilotverein

- [ ] Einmaligen SQLite-Import mit Belegen entwickeln.
- [ ] Mengen, Salden, Referenzen und Dateiprüfsummen vor/nach Import vergleichen.
- [ ] Sicherstellen, dass Entwürfe keine Salden verändern und Freigaben exakt einmal wirken.
- [ ] Mit mindestens zwei PCs und allen drei Rollen testen.
- [ ] Backup/Wiederherstellung praktisch und mit dokumentiertem Ergebnis erproben.

### M4: Produktiver Betrieb und weiterer Ausbau

- [ ] Zielserver, Domain und HTTPS-Reverse-Proxy konfigurieren und testen.
- [ ] Unterstützte Runtime-/Frameworkversionen und Abhängigkeiten vor Freigabe prüfen.
- [ ] Tests für Updates, Migrationen, Rollenwechsel während offener Sitzungen erweitern.
- [ ] Monitoring, automatische Backups und Wiederanlauf dokumentieren.
- [x] Mitglieder-Stammdaten, Budgets/Zweckbindungen mit Buchungszuordnungen sowie finanzielle Dashboard-/Reportansichten im Originaldesign anbinden.
- [x] Dauerbuchungsvorlagen mit expliziter, gegen Doppelverarbeitung geschützter Ausführung portieren.
- [x] Erste Original-Einstellungen einbetten: persönliche Darstellung/Navigation sowie gemeinsamer Vereinsname.
- [x] Benutzer- und Kontoeinstellungen im gemeinsamen Einstellungsdesign einbetten.
- [x] Konten, Kategorien, Geschäftspartner und Tags als gemeinsame Stammdaten mit Admin-Verwaltung, Editor-Lesezugriff, Archivierung und Versionsprüfung einbetten.
- [x] Organisationsstammdaten über den bisherigen Anzeigenamen hinaus speichern.
- [ ] Die neuen Stammdaten durchgängig mit Buchungserfassung, Bankkonten und Auswertungen verknüpfen; freie Kategorien ersetzen die festen Vereinssphären noch nicht.
- [x] CSV-Bankimport mit Vorschau, Duplikatanzeige und transaktionaler Buchungsübernahme anbinden.
- [x] Gefilterten CSV-Berichtsexport im Original-Exportmenü anbieten.
- [x] Arbeitsweise und Tabellenansicht als persönliche Web-Einstellungen speichern.
- [x] Speicher, Import, Updates, Einführung und Über-Web-Pilot im Einstellungsdesign anzeigen; Desktop-only-Funktionen werden mit ihrem Web-Status ausgewiesen.
- [x] Arbeitsweise und Tabelleneinstellungen mit der klassischen Buchungsliste verbinden; die erweiterten Plus-Journaloptionen folgen mit dem vollständigen Buchungsmodell.
- [ ] Weitere fachliche Einstellungen, Beitragsabrechnung, PDF/XLSX-Berichtsexporte, Rechnungen/OCR, CAMT/Bankabgleich und KI portieren.

Bidirektionale Offline-Synchronisation ist ein separates Folgeprojekt. Bis dahin ist
im Webbetrieb der Server die einzige Datenquelle. Die erste Ausbaustufe unterstützt
bewusst eine Vereinsinstallation; es gibt keine öffentliche Vereinsregistrierung.

## Abnahme des ersten Ablaufs

1. Frische Datenbank starten und ersten Admin einrichten.
2. Admin legt Editor und User an.
3. User erstellt und reicht einen Entwurf ein.
4. Admin/Editor kann Entwürfe ergänzen, zurückgeben oder validieren; Freigabe erzeugt eine Buchung.
5. User sieht den Status, darf aber weder buchen noch fremde Daten abrufen.
6. Doppeltes Validieren erzeugt keine zweite Buchung.
7. Bestehende Buchung kann nur Admin ändern; veraltete Version ergibt Konflikt.

Installation: [deploy/web/README.md](../deploy/web/README.md).
