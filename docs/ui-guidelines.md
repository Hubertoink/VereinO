# UI-Richtlinie für VereinO

Ein ruhiges, professionelles Interface mit klaren Hierarchien, verlässlicher Lesbarkeit und pragmatischer Dichte. Fokus: schnelle Erfassung und übersichtliche Reports ohne dekorative Verschachtelung.

## Designleitlinien

- Minimalismus: Reduzierte Chromes, klare Geometrie, wenig Linien; Trennung durch Raum, Gewicht, Farbe.

- Typografie: Inter/Plus Jakarta/Segoe UI; Größen-Hierarchie H1 22–24, H2 18, Body 14–16, Mono für Zahlenoption.

- Farbe: Neutrale Flächen mit zartem Akzent; bevorzugt Dark Mode, Light Mode optional.

- Flächen & Tiefe: Normale Inhaltsflächen verwenden Hintergrund und Border ohne Schatten. Schatten und Blur sind auf Modals, Popovers und schwebende Menüs beschränkt.

- Motion: Kurze Ease-Out 150–200 ms, Mikro-Interaktionen; keine Dauer-Animationen.

- Barrierefreiheit: Kontrast ≥ 4.5:1 für Text; Fokus-Ringe klar sichtbar; Tastatur first.

## Farb- und Token-Set (Zen-inspiriert)

### Neutrals:

- bg: #0F1115 (dark), #F6F7F9 (light)

- surface: #151821 / #FFFFFF

- muted: #1C2028 / #EEF1F4

- border: #2B3240 / #DDE2EA

- text-primary: #E7EAF0 / #1B2430

- text-secondary: #AAB3C2 / #5D697A

### Accent:

- accent: #6AA6FF (blau), Hover: #8BB9FF, Pressed: #4F8DF0

- success: #4CC38A, warning: #F5C451, danger: #F06A6A

### Effects:

- shadow-1: 0 4px 16px rgba(0,0,0,0.25)

- backdrop-blur: 8–12px (Overlays, Quick-Add)

## Informationsarchitektur und Screens

### Hauptlayout

- Topbar: App-Name, Suchfeld (global), Quick-Add „+ Buchung“, Sync/Export, Profil.

- Sidebar: Dashboard, Buchungen, Zweckbindungen, Budgets, Reports, Belege, Einstellungen.

- Content: Breadcrumb, Titel, Aktionsleiste (Filtern/Export), Hauptbereich.

### Dashboard

- KPI-Karten:
  - Kassenstand gesamt (inkl. Sphären-Filter)

  - Einnahmen/Ausgaben Monat

  - Offene Zweckmittel

  - Belege ohne Zuordnung

- Charts: Stacked-Bars Einnahmen/Ausgaben nach Sphäre; Linie Budget vs. Ist.

- Aktivitätsfeed: Zuletzt erfasste Buchungen, Abschlüsse, Ex-/Importe.

### Buchungen (Journal)

- Toolbar: Zeitraum, Sphäre, Typ (IN/OUT/TRANSFER), Kategorie, Suchfeld, Export XLSX/PDF.

- Tabelle:
  - Spalten: Datum, Belegnr., Art, Sphäre, Kategorie, Zweckbindung, Netto, USt, Brutto, Gegenpartei, Status.

- Interaktionen: Inline-Filter Chips, Spalten-Pinning, Mehrfachauswahl, Tastatur-Navigation.

- Detail-Slide-over: Rechts öffnend; Stammdaten, Beträge, Verknüpfungen, Belege (Drag&Drop).

### Quick-Add Buchung (Modal/Overlay)

- Felder: Datum, Art, Sphäre, Betrag Netto/USt (Auto), Kategorie, Zweckbindung, Beschreibung, Dateien.

- Smart Defaults: Merkt letzte Sphäre/Kategorie; USt-Auto aus Kategorie.

- Shortcuts: Enter speichern, Ctrl+U Datei, Tab durch Felder.

### Zweckbindungen

- Liste: Code, Name, Zeitraum, Einnahmen, Ausgaben, Rest, Status (Warnung bei <0).

- Detail: Verlauf, verknüpfte Buchungen, Grenzwerte, Notizen, Report „Verwendungsnachweis“.

### Budgets

- Grid: Jahr × Kategorie/Sphäre × Betrag geplant/ist/Abweichung; Ampel-Farben.

- Aktionen: CSV-Import, Massenbearbeitung, Roll-over.

### Reports

- Katalog: Journal, Sphäre-Summen, Budget vs. Ist, Zweckbindung-Nachweis, Belegliste.

- Parameter: Zeitraum, Sphäre, Filter; Export als XLSX/PDF; Vorlagen speichern.

### Belege

- Kachel-/Tabellenansicht: Thumbnail, Dateiname, Größe, verknüpft?

- Auto-OCR optional: Vorschlag Betrag/Datum; Matching-Assistent.

### Einstellungen

- Abschnitte: Nummernkreise, USt-Sätze, Kategorien/Sphären, Benutzer & Rollen, Abschlussregeln, Exportpaket, Backup.

## Komponentenbibliothek

- Navigation: Sidebar mit kompakten Icons + Labels, aktiv deutlich.

- Karten: 6px Radius, zarter Border, kein Schatten. Karten sind eigenständigen wiederholbaren Objekten vorbehalten.

- Button-Stufen: Primary (accent), Secondary (muted surface), Tertiary (ghost), Destructive.

- Formulare: Large Click Targets, Helper-Text, Validierungsbadges live.

- Tabellen: Virtuelle Liste, Sticky Header, Row hover, Inline-Tags.

- Chips/Badges: Sphäre, Typ, Status.

- Toasts: Unten rechts, 3–5 s, unaufdringlich.

- Empty States: Ruhige Illustration, klare Next Steps.

## Beispiel-Layouts (Wireframe in Worten)

### Buchungen:

Header: „Buchungen“ | Zeitraum [Jan–Mär] | Sphäre [Alle] | Suche [Gegenpartei/Belegnr.] | Export [XLSX] [PDF]

Tabelle (volle Breite, 14px Row-Height 44–48px), rechts Slide-over bei Klick.

Footer: Summe Netto/USt/Brutto für Filtermenge.

Quick-Add: Zweispaltig bei Desktop, mobil einspaltig; Primäraktion stets sichtbar (Bottom Bar mobil).

## Beispiel-Design-Tokens (CSS-Variablen)

```css
:root[data-theme='dark'] {
  --bg: #0f1115;
  --surface: #151821;
  --muted: #1c2028;
  --border: #2b3240;
  --text: #e7eaf0;
  --text-dim: #aab3c2;
  --accent: #6aa6ff;
  --accent-hover: #8bb9ff;
  --success: #4cc38a;
  --warning: #f5c451;
  --danger: #f06a6a;
  --radius: 6px;
  --radius-control: 4px;
  --radius-modal: 8px;
  --shadow-1: none;
  --blur: saturate(180%) blur(10px);
}
```

## Beispiel-Komponenten

### Card

```jsx
export function Card({ title, children, actions }) {
  return (
    <section
      style={{
        background: 'rgba(21, 24, 33, 0.7)',
        backdropFilter: 'var(--blur)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        boxShadow: 'var(--shadow-1)',
        padding: 16
      }}
    >
      <header style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <h3 style={{ margin: 0, color: 'var(--text)', fontSize: 18 }}>{title}</h3>
        <div>{actions}</div>
      </header>
      <div>{children}</div>
    </section>
  )
}
```

### Toolbar-Button

```jsx
<button
  style={{
    background: 'var(--accent)',
    color: '#0B0E14',
    border: '0',
    borderRadius: 10,
    padding: '8px 12px',
    fontWeight: 600
  }}
>
  + Buchung
</button>
```

## Tabellenspalten (Journal)

- Datum: 2025-09-21

- Belegnr.: 2025-000123

- Art: IN/OUT/TRANSFER

- Sphäre: IDEELL/ZWECK/VERMÖGEN/WGB

- Kategorie: „Mitgliedsbeitrag“

- Zweckbindung: „Jugendfonds“

- Netto | USt | Brutto: rechtsbündig, Mono

- Gegenpartei: „Max Mustermann“

- Status: Offen/Gesperrt/Storno

## Interaktion & Tastatur

- Global: Ctrl+K Suche, N = Neu, Ctrl+S Speichern, Ctrl+F Filtern, Ctrl+E Export.

- Tabelle: Pfeile navigieren, Enter öffnet Detail, Leertaste Mehrfachauswahl.

- Fokus: 2px Accent-Ring, auch bei Maus nutzbar.

## PDF/XLSX-Export-Design

- PDF: A4, ruhiger Header (Vereinsname, Zeitraum, Reportname), Tabelle mit dezenten Zeilen, Seitenfuß mit Seitenzahl und Ersteller.

- Excel: Saubere Typen (Datum, Zahl), Kopf fixiert, AutoFit, Summenzeile, Farbakzente nur sparsam.

## Umsetzungstipps

- Theming: Data-Attribute data-theme="dark|light"; alle Komponenten auf Tokens.

- Responsiv: 12er Grid; Breakpoints: 480 / 768 / 1024 / 1440.

- Performance: Virtuelle Liste (100k Zeilen), Debounce bei Suche/Filter.

- Electron: System-Titlebar ausblenden, eigene minimalistische Titlebar mit Fenster-Controls rechts.

## Delete-Aktionsrichtlinie

- Budgets & Zweckbindungen: Mülleimer-Icon (🗑) in Zeilen verwendet den `btn danger` Stil (rot), um die destruktive Aktion klar zu signalisieren.
- Buchungen: Kein Lösch-Button mehr in der Journal-Tabelle. Löschen erfolgt innerhalb des Bearbeiten-Dialogs (unten links), der die bestehende Bestätigungsabfrage öffnet.
