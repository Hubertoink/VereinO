# Desktop-Oberfläche im Web

- Organisationsdialog mit Desktop-Titel, Schließen-Schaltfläche, zweispaltiger
  Profilwahl und fixiertem Aktionsbereich; zusätzliche Benutzerübernahme bleibt
  erhalten. Hintergrund und innere Scrollbereiche sind während des Dialogs gesperrt.
- KI verwendet die bestehenden `AiAssistantHeader`, `AiAvatar`, `AiComposer` und
  `AIView.css` aus dem Renderer. Web-Funktionen für Chat, Einstellungen,
  Buchungsvorschläge und Belegprüfliste sind weiterhin angebunden. Der Umfang
  verfügbarer Aktionen wurde damit nicht um autonome Desktop-Aktionen erweitert.
- Beide Buchungsansichten öffnen `LocalInvoiceScanModal` aus dem Desktop-Renderer.
  Web-Adapter liefert Organisationskategorien und KI-Ergebnisse. PDF-/Bildvorschau,
  Zoom, erkannte Werte und anschließende Buchungsprüfung stammen aus der App.
- Noch nicht analysierte Originaldateien können als temporärer, benutzer- und
  organisationsgebundener Beleg hinterlegt werden. Buchung/Entwurf übernimmt ihn
  atomar über den bestehenden Dokumentpfad. Kein KI-Aufruf für reine Ablage.
- Hell-/Dunkel-Schalter aus der Kopfzeile entfernt. Darstellung bleibt über die
  vorhandenen Einstellungen konfigurierbar.
- Basisstylesheet wird vor Komponentenstyles geladen; es überschreibt nicht mehr
  die KI-Typografie und das transparente Eingabefeld.

Prüfung: Backend-Belegworkflow einschließlich reiner Dateiablage, Browserablauf
KI → Rechnung → geprüfter Entwurf, beide Buchungseinstiege und echte PDF-Vorschau,
Organisationsanlage mit gesperrtem Hintergrund und responsive Darstellung.

Der Web-Build setzt JSX ausdrücklich auf die automatische Runtime. Im Docker-Build
liegen gemeinsame Renderer-Dateien außerhalb von `web/`; ohne diese Einstellung
fehlte ihnen beim Rendern der React-Runtime-Import. Der echte Docker-Browsercheck
ist deshalb zusätzlich zu den Vite-Tests erforderlich.

## Begrenzte Panels und identische Rechnungseinstiege

KI-Einstellungen, Verlauf, Regeln und Kontext erscheinen in einem kompakten,
zum Auslöser ausgerichteten Body-Portal. Die Position berücksichtigt den sichtbaren
Viewport; lange Inhalte scrollen innerhalb des Panels. Das äußere Web-Dokument
scrollt nicht mehr zusätzlich zu den Inhaltsbereichen.

Klassisches Journal und Buchung Plus verwenden nun auch `InvoiceBatchControl`
aus der Desktop-App: geteilte Einzelbeleg-/Batch-KI-Steuerung, Original-Uploadbereich
und Prüfliste. Ein Web-Adapter lädt mehrere PDFs nacheinander zur Analyse und
zeigt die eigene, persistente Prüfliste. Prüfen öffnet die Originaldatei samt
vorbefülltem Desktop-Rechnungsdialog; Verwerfen entfernt den temporären Beleg.
Die Originaldatei ist nur für ihren Ersteller in der aktiven Organisation abrufbar,
solange sie weder übernommen noch älter als 24 Stunden ist. Desktop-spezifischer
Submit-Ordner und nicht unterstützte KI-Vorgaben werden im Web ausgeblendet.

Der Web-Rechnungsdialog reserviert keinen Platz für die Electron-Titelleiste.
Seine maximale Höhe umfasst den sichtbaren Viewport abzüglich 24 Pixel Rand.

`npm --prefix web run test:parity` prüft beide Buchungsansichten, Panelgrenzen und
Klickziele nach Scrollen bei 1440×900, 900×550, 640×400 und 390×700 sowie
Batch-Upload, Neuladen, Verwerfen, PDF-Vorschau und Belegbindung beim Speichern.

## Entwürfe und Buchungstags

Der Web-Buchungseditor begrenzt seine Grid-Spalten auf die verfügbare Breite;
Zusatzfelder und Tag-Chips umbrechen auch auf schmalen Fenstern. Kopf und Aktionen
bleiben außerhalb des vertikal scrollenden Inhalts. Die Entwurfsprüfung verwendet
Betragsübersicht, Faktenkarten und Informationszeilen im Stil der Buchungsdetails,
mit festem Fußbereich für Freigabe und Korrekturrückgabe.

Migration 019 ergänzt Tags an Buchungen und Entwürfen. Der vorhandene Desktop-
`TagsEditor` bietet bestehende Tags an und akzeptiert neue Namen per Enter.
Beim Speichern einer Buchung entstehen neue Tags atomar in den Stammdaten;
bei Entwürfen erst mit der Freigabe. Die bestehenden Rollenrechte gelten weiter.
Namen werden pro Organisation ohne Beachtung der Groß-/Kleinschreibung
zusammengeführt. Tags bleiben bei Änderungen anderer Felder erhalten und werden
in klassischem Journal, Buchung Plus, Details, Tagfiltern und Suche angezeigt.

## Buchungsreiter

Die Arbeitsweise-Schalter sind mit einer gemeinsamen, benutzer- und
organisationsgebundenen Reiterverwaltung verbunden. Klassisches Journal und
Buchung Plus verwenden ihre vorhandenen Desktop-Reiterleisten; das Erfassungs-
Flyout verwendet den Desktop-Reiterselektor. Schließen parkt bei aktivierten
Reitern die Eingaben. Das Kreuz am Reiter verwirft sie. Speichern entfernt nur
den gespeicherten Reiter; „Neue Buchung“ nach dem Speichern öffnet einen leeren.
Bearbeitungen derselben Buchung werden nicht doppelt geöffnet. Versionskonflikte
lassen die ungespeicherten Eingaben bestehen.

Reiter überleben interne Seitenwechsel und enthalten auch Tags, Zuordnungen
sowie die Dokumentbindung aus KI-Rechnungsvorschlägen. Sie bleiben im Browser-
Arbeitsspeicher bis zum Schließen oder Abmelden; Neuladen/Verlassen der Seite
warnt bei offenen Reitern. Es erfolgt keine automatische Buchungsspeicherung.
Bei deaktivierten Reitern bleibt die einzelne Erfassung bestehen. Bereits offene
Reiter gehen beim Abschalten der Einstellung nicht verloren.

`npm --prefix web run test:tabs` prüft beide Ansichten einschließlich Parken,
Wechseln, Seitennavigation, unabhängigem Speichern, Bearbeitung, Versionskonflikt,
„Neue Buchung“ nach Speichern und Rechnungsübernahme mit Dokumentbindung.

## Entwürfe vor der Freigabe ergänzen

Admin und Editor dürfen Entwürfe der aktiven Organisation in den Zuständen
DRAFT, RETURNED und SUBMITTED bearbeiten. User bearbeiten weiterhin nur eigene
DRAFT-/RETURNED-Einträge. Übernommene Entwürfe bleiben für alle gesperrt.
„Bearbeiten“ ist in der Entwurfsliste und in der Freigabeprüfung erreichbar.
Nach dem Speichern eines eingereichten Entwurfs öffnet sich die Prüfung mit den
aktualisierten Angaben und der neuen Versionsnummer. Tags werden bei der
anschließenden Freigabe übernommen. Änderungen werden mit Akteur und Vorher-/
Nachher-Werten protokolliert; Bearbeitung und Freigabe prüfen dieselbe Version.

## Anhänge und Modulauswahl im Web

Erfassung und Bearbeitung von Buchungen und Entwürfen verwenden die gemeinsame
Desktop-Anhangssektion. PDF, PNG, JPEG und WebP sind bis 10 MB je Datei möglich.
Neue Dateien werden vorübergehend dem angemeldeten Benutzer zugeordnet und erst
in der Speichertransaktion an den Eintrag gebunden. Wiederholtes Speichern nach
einem Fehler verwendet den Upload erneut. Ungebundene Dateien werden beim
Schließen bestmöglich entfernt; nach 24 Stunden werden sie beim nächsten Upload
des Benutzers bereinigt. Geparkte Buchungsreiter behalten ausgewählte Dateien im
Arbeitsspeicher.

Die gemeinsame Desktop-Anhangsverwaltung bietet Vorschau, Download, Hinzufügen
und Löschen. User verwalten eigene offene Entwürfe; Admin und Editor ergänzen
auch eingereichte Entwürfe. Bei der Freigabe werden die Anhänge atomar an die
Buchung gebunden und bleiben im ursprünglichen Entwurf lesbar. Bereits vorhandene
Anhänge freigegebener Entwürfe werden durch Migration 021 ebenfalls zugeordnet.
Buchungsanhänge bleiben für Admin löschbar; Editor dürfen an eigene Buchungen
Dateien ergänzen. Zugriffe sind organisationsgebunden.

Unter Darstellung → Navigation & Layout bestimmt der Admin die sichtbaren
Hauptbereiche für die aktive Organisation. Die Auswahl verwendet Desktop-Stile, Navigationsliste und Icons; Dashboard, Buchungen, Entwürfe und Einstellungen bleiben fest sichtbar,
soweit die Benutzerrolle Zugriff gewährt. Ausblenden verändert keine Rechte.
Änderungen wirken sofort und bleiben nach Neuladen erhalten.

Tests: `test:attachments` im Web prüft beide Buchungsansichten und User-Entwürfe,
Upload-Wiederholungen, Reiter, Vorschau und Zugriffsrechte. Der Backend-Test
`tests/attachments.test.ts` prüft mit `TEST_DATABASE_URL` zusätzlich atomare
Übernahme, KI-Belege, Rollen, Organisationstrennung und Modulauswahl.
