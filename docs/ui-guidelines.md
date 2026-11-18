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

#### Einstellungsseiten

- Jede Unterseite beginnt mit einem einheitlichen Seitentitel und einer kurzen Erklärung; Aktionen und Status stehen bei Bedarf rechts daneben.
- Einstellungsformulare gruppieren zusammengehörige Optionen in ruhigen Abschnitten. Beschriftung und Erklärung bleiben bei ihrem jeweiligen Control.
- Stammdaten-Seiten verwenden einen gemeinsamen Kopf mit optionaler Suche, Zähler und Hauptaktion; Tabelle oder Liste richtet sich nach dem Inhalt.
- Arbeitsabläufe wie Import, Sicherung und Jahresabschluss zeigen Status, Schritte, Vorschau und Bestätigung. Sie behalten ein workflow-orientiertes Layout statt in Formularzeilen gepresst zu werden.
- Akzentfarben sind für Auswahl und Fokus reserviert; Erfolg, Warnung und Gefahr verwenden die semantischen Theme-Farben.
- Alle 16 Einstellungsbereiche verwenden `SettingsPageHeader`. `SettingsSection` und `SettingsRow` sind die gemeinsame Basis für neue Abschnitte und Optionen; das Layout liegt gekapselt in `views/Settings/settings.css`.
- Titel: 20 px, Abschnitt: 16 px, Beschriftung: 14 px, Hilfetext: 13 px. Außenabstand und Abschnittsabstand: 24 px; Zeilen: 16 px. Unter 650 px Inhaltsbreite stehen Controls unter ihrer Beschreibung.
- Sichtbarkeit und Reihenfolge der Spalten, Zeilenhöhe, Zeilenlayout, Eintragsanzahl und Datumsformat sind unter „Tabelle“ gebündelt. Die Vorschau reagiert auf die Auswahl.
- Stammdaten verwenden neutrale Listenzeilen mit kleinen Farbpunkten, Zähler und Hauptaktion im Seitenkopf. Farbe darf die Bezeichnung nicht ersetzen.
- Hinweise zum Geltungsbereich und zur Speicherung beschreiben das tatsächliche Verhalten. Automatische Übernahme und explizite Formularaktionen bleiben unterscheidbar; ohne Rückmeldung des Speichervorgangs wird kein „Gespeichert“-Status behauptet.

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


## Kompakte Dialoge

- Stammdatenformulare verwenden `MasterDataDialog` und `ColorField`: Icon-Kachel, Titel und kurzer Hilfstext, statische Feldbeschriftungen, getrennte Fußzeile mit Aktionen.
- Standardbreite 700 px, kurze Formulare 540 px; unter 440 px stehen die Formularfelder untereinander. Hohe Inhalte scrollen, Kopf und Fuß bleiben erreichbar.
- Feldhöhe 36 px, Labels 12 px, dünne Fokuslinie statt eingefärbter Fokusfläche. Alle Farben stammen aus den Theme-Tokens.
- Status und Farbe bilden bei Konten eine eigene kompakte Zeile. Farbchips sind 22 px groß; eigene und zufällige Farben zeigen eine sichtbare Farbprobe.
- Alle übrigen Dialoge übernehmen den gemeinsamen `ModalHeader`, die neutrale Schließen-Schaltfläche und die gemeinsamen Oberflächen-/Fokusregeln. Fachlich umfangreiche Dialoge behalten ihre benötigte Größe und Gliederung.
- Verschachtelte Farbdialoge dürfen beim Schließen oder Speichern das übergeordnete Formular nicht auslösen. Escape, Strg/Cmd+S und die Rückgabe des Fokus werden in den Formular-UI-Tests geprüft.

- Kategorie-Symbole stammen aus `@tabler/icons-react` (MIT). `utils/categoryIcons.ts` verwaltet kurze stabile Schlüssel und die Zuordnung früherer Emoji-Werte; `CategoryIcon` rendert das monochromatische Bibliotheks-Symbol. Native Selects zeigen den Kategorienamen ohne Icon-Schlüssel.


## Erstes Setup

- Die fünf Schritte sind Willkommen, Deine Ansicht, Datensicherung, Konten und Startklar. Ein maximal 900 px breiter Dialog mit beschrifteter Schrittfolge und festem Aktionsbereich; nur der Inhalt scrollt.
- Organisationsname, verantwortliche Person, Buchungsansicht, optionales Farbschema und Sicherungseinstellungen bilden den Kern. Der Kontenschritt schlägt Bar und Bank vor und erlaubt eigene Konten. Pro Konto sind Anfangsbestand und Stichtag optional. Starter-Tags sind ebenfalls optional.
- Eingaben bleiben bis „VereinO starten“ lokal im Entwurf. Auch die Ordnerauswahl verändert den Sicherungsort erst beim Abschluss. „Später einrichten“ und Escape verwerfen diesen Entwurf.
- Bestehende Workflow- und Tabelleneinstellungen bleiben unverändert. Speicherfehler bleiben sichtbar, ein erneuter Versuch erzeugt keine doppelten Tags, und `setup.completed` wird zuletzt gesetzt.
- Nicht abgeschlossene Einrichtungen werden beim Start einmal pro Organisation und Sitzung angeboten. Der Sicherungshinweis wird währenddessen nicht zusätzlich geöffnet.
- Seitenspezifische Hinweise ergänzen das Setup für Buchungen und Bankimport; Details stehen unten.

- Farbschema-Auswahl im Setup rendert beide Buchungsminiaturen sofort mit den gemeinsamen App-Paletten. Der Scope `.setup-theme-preview` setzt lokale Theme-Tokens; das globale Theme bleibt bis zum Abschluss unverändert.

## KI-Import

- Vier Schritte im Kopf: Datei auswählen, KI-Analyse, Daten prüfen, Übernehmen. Jeder Schritt zeigt einen kurzen Status; die Primäraktion steht immer rechts im festen Fußbereich.
- Die Einrichtung gliedert sich in nummerierte Abschnitte (Datei, Spalten, Zuordnungsregeln, Kontext). Erkannte Spalten erscheinen als Chips, die vollständige Zuordnung bleibt aufklappbar.
- Die Prüfung zeigt Kennzahl-Karten, die zugleich als Statusfilter dienen. Die Buchungstabelle ist eine Lesetabelle mit den Journal-Badges für Art und Sphäre. Werte, die nicht unverändert aus der Datei stammen, tragen ein kleines Symbol (KI-Vorschlag, manuell geändert, Nutzervorgabe).
- Bearbeitet wird eine Zeile im überlagerten Detailbereich rechts mit Originalquelle und Vor/Zurück-Navigation. Die Tabelle behält ihre Breite; ein Klick außerhalb schließt den Detailbereich und erhält die Änderungen im Entwurf.
- Stammdaten werden nach Typ gruppiert. Nur neue oder fehlerhafte Einträge sind editierbar, vorhandene erscheinen als Chips. Die Freigabe steht gesammelt oben.
- Offene Punkte (Buchungen, Beziehungen, Stammdaten, ungespeichert) stehen als Checkliste im Fußbereich neben „Auswahl übernehmen“ und führen zum jeweiligen Reiter.

## Kontextuelle Seitenhilfe

- Rechtsklick auf „Buchungen“ oder „Bankimport“ in der seitlichen oder oberen Navigation öffnet „Hilfe zu dieser Seite“. Umschalt+F10 und die Kontextmenütaste bieten denselben Zugang, Pfeiltasten navigieren im Menü. Bei Buchungen enthält es zusätzlich „Klassisch“ und „Plus“ als Auswahl mit sichtbarem aktuellem Zustand.
- Themen: Buchungsansichten mit Vorschau, klassische Spaltenauswahl, Plus-Details und Filter, Erfassungs-/Speicherverhalten und der Weg vom importierten Bankbeleg zur Buchung. Ansichtswechsel und Workflow-Einstellungen erfolgen nur auf ausdrückliche Auswahl.
- Automatische Hinweise gelten nur für Organisationen ohne abgeschlossenes Setup und ohne bestehende Buchungen bei der ersten Initialisierung. Bestehende Nutzer bekommen beim Update keine automatische Einführung; die Hilfe bleibt manuell erreichbar.
- Maximal eine nichtmodale Karte gleichzeitig; keine automatische Tour. Pro Seitenbesuch höchstens ein Hinweis. Die erste erfolgreiche Buchung bzw. der erste erfolgreiche Bankimport kann einen neuen passenden Hinweis auslösen. Fehlgeschlagene Operationen und Bearbeitungen lösen nichts aus.
- Die Seite muss geladen und mindestens 1,8 Sekunden ohne Dialog/Dropdown bereit sein. Offene Dialoge, seitliche Buchungsformulare und die responsive Navigationsüberlagerung unterdrücken Karten. Automatische Karten übernehmen keinen Fokus.
- „Später“ verschiebt das Thema um mindestens 24 Stunden und bis zu einem späteren Seitenbesuch. „Nicht mehr anzeigen“ schließt es dauerhaft von automatischen Hinweisen aus. Manuelles Wiederaufrufen bleibt möglich. Fortschritt liegt pro Organisation und Gerät in `vereinO.page-help.v1:<orgId>`; ein Organisationswechsel verwirft offene Karten und Menüs.
- Theme-Tokens, Tabler-Icons (MIT), kleine Bildschirmbreiten und reduzierte Bewegung werden unterstützt. Keine zusätzliche dauerhaft sichtbare Hilfeschaltfläche in der Navigation.
- Karten wählen rechts, links, unterhalb oder oberhalb ihres Bezugselements einen freien Platz mit 14 px Abstand. Bei wenig Höhe scrollt die Karte innerhalb der freien Fläche; das erklärte Bedienelement bleibt frei. Scrollen, Größenänderungen und wechselnde Inhalte berechnen die Platzierung neu.
