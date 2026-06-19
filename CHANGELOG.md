# Changelog

Alle nennenswerten Änderungen an VereinO werden in dieser Datei dokumentiert.

Das Format basiert auf [Keep a Changelog](https://keepachangelog.com/de/1.1.0/)
und dieses Projekt folgt [Semantic Versioning](https://semver.org/lang/de/).

## [1.9.5] - 2026-06-19

### Hinzugefügt

- Buchungen: Option "Bearbeitungen als Reiter" ergänzt, damit mehrere geöffnete Buchungen im Hauptfenster parallel bearbeitet werden können.

### Geändert

- Einstellungen: Bereich "Navigation & Layout" klarer gruppiert und Toggle-Erklärungen direkt an den jeweiligen Optionen ergänzt.
- Buchungen: Offene Buchungsentwürfe und Bearbeitungen teilen sich eine gemeinsame Reiterleiste mit getrennten Kennzeichnungen.

### Behoben

- Buchungen: Bearbeitungsreiter bleiben beim Schließen des Bearbeitungsmodals erhalten und fokussieren abgedockte Buchungen wieder korrekt.

## [1.9.4] - 2026-06-19

### Hinzugefügt

- Buchungen: Storno-Funktion für Korrekturbuchungen ergänzt, inklusive Statusanzeige für Storno- und stornierte Buchungen.
- Exporte und Berichte: Storno-Status in Journal-, Jahresabschluss-, Kassier- und Fiskalberichten sichtbar gemacht.

### Geändert

- Buchungen: Neuinstallationen verwenden standardmäßig Storno statt endgültigem Löschen.
- Buchungen: Updates behalten die Ausnahmeregel "Buchungen endgültig löschen" automatisch aktiv, solange die Einstellung vorher noch nicht gesetzt war.
- Einstellungen: Hinweistext zum Löschmodus präzisiert, damit Neuinstallation und Update-Verhalten klar unterscheidbar sind.

### Behoben

- Buchungen: Storno-Buchungen werden vor erneutem Storno, Bearbeitung und endgültigem Löschen geschützt.
- Buchungen: Referenzen zwischen Originalbuchung und Storno bleiben in Tabellen, Modalen und Exporten nachvollziehbar.

## [1.9.2] – 2026-06-17

### Hinzugefügt

- Einreichungen: Export einer Webformular-Katalogdatei mit Organisation, Budgets, Zweckbindungen und Tags.
- Submission Web: Import der Katalogdatei und Auswahl von Budget, Zweckbindung und Tags pro Einreichung.

### Geändert

- Einreichungen: Import und Review übernehmen vorgeschlagene Kategorien aus dem Webformular als Vorauswahl.
- Submission Web: JSON-Export auf Version `1.1` erweitert und Dokumentation für HTTP/HTTPS-Testbetrieb ergänzt.

## [1.9.1] – 2026-06-17

### Hinzugefügt

- Buchungen: Buchungsreiter (Booking Draft Tabs) hinzugefügt, damit mehrere Buchungsentwürfe parallel geöffnet und wieder aufgenommen werden können.
- Tastatur-Shortcuts: `Alt`-Overlay auf Verbindlichkeiten- und Mitglieder-Modale erweitert.
- Tastatur-Shortcuts: `Alt+Q` für „+ Neu“ in Verbindlichkeiten und Mitglieder ergänzt.

### Geändert

- Buchungen: Shortcut-Badges für Suche, Zeitraum, Filter, Spalten und Batch-Zuordnung werden beim ersten Laden der Buchungsansicht zuverlässig registriert.

### Behoben

- Verbindlichkeiten: Renderer-Crash beim Wechsel in den Verbindlichkeiten-Reiter behoben.
- Buchungen: Tag-Hover zeigt lokale Fallback-Werte und bleibt im Dev-Build nicht mehr dauerhaft auf „Lädt…“ hängen.
- Tastatur-Shortcuts: Stabilere Registrierung der Buchungs-Toolbar-Shortcuts nach Seitenwechseln und Filteränderungen.

## [1.8.4] – 2026-03-01

### Hinzugefügt

- Kassierbericht: Option „Auswertung nach Tags“ als eigenständige, konsolidierte Sektion (Summen für Einnahmen/Ausgaben/Saldo je Tag)
- Kassierbericht: Optionale Tags-Spalte in der Einzelbuchungsliste (Anhang)
- Buchungsmodal: IN/OUT-Buttons mit visuellen +/− Kennzeichnungen
- Buchungsmodal: Nutzungsbasierte Standardwerte (Art, Zahlweg, Brutto/Netto) anhand Benutzergewohnheiten

### Geändert

- Dashboard: Budgets, Zweckbindungen und Sphärenanteile reagieren nun auf den gewählten Zeitraumfilter (Monat/Jahr/3 Jahre/Gesamt)
- Dashboard: Zeitraumfilter visuell vom Zitatbereich abgesetzt (eigener Rahmen + Icon)
- Report-Export: Jahresauswahl verwendet nur tatsächlich verfügbare Buchungsjahre (inkl. aktuelles Jahr)

## [1.8.3] – 2026-02-28

### Hinzugefügt

- Report: Neuer Tab „Kassierbericht (Mitglieder)“ im Export-Dialog – erzeugt ein übersichtliches PDF für die Mitgliederversammlung mit Kassenstand (Bar/Bank), Einnahmen/Ausgaben, letzter Kassenprüfung, Sphären-Übersicht, Mitglieder-Statistik, offenen Verbindlichkeiten, Zweckbindungen und Budgets
- Kassierbericht: Sektionen ohne Daten werden automatisch ausgeblendet für ein cleaneres PDF
- Kassierbericht: Einzelbuchungs-Auflistung optional als Anhang mit eigenem Zeitraum und Sortierung

### Behoben

- Kassierbericht: Seitenumbrüche verhindern Schnitte mitten in Tabellen, KPI-Karten und Sektionen

## [1.8.2] – 2026-02-27

### Geändert

- Kassenprüfung: Soll-Bestand wird bis Stichtag über den gesamten Buchungszeitraum berechnet (nicht nur seit Jahresbeginn)
- Journal: Überschuss-Tooltip zeigt zusätzlich Bar- und Bank-Aufschlüsselung

### Behoben

- Kassenprüfung: Historie-Erfassung nach Ausgleichsbuchung wiederhergestellt (IPC-/Preload-Verdrahtung für `cashChecks`)
- Journal: Bar-/Bank-Werte im Überschuss-Tooltip berücksichtigen nun Transfers (BAR↔BANK) korrekt

## [1.8.1] – 2026-02-26

### Geändert

- UI: Layout-Anpassungen und Zahlungs-Badge-Updates übernommen

### Behoben

- Journal: Brutto/Netto-Betragsmodus wird beim Bearbeiten korrekt gespeichert

## [1.8.0] – 2026-02-24

### Behoben

- Organisationslöschung stabilisiert, Übertragungsberichte und Filter-Dropdown-UX verbessert
- Journal: Transfers werden bei Zahlweg-Filter korrekt berücksichtigt

## [1.7.5] – 2026-02-23

### Behoben

- Datenbank: Fehlende cash_checks- und member_advances-Schemata repariert

## [1.7.2] – 2026-02-19

### Geändert

- Spenden: Unterschreiber ist nun editierbar, mehr Platz für Unterschrift

## [1.7.0] – 2026-02-18

### Behoben

- Budget-Filter-Label und Legacy-Budget-Schema-Migration repariert

## [1.6.6] – 2026-02-17

### Hinzugefügt

- Spenden: Quittungs-Flow, verbessertes Modal-UX und Integration des Org-Logos

## [1.6.5] – 2026-02-14

### Geändert

- Diverse Workspace-Anpassungen übernommen

### Behoben

- UI-Änderungen im Mitglieder-Modal

## Ältere Versionen

Frühere Änderungen sind im Git-Verlauf dokumentiert.
