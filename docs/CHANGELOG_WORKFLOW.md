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
