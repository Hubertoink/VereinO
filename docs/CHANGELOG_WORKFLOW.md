# Changelog Workflow

Dieses Dokument beschreibt, wie der Changelog in VereinO gepflegt wird.

## Datei

Der Changelog wird in `/CHANGELOG.md` im Projekt-Root geführt.

## Format

Jeder Release-Eintrag folgt dem [Keep a Changelog](https://keepachangelog.com/de/1.1.0/)-Format:

```markdown
## [<version>] – <YYYY-MM-DD>

### Hinzugefügt
- Neue Features

### Geändert
- Änderungen an bestehenden Features

### Behoben
- Bugfixes

### Entfernt
- Entfernte Features
```

## Anzeige in der App

Der Changelog wird zur **Build-Zeit** als JSON eingebettet:
- Die Datei `CHANGELOG.md` wird vom Vite-Build gelesen und als statischer Import bereitgestellt.
- Die Komponente `ChangelogModal` in `src/renderer/components/modals/ChangelogModal.tsx` parsed das Markdown und zeigt es im Modal an.
- Das Modal öffnet sich per Klick auf **„VereinO"** im DevBadge (Version-Toast, rechts unten in den Einstellungen).

## Wann aktualisieren?

1. **Vor jedem Release-Tag**: Neuen `## [x.y.z] – YYYY-MM-DD`-Block ganz oben einfügen.
2. **Während der Entwicklung**: Änderungen sofort unter einem `## [Unreleased]`-Abschnitt notieren.
3. **Beim Taggen**: `[Unreleased]` → `[x.y.z] – Datum` umbenennen.

## Release- und Update-Dateien

Für den In-App-Updater reicht ein GitHub-Tag oder ein Release mit Notes allein nicht aus. `electron-updater` lädt bei GitHub-Releases zwingend die Datei `latest.yml` sowie den passenden Installer und dessen `.blockmap` aus den Release-Assets.

Wenn diese Dateien im Release fehlen, schlägt die Update-Prüfung in der installierten App mit `404 latest.yml` fehl.

Verbindlicher Ablauf für Windows-, Linux- und macOS-Releases:

1. Version in `package.json` erhöhen und Changelog vorbereiten.
2. Commit und Tag wie gewohnt erstellen.
3. Git-Tag pushen: `git push origin vX.Y.Z`
4. Der Release-Workflow baut und veröffentlicht die Artefakte automatisch.
5. Im GitHub-Release prüfen, dass mindestens diese Assets vorhanden sind:
   - `latest.yml`
   - `VereinO-Setup-x.y.z-x64.exe`
   - `VereinO-Setup-x.y.z-x64.exe.blockmap`
   - `latest-linux.yml`
   - `VereinO-x.y.z-x86_64.AppImage`
   - `latest-mac.yml`
   - `VereinO-x.y.z-x64.dmg`
   - `VereinO-x.y.z-x64.zip`

Wichtig:
- `gh release create` ohne anschließenden Asset-Upload ist für Auto-Updates unvollständig.
- `latest.yml` muss zur selben Version gehören wie der Installer im Release.
- Falls ein Release bereits existiert, aktualisiert `npm run release:publish` die Assets mit `--clobber`.
- `npm run release:publish` ist weiterhin nur der manuelle Windows-Pfad; für Windows, Linux und macOS den GitHub-Release-Workflow verwenden.
- macOS-Artefakte werden auf einem macOS-Runner gebaut. Ohne Apple Developer ID sind sie nicht signiert/notarisiert; Nutzer müssen die App beim ersten Start ggf. über Rechtsklick -> Öffnen bestätigen.

## Kategorien

| Kategorie     | Verwendung                                  |
|---------------|---------------------------------------------|
| Hinzugefügt   | Komplett neue Features oder Funktionen       |
| Geändert      | Änderungen an bestehendem Verhalten          |
| Behoben       | Bugfixes                                     |
| Entfernt      | Entfernte Features oder deprecations         |
| Sicherheit    | Sicherheitsrelevante Änderungen              |

## Tipps

- Einträge aus Nutzersicht formulieren, nicht aus Entwicklersicht.
- Kurz und prägnant halten, Deutsch bevorzugt.
- Version-Nummern nach [SemVer](https://semver.org/lang/de/) vergeben.
- Bei größeren Releases ggf. eine Zusammenfassung am Anfang einfügen.
