# VereinO

[![Lizenz: MIT](https://img.shields.io/badge/Lizenz-MIT-22a06b.svg)](LICENSE)

Open-Source-Desktop-App für moderne Vereinsbuchhaltung – lokal, offline-first und unter der MIT-Lizenz.

VereinO richtet sich an gemeinnützige Vereine, die Buchungen, Belege, Mitglieder, Budgets, Zweckbindungen, Rechnungen und Berichte lokal verwalten möchten. Die Buchhaltung bleibt auf dem eigenen Gerät.

## Download

Die einfachste Installation läuft über die GitHub-Releases:

[VereinO Releases](https://github.com/Hubertoink/VereinO/releases)

Installationspakete:

| System | Datei | Hinweis |
| --- | --- | --- |
| Windows | `VereinO-Setup-<version>-x64.exe` | Geführter VereinO-Setup-Assistent mit MIT-Lizenzanzeige und Auto-Update-Metadaten |
| Linux | `VereinO-<version>-x86_64.AppImage` | Direkt ausführbare AppImage-Datei |
| macOS | `VereinO-<version>-x64.dmg` / `.zip` | Wird vom GitHub-Release-Workflow gebaut; aktuell unsigniert |

Der gebrandete Windows-Assistent ist für das nächste Release vorbereitet. Bereits veröffentlichte Installer behalten ihr bisheriges Design.

macOS-Hinweis: Ohne Apple Developer ID ist die App nicht signiert/notarisiert. Beim ersten Start kann macOS deshalb eine Gatekeeper-Warnung zeigen; in dem Fall die App per Rechtsklick -> Öffnen starten.

## Highlights

- Lokale SQLite-Datenbank mit Backup, Restore, Speicherortwechsel und Sicherheitskopien
- Buchungsjournal für Einnahmen, Ausgaben, Umbuchungen, Barzahlungen und Bankkonten
- Kompakte Buchungserfassung mit Flyout, Tabs, Anhängen, Tags, Budgets und Zweckbindungen
- Dauerbuchungen mit Wochen-, Monats-, Quartals- und Jahresrhythmus inklusive Fälligkeitsabgleich
- Bankimport mit CAMT.053-Auswertung, Zuordnungsvorschlägen und Abgleich gegen bestehende Buchungen
- Mitgliederverwaltung mit Beitrags- und Spendenzuordnung
- Rechnungs- und Belegerfassung mit PDF-Anhängen, Batch-Upload, Duplikatprüfung und optionaler KI-Auslesung
- Geschäftspartnerkartei für Lieferanten und Kunden mit Verwendung in Buchungen und Rechnungen
- Budgets, Zweckbindungen und Auswertungen nach gemeinnützigkeitsrelevanten Sphären
- Dashboard und Reports mit Monatsverlauf, Einnahmen/Ausgaben, Sphärenauswertung und Tätigkeitsbericht
- Spendenbescheinigungen, Kassenprüfung, Jahresabschluss- und Exportfunktionen
- Optionaler KI-Agent für prüfbare Vorschläge, Rechnungsanalyse und lokale Buchhaltungsunterstützung

## Erste Schritte

1. Release-Datei für dein Betriebssystem herunterladen.
2. App installieren oder starten.
3. Beim ersten Start den Setup-Assistenten ausfüllen.
4. Vereinsdaten, Konten und Geschäftsjahr prüfen.
5. Erste Buchungen erfassen oder vorhandene Daten importieren.

Backups und Datenumzug findest du in der App unter Einstellungen -> Daten.

Ein Vorschlag für einen verschlüsselten geräteübergreifenden Abgleich liegt im
[Sync-Konzept](docs/Sync-Konzept.md). Synchronisierung ist noch nicht implementiert.

## Entwicklung

Der Entwicklerweg ist nur nötig, wenn du am Code arbeiten oder eigene Builds erzeugen möchtest.

Voraussetzungen:

- Node.js 20 oder höher
- npm
- Git

```bash
git clone https://github.com/Hubertoink/VereinO.git
cd VereinO
npm ci
npm run dev
```

Native Electron-Module lassen sich bei Bedarf neu bauen:

```bash
npm run rebuild:native
```

Lokale Paketierung:

```bash
npm run release:artifacts
```

Release-Artefakte werden im Ordner `release/` abgelegt. Für offizielle Windows-, Linux- und macOS-Releases ist der GitHub-Workflow `.github/workflows/release.yml` maßgeblich, weil jedes System auf dem passenden Runner gebaut wird.

## Release-Prozess

1. Version in `package.json` und `electron-builder.yml` aktualisieren.
2. `CHANGELOG.md` für die neue Version pflegen.
3. Änderungen committen.
4. Tag erstellen und pushen:

```bash
git tag vX.Y.Z
git push origin main
git push origin vX.Y.Z
```

Der GitHub-Workflow erstellt anschließend die Release-Artefakte für Windows, Linux und macOS und hängt sie an das GitHub-Release. Für ein bereits vorhandenes Release kann der Workflow manuell mit demselben Tag erneut gestartet werden.

## Tech Stack

- Electron, React, TypeScript und Vite
- SQLite mit `better-sqlite3`
- Electron Builder und Electron Updater
- Jest, Playwright, ESLint und Prettier

## Lizenz

VereinO ist Open Source und steht unter der [MIT-Lizenz](LICENSE). Du darfst den Code nutzen, verändern und weitergeben, auch kommerziell, unter den Bedingungen dieser Lizenz.

Neu gebaute Windows-Installer zeigen die Lizenz an. Eine Kopie liegt außerdem als `LICENSE.txt` im installierten Anwendungsverzeichnis. Eingebundene Bibliotheken und andere Drittanbieterbestandteile behalten ihre jeweiligen Lizenzen.

## Support

- Issues: [https://github.com/Hubertoink/VereinO/issues](https://github.com/Hubertoink/VereinO/issues)
