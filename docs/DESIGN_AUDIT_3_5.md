# VereinO Design-Audit 3.5

Stand: 29. August 2026

## Zielbild

VereinO soll wie ein ruhiges, professionelles Arbeitswerkzeug für Vereine wirken: klar, dicht genug für wiederkehrende Verwaltungsarbeit und ohne dekorative Verschachtelung. Lesbarkeit und erkennbare Hierarchie stehen vor Effekten.

## Bestandsaufnahme

Der Renderer enthält 14 Hauptansichten, 15 Einstellungsbereiche und 28 Dialog- beziehungsweise Modalflächen. Im aktuellen Stand finden sich mehr als 200 Card-, Panel- oder Tile-Verwendungen und rund 200 Vorkommen großer oder vollständig runder Radien. Emoji- und Symbolzeichen sind trotz der neuen `AppIcon`-Komponente noch in mehr als 50 Dateien vorhanden.

Die visuelle Prüfung von Journal und Buchungsdialog bestätigt den Codebefund:

- Suchleiste, Kennzahlen, Tabellenrahmen und Tabellenkopf wirken wie vier gleichwertige Container.
- Im Buchungsdialog liegen Modal, Kopf, Zusammenfassung, Formulargruppen, Zuordnungen und Anhänge jeweils in eigenen gerahmten Flächen.
- Viele Rahmen verbessern die Orientierung nicht, sondern unterbrechen den Lesefluss.
- Radien zwischen 10 und 18 Pixeln sowie Pill-Radien werden zu häufig und ohne semantische Unterscheidung eingesetzt.
- Die wichtigsten Hauptwege verwenden bereits verständliche Icons; ältere Verwaltungs- und Exportbereiche mischen weiterhin Emojis, Textzeichen, handgezeichnete SVGs und Tabler-Icons.

## Was bereits passt

- Die dunkle und helle Farbpalette besitzt brauchbare Kontrast- und Statusfarben.
- Tabellen sind grundsätzlich die richtige Darstellungsform für Buchungen, Rechnungen und Stammdaten.
- Die kompakte Seitenleiste nutzt eine klare, wiedererkennbare Navigation.
- `AppIcon` und `@tabler/icons-react` bilden eine geeignete Grundlage für ein einheitliches Icon-System.
- Fokuszustände, semantische Statusfarben und responsive Dialogvarianten sind bereits vorhanden.
- Budget- und Zweckbindungsfarben transportieren fachliche Bedeutung und sollten erhalten bleiben.

## Verbindliche Gestaltungsregeln

### Radien

| Element | Zielradius |
| --- | ---: |
| Eingabefelder, Buttons, Menüs | 4 px |
| Karten und eigenständige Werkzeuge | 6 px |
| Modals und große Overlays | 8 px |
| Badges mit Text | 4 px |
| Kreis/Pill | Nur Statuspunkt, Avatar, Toggle oder Fortschrittsanzeige |

Radien ab 10 Pixeln entfallen. Vollständig runde Textbuttons und rein dekorative Pill-Flächen werden nicht verwendet.

### Flächenhierarchie

1. Der Seitenhintergrund bildet Ebene 0 und erhält keinen Rahmen.
2. Eine Ansicht darf höchstens eine primäre Arbeitsfläche als gerahmten Container besitzen.
3. Unterabschnitte innerhalb dieser Fläche werden durch Abstand, Überschrift oder `border-top` getrennt, nicht durch weitere Karten.
4. Karten bleiben eigenständig wiederholbaren Objekten vorbehalten, etwa einem Budget oder einer Zweckbindung.
5. Kennzahlen innerhalb einer Arbeitsfläche werden als flacher Werte-Strip dargestellt.
6. Empty States liegen direkt im zugehörigen Bereich und erzeugen keine zusätzliche Karte.
7. Schatten sind Modals, Popovers und schwebenden Menüs vorbehalten. Normale Inhaltsflächen verwenden nur Hintergrund und Border.

### Icons

- Ausschließlich Tabler-Icons über `AppIcon` für Bedienaktionen und fachliche Symbole.
- Keine Emojis in Überschriften, Buttons, Empty States, Tabellen oder Beispieldaten.
- Keine Zeichen wie `✕`, `✎`, `🗑` oder `📎` als Icon-Ersatz.
- 16 px in Tabellen und kompakten Buttons, 18 px in Standardbuttons, 20 px in Navigation und Überschriften.
- Farbe kennzeichnet Zustand oder Bereich, nicht jedes beliebige Icon.

### Lesbarkeit

- Tabellen und Listen sind Standard für viele gleichartige Datensätze.
- Überschriften innerhalb von Panels bleiben kompakt; keine Display-Typografie in Arbeitsflächen.
- Labels, Werte und Aktionen erhalten eine stabile Ausrichtung.
- Sekundärtext bleibt kontrastreich genug und wird nicht durch zu kleine Schrift ersetzt.
- Dichte wird über Zeilenhöhe und Abstand gesteuert, nicht über zusätzliche Rahmen.

## Audit der Hauptansichten

| Ansicht | Bewertung | Beibehalten | Verändern |
| --- | --- | --- | --- |
| Dashboard | Hoher Bedarf | Fachliche Kennzahlen und Diagramme | Äußere Dashboard-Karten und innere KPI-/Warnkarten nicht verschachteln. KPI als flachen Strip, Diagramme als ungerahmte Abschnitte, Empty States ohne Card darstellen. |
| Buchungen | Hoher Bedarf | Tabelle, Vollbreite, kompakte Navigation | Suche und Filter in eine flache Toolbar integrieren. Einnahmen/Ausgaben/Überschuss als Wertezeile statt drei Karten. Nur die Tabelle als primäre Arbeitsfläche rahmen. |
| Dauerbuchungen | Hoher Bedarf | Tabellenansicht und klare Statuswerte | Root-Card entfernen. Formulargruppen mit Trennlinien statt Form-Cards gliedern. Drei Summary-Cards zu einer Kennzahlenzeile zusammenführen. |
| Bankimport | Hoher Bedarf | Master-Detail-Arbeitsweise | Root-Card, Mapping-, Detail-, Lösungs- und KI-Karten auf eine Arbeitsfläche mit klaren Sektionen reduzieren. Aktionen näher an den jeweiligen Datensatz setzen. |
| Verbindlichkeiten | Mittlerer Bedarf | Such-/Tabellenstruktur | `invoices-container` als einzige Arbeitsfläche behalten; Detail- und Formularbereiche innerhalb von Dialogen abflachen. Status nicht gleichzeitig durch Card, Farbe und Badge betonen. |
| Vorschüsse | Mittlerer Bedarf | Listenorientierter Aufbau | Summary-Cards als Werte-Strip, Liste als Hauptfläche. Unterzeilen nicht erneut kacheln. Bearbeitungsaktionen auf ein einheitliches Icon-Muster bringen. |
| Budgets | Mittlerer Bedarf | Karten sind für einzelne Budgets fachlich sinnvoll | Radius und Schatten reduzieren, innere Kennzahlen nicht kacheln. Tabellenansicht als nüchterne Alternative priorisieren. |
| Zweckbindungen | Mittlerer Bedarf | Farbcodierte, eigenständige Objekte | Wie Budgets: eine Karte pro Objekt ist zulässig, innere Flächen werden durch Typografie und Linien gegliedert. |
| Mitglieder | Hoher Bedarf | Suche, Tabs und Tabellen | Header-Card plus Board-Card auf eine Arbeitsfläche reduzieren. Statistik-Karten und Karten in Einladungs-/Bearbeitungsdialogen abflachen. |
| Belege | Niedriger bis mittlerer Bedarf | Einfache, überschaubare Ansicht | Generische Card um Liste entfernen; Vorschau als klar getrennten Detailbereich behandeln. Suchsymbol durch `AppIcon` ersetzen. |
| Reports | Hoher Bedarf | Diagramme und Zeitraumfilter | Nicht jedes Diagramm als eigene Schattenkarte zeigen. Filter als Toolbar, Berichte als vertikale Abschnitte mit gemeinsamen Achsen und Abständen organisieren. |
| Einreichungen | Hoher Bedarf | Statusfilter und Review-Ablauf | Summary-Buttons, Inhaltskarten und innere Attachment-Karten reduzieren. Review als Master-Detail-Fläche aufbauen. Alle Import-/Export-/Anhang-Emojis ersetzen. |
| KI | Hoher Bedarf | Gespräch als primärer Verlauf | Composer, Antworten und Review-Aktionen klar priorisieren. Review-Cards nur für echte Genehmigungsobjekte; innere Panels und Chips reduzieren. `AIView.css` auf dieselben Radius-Tokens umstellen. |
| Einstellungen | Sehr hoher Bedarf | Fachliche Gruppierung und Navigation | 18-px-Rahmen von Content und Navigation entfernen. Nur einen Inhaltsrahmen verwenden. Pane-Cards, Layout-Panels und Toggle-Cards nicht ineinander stapeln. Einstellungen als beschriftete Zeilen und Sektionen darstellen. |

## Audit der Einstellungsbereiche

| Bereich | Bedarf | Maßnahme |
| --- | --- | --- |
| Allgemein | Hoch | `settings-card` > `settings-layout-panel` > `settings-toggle-card` auf Sektionen und Einstellungszeilen reduzieren; Überschriften-Emojis ersetzen. |
| Organisation | Hoch | Organisations-, Profil-, Kategorien-, Anzeige- und Bescheidkarten als Abschnitte derselben Fläche darstellen; Emojis vollständig ersetzen. |
| Tabelle | Mittel | Vorschau behalten, aber Zahnrad und Büroklammer durch Icons ersetzen; Optionen als kompakte Zeilen. |
| Tags | Mittel | Tag-Liste nicht als Kartenraster, sondern als Liste mit Farbswatch und Aktionen; Emoji-Leerzustand entfernen. |
| Kategorien | Hoch | Kartenraster in scanbare Liste überführen; Kategoriezeichen als auswählbare Icons statt Emoji-Katalog. |
| Zahlungskonten | Mittel | Konten als Zeilen mit Farbswatch, Typ, Status und Aktionen statt je einer Card. |
| Geschäftspartner | Niedrig bis mittel | Toolbar und Tabelle zu einer Arbeitsfläche verbinden; Empty State ohne Card. |
| Import | Hoch | Import-Assistent, Analyse, Warnungen und Zusammenfassung über Sektionen statt verschachtelte Karten gliedern; Log-Emoji ersetzen. |
| Mitgliederimport | Hoch | Formabschnitte und bearbeitete Zeilen ohne Emoji-Überschriften; Warnungen semantisch mit Icon und Text. |
| Speicher & Backup | Hoch | Storage-Cards, Backup-Cards und Vergleichstabelle auf klare Sektionen reduzieren; Ordner-, Schutz- und Datenbank-Emojis ersetzen. |
| OCR/Docling | Mittel | Status und Steuerung als zwei Einstellungszeilen; innere Control-Card entfernen. |
| Spenden | Mittel | Defaults und Entwürfe als Sektionen; Herz-Emoji durch fachliches Icon ersetzen. |
| Kassenprüfung | Hoch | Prüfungsliste innerhalb der äußeren Card nicht erneut kacheln; PDF-Aktion vereinheitlichen. |
| Jahresabschluss | Sehr hoch | Aktuell mehrfach verschachtelte Karten für Summen und Jahre. Auf Werte-Tabelle, Statusband und getrennte Aktionssektion reduzieren; alle Emojis ersetzen. |
| KI-Muster | Mittel | Übersicht und Liste als eine Arbeitsfläche; Regelzeilen statt einzelner Karten. |
| Updates | Niedrig | Bestehende kompakte Struktur behalten, Radius und Schatten an Tokens angleichen. |

## Audit der Dialoge und Overlays

| Dialog | Bedarf | Maßnahme |
| --- | --- | --- |
| Buchung (`QuickAddModal`) | Sehr hoch | Modal als einzige äußere Fläche. Typwahl als Segmented Control behalten. Zusammenfassung als Textzeile, Basis/Finanzen ohne eigene Karten, Zuordnungen und Anhänge mit Trennlinien gliedern. Sticky Footer beibehalten. |
| Rechnungserkennung (`LocalInvoiceScanModal`) | Sehr hoch | Dokumentvorschau und Formular als stabile Split-Ansicht. Optionale Bereiche als Akkordeons ohne Card-in-Card. AI-Hinweise als Statuszeilen. |
| Buchungsdetails (`VoucherInfoModal`) | Hoch | Metadaten als Definition List, Beträge als kompakte Tabelle, Anhänge als Zeilen. Emoji-Titel und Exportaktionen ersetzen. |
| Rechnungsdetails (`InvoiceDetailModal`) | Hoch | Mehrere innere Cards zu Abschnitten mit Überschrift und Divider reduzieren. |
| Rechnungsformular (`InvoiceFormModal`) | Hoch | Drei `invoice-form-card`-Gruppen in ein Formulargrid mit Abschnittstrennern überführen. |
| Setup-Assistent | Hoch | Auswahlkarten nur für echte Auswahloptionen; Vorschauen und Formulargruppen nicht zusätzlich kacheln. Demo-Emojis durch Icons ersetzen. |
| Exportoptionen | Hoch | Berichtstypen als sachliche Auswahlzeilen/Radio-Gruppe statt Emoji-Kacheln. Exportbuttons mit Dateityp-Icons. |
| Tätigkeitsbericht | Hoch | Übersicht, Empty State, Jahreskarten und Details auf Liste plus Editorfläche reduzieren. |
| Steuerbefreiungsbescheid | Hoch | Dokumentstatus, Vorschau und Aktionen ohne große Emoji-Illustrationen; Dateiaktionen mit Icons. |
| Spendenbescheinigung | Mittel | Auswahltypen mit konsistenten Icons; Formularsektionen flach halten. |
| Anhänge | Mittel | Dateiliste und Vorschau als Split-Ansicht; Bestätigung nicht als weitere Card. |
| Budget bearbeiten | Niedrig | Grundstruktur passt; `color-preview-card` in eine einfache Vorschauzeile umwandeln. |
| Zweckbindung bearbeiten | Niedrig | Wie Budgetdialog; Vorschau nicht als innere Card. |
| Kategorie | Hoch | Emoji-Picker durch begrenzte Tabler-Icon-Auswahl ersetzen; Farbauswahl und Vorschau vereinfachen. |
| Tag | Mittel | Emoji und Inline-Layout entfernen; Farbswatch mit Name als Vorschau genügt. |
| Tags verwalten | Mittel | Listenzeilen statt Cards; Edit/Delete/Close über `AppIcon`. |
| Kassenprüfung | Mittel | Formular und Ergebnis als zwei Abschnitte; Status nicht zusätzlich kacheln. |
| Kassenprüfer | Niedrig | Kompakte Liste, einheitlicher Modalheader und Iconbuttons. |
| Mitgliederexport | Mittel | Optionen in beschrifteten Gruppen ohne zusätzliche Karten. |
| Neue Organisation | Niedrig | Struktur ist knapp; nur Radius und Iconbutton vereinheitlichen. |
| Organisationswechsel bestätigen | Niedrig | Struktur beibehalten; Modal- und Buttonradius angleichen. |
| Update verfügbar | Niedrig | Summary-Card entfernen und Inhalt direkt im Dialog zeigen. |
| Automatisches Backup | Niedrig | Innere Card entfernen; Hinweistext direkt im Dialog. |
| Changelog | Mittel | Emoji-Mapping durch kleine semantische Icons ersetzen; Versionsbadge eckiger gestalten. |
| Zeitraumfilter | Niedrig | Kompakte Werkzeugfläche; nur Tokens angleichen. |
| Metafilter | Niedrig | Kompakte Werkzeugfläche; nur Tokens angleichen. |
| Datenbankmigration | Niedrig | Datenbankpfad als Codeblock statt Card; Headerbutton vereinheitlichen. |
| Buchungs-Popup-Rahmen | Niedrig | Ist eine Shell, keine Inhaltskarte; Radius auf 8 px und Close-Icon auf `AppIcon`. |

## Umsetzungsreihenfolge

### 1. Fundament

- Radius-Tokens `2 / 4 / 6 / 8 / full` definieren.
- Button, Input, Dropdown, Card, Modal, Popover und Badge auf diese Tokens umstellen.
- Schatten aus normalen Cards entfernen.
- Gemeinsame Klassen für `work-surface`, `section`, `metric-strip`, `data-list` und `empty-state` einführen.
- Alte Richtlinie in `docs/ui-guidelines.md` ersetzen, da sie 12–16 px Radius und Glassmorphism ausdrücklich empfiehlt.

### 2. Icon-System

- `AppIcon` als einzigen Renderer-Zugang zu Tabler-Icons etablieren.
- Zuerst sichtbare Emoji-Schwerpunkte migrieren: Einstellungen, Export, Steuerbescheid, Kategorien, Changelog, Einreichungen.
- Danach Textzeichen in Close-, Edit-, Delete-, Attachment- und Statusaktionen ersetzen.
- Handgezeichnete Navigations-SVGs abschließend auf Tabler umstellen.

### 3. Referenzansichten

- Journal als Referenz für tabellenzentrierte Arbeitsflächen überarbeiten.
- Buchungsdialog als Referenz für Formulare und Modals überarbeiten.
- Dashboard als Referenz für Kennzahlen und Diagramme überarbeiten.
- Für alle drei Zustände Desktop- und schmale Screenshot-Baselines anlegen.

### 4. Fachansichten

- Dauerbuchungen, Bankimport und Verbindlichkeiten.
- Budgets und Zweckbindungen gemeinsam, damit beide dieselbe Objektdarstellung erhalten.
- Mitglieder, Vorschüsse, Belege und Reports.
- Einreichungen und KI zuletzt, da sie die meisten Spezialzustände besitzen.

### 5. Einstellungen und Dialoge

- Zuerst gemeinsames Settings-Layout abflachen, danach Pane für Pane migrieren.
- Dialoge nach Risikoklassen bearbeiten: einfache Bestätigungen, Stammdaten, Export/Dokumente, komplexe Erfassungsabläufe.
- Nach jedem Dialog Fokusführung, Escape, Scrollverhalten und schmale Fensterbreite prüfen.

## Abnahmekriterien

- Keine `.card` innerhalb einer `.card` im gerenderten DOM.
- Keine Emojis oder Unicode-Aktionszeichen in der sichtbaren Bedienoberfläche.
- Keine Radien über 8 px, außer echten Kreisen, Toggles und Fortschrittsanzeigen.
- Höchstens eine gerahmte Hauptarbeitsfläche pro Ansicht oder Modal.
- Tabellenüberschriften, Eingaben und Aktionen bleiben bei 1024 px sowie schmalen Dialogbreiten vollständig lesbar.
- Dark und Light Theme besitzen dieselbe Hierarchie.
- Kritische Screenshots existieren für Dashboard, Journal, Quick Add, Bankimport, Settings, Mitglieder, Reports und Rechnungserkennung.
- Build, relevante Komponententests und Electron-Smoke-Tests bleiben erfolgreich.