# Changelog

Alle nennenswerten Änderungen an VereinO werden in dieser Datei dokumentiert.

Das Format basiert auf [Keep a Changelog](https://keepachangelog.com/de/1.1.0/)
und dieses Projekt folgt [Semantic Versioning](https://semver.org/lang/de/).

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
