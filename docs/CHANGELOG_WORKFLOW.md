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

Verbindlicher Ablauf für Windows-Releases:

1. Version in `package.json` erhöhen und Changelog vorbereiten.
2. Commit, Tag und Push wie gewohnt erstellen.
3. Release-Artefakte bauen: `npm run release:artifacts`
4. Artefakte in den GitHub-Release hochladen: `npm run release:publish`
5. Im GitHub-Release prüfen, dass mindestens diese Assets vorhanden sind:
   - `latest.yml`
   - `VereinO-Setup-x.y.z-x64.exe`
   - `VereinO-Setup-x.y.z-x64.exe.blockmap`

Wichtig:
- `gh release create` ohne anschließenden Asset-Upload ist für Auto-Updates unvollständig.
- `latest.yml` muss zur selben Version gehören wie der Installer im Release.
- Falls ein Release bereits existiert, aktualisiert `npm run release:publish` die Assets mit `--clobber`.

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
