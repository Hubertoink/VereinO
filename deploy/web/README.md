# VereinO Web-Pilot

Dieser Branch entwickelt einen eigenständigen Browserbetrieb für einen Verein mit
zentralem PostgreSQL-Server. Die erste Ausbaustufe ist ein **Pilot**, keine vollständige
Web-Portierung der Desktop-App. Bestehende SQLite-Dateien werden nicht verändert.

## Gemeinsame Oberfläche

Die Browserversion nutzt direkt die Original-Komponenten aus `src/renderer`:
Navigation, Styles, Buchungen Plus, Buchungsdetails und das kompakte Erfassungsformular.
Die separate Pilot-Buchungsliste wurde ersetzt. Admin/Editor starten im Buchungsjournal;
User starten bei ihren Entwürfen. Benutzerverwaltung und Konto liegen unter Einstellungen.
Der aktive Verein erscheint im gemeinsamen Kopfbereich.

Unterstützt bleiben vorerst Einnahmen/Ausgaben ohne gesonderte Steueraufteilung.
Nicht angebundene Module und Schreibaktionen werden ausgeblendet. Die bestehenden
Docker-Daten und Benutzerkonten werden beim Aktualisieren weiterverwendet.

## Lokal starten

Voraussetzungen: Docker Engine mit Compose und Berechtigung zum Docker-Daemon.

```sh
cp .env.web.example .env.web
# DB_PASSWORD und SETUP_TOKEN jeweils mit eigenem `openssl rand -hex 32` befüllen.
docker compose --env-file .env.web -f compose.web.yml up -d --build
```

`http://localhost:8080` öffnen. Bei einer frischen Datenbank den Verein, die E-Mail
und das Passwort des ersten Admins sowie SETUP_TOKEN eingeben. Es gibt keine offene
Registrierung; weitere Benutzer erstellt ein Admin in der Benutzerverwaltung.

Der Initialisierungstoken ist ein Servergeheimnis und kein normales Benutzerpasswort.
Nach der Initialisierung kann er aus der lokal gespeicherten Kopie entfernt und durch
einen neuen zufälligen Wert in der Deployment-Konfiguration ersetzt werden. Setup ist
bei vorhandenen Benutzern ohnehin gesperrt.

## Mehrere PCs und HTTPS

Für den echten Betrieb einen HTTPS-Reverse-Proxy vor den Webdienst setzen:

- `APP_ORIGIN=https://vereino.example.org` auf die genaue Browser-Adresse setzen.
- `COOKIE_SECURE=true` setzen.
- Der Reverse-Proxy leitet auf `127.0.0.1:8080` weiter (bei eigenem Container passende
  interne Vernetzung verwenden).
- Nur die Weboberfläche erreichbar machen. PostgreSQL und Backend veröffentlichen
  im Compose-Setup keine Host-Ports.
- Bei Betrieb hinter einem Proxy die externe Domain unverändert an die Anwendung
  weitergeben. Browser und API werden über dieselbe Origin ausgeliefert.

Die Beispielkonfiguration bindet bewusst nur localhost. Für einen zeitweiligen
LAN-Test `WEB_BIND` auf die LAN-IP und `APP_ORIGIN` auf exakt diese HTTP-Adresse
setzen. HTTP mit `COOKIE_SECURE=false` ausschließlich für lokale Entwicklung verwenden.

## Rechte und Entwürfe

| Aktion | ADMIN | EDITOR | USER |
| --- | --- | --- | --- |
| Benutzer und Rollen verwalten | ja | nein | nein |
| Buchungen lesen/erstellen | ja | ja | nein |
| Gebuchte Einträge ändern | ja | nein | nein |
| Eigene Entwürfe bearbeiten/einreichen | ja | ja | ja |
| Alle eingereichten Entwürfe prüfen | ja | ja | nein |
| Freigeben oder zur Korrektur zurückgeben | ja | ja | nein |

User sehen nur ihre eigenen Entwürfe samt Prüfstatus. Eingereichte Entwürfe sind
für Änderungen gesperrt. Nach Rückgabe können sie bearbeitet und erneut eingereicht
werden. Die Übernahme wird transaktional ausgeführt; ein Entwurf kann nicht mehrfach
gebucht werden. Entwürfe fließen nicht in Buchungssummen ein. Versionskonflikte
melden HTTP 409, statt zwischenzeitliche Änderungen unbemerkt zu überschreiben.

## Updates und Migrationen

```sh
docker compose --env-file .env.web -f compose.web.yml up -d --build
```

Der Backend-Start führt nummerierte SQL-Migrationen einmalig und transaktional aus.
Ein Datenbank-Lock verhindert konkurrierende Migrationen. Vor Updates ein Backup
anfertigen. Datenbankmigrationen werden nicht automatisch rückwärts ausgeführt;
bei einem erforderlichen Rollback den passenden gesicherten Datenbestand verwenden.

## Backup und Wiederherstellung

```sh
# Enthält Benutzer, Sessions, Entwürfe, Buchungen und Änderungsprotokoll.
docker compose --env-file .env.web -f compose.web.yml exec -T postgres \
  pg_dump -U vereino -d vereino -Fc > vereino-web.dump
```

Backups außerhalb des Servers aufbewahren und zugriffsgeschützt behandeln. Für eine
Wiederherstellungsprobe eine **separate frische Installation** verwenden, Backend und
Webdienst stoppen und den Dump in deren Datenbank laden:

```sh
docker compose --env-file .env.web -f compose.web.yml stop backend web
docker compose --env-file .env.web -f compose.web.yml exec -T postgres \
  pg_restore -U vereino -d vereino --clean --if-exists < vereino-web.dump
docker compose --env-file .env.web -f compose.web.yml up -d
```

Ein `docker compose down -v` löscht die persistenten Volumes und ist kein normaler
Update-Schritt. Belegdateien liegen als Originalbytes in PostgreSQL und sind im Datenbankbackup enthalten.

## Weitere Module im Originaldesign

Die Webversion importiert auch `MembersView`, `BudgetsView`, `EarmarksView`,
`DashboardPlusView` und `ReportsView` direkt aus der Desktop-Oberfläche.

- **Mitglieder:** Stammdaten, Vorstandsfunktionen, Beitrags- und Mandatsangaben,
  Suche, Filter und Archivstatus. Admin verwaltet; Editor kann Details lesen.
  Beitragseinzug und Zahlungshistorie sind noch nicht angebunden.
- **Budgets und Zweckbindungen:** Admin legt an, bearbeitet und archiviert;
  Editor liest. Beim direkten Buchen können Admin und Editor Beträge zuordnen.
  Speicherung von Buchung und Zuordnungen erfolgt gemeinsam in einer Transaktion.
  Auslastungen basieren auf den tatsächlich zugeordneten Beträgen.
- **Dashboard und Berichte:** Auswertungen der freigegebenen Webbuchungen,
  Monatsverlauf sowie Filter nach Zeitraum, Sphäre und Zuordnung. Der Dashboard-Saldo
  beginnt mit den gespeicherten Webbuchungen; ein Desktop-Anfangsbestand wird nicht importiert.
  CSV-Export übernimmt alle aktiven Filter und signierte Bruttobeträge; Texte werden für Tabellenprogramme maskiert. PDF/XLSX und Tätigkeitsberichte folgen separat.

- **Belege:** PDF, PNG, JPEG und WebP bis 10 MB zu bestehenden Buchungen hochladen,
  im Originaldialog ansehen und herunterladen. Dateiinhalte werden tatsächlich geprüft;
  die Originalbytes bleiben unverändert in PostgreSQL. Admin darf Dateien löschen,
  Editor Dateien nur zu selbst erstellten Buchungen hinzufügen. Alle Lesezugriffe prüfen
  Vereinszugehörigkeit und Rolle.
- **Dauerbuchungen:** Admin verwaltet Vorlagen und kann einzelne Fälligkeiten explizit
  buchen oder überspringen. Wiederholte/gleichzeitige Ausführung erzeugt keine Doppelbuchung.
  Editor kann die Übersicht lesen. Es läuft kein automatischer Hintergrund-Buchungslauf.
  Steueraufteilung und Zuordnungen in Dauerbuchungsvorlagen folgen separat.
- **Einstellungen:** Die ursprüngliche Einstellungsnavigation, Farbschemata und
  Navigationsauswahl werden wiederverwendet. Darstellung, Menüposition und Iconfarben
  sind pro Benutzer gespeichert und werden nach Anmeldung auf weiteren PCs geladen.
  Arbeitsweise und Tabelleneinstellungen werden ebenfalls pro Benutzer gespeichert;
  die klassische Buchungsliste übernimmt Ansicht, Spalten, Zeilendichte, Zeilenstil,
  Datumsformat und Seitenumfang direkt.
  Konto/Passwort und Benutzerverwaltung sind im selben Einstellungsdesign unter „Zugang“ eingebettet.
  Unter „Verein“ verwaltet der Admin Konten, Kategorien, Geschäftspartner, Tags und Organisationsdaten;
  Editor hat Lesezugriff, User keinen Zugriff auf gemeinsame Stammdaten. Konten, Kategorien,
  Geschäftspartner und Tags lassen sich bearbeiten, archivieren und reaktivieren. Versionsprüfungen
  verhindern das Überschreiben zwischenzeitlicher Änderungen. Organisationsname, Anschrift, Kassier,
  Logo und Freistellungsbescheid werden zentral gespeichert.
  Die Stammdatenverwaltung ist noch nicht durchgängig mit Buchungserfassung und Bankimport verknüpft.
  Freie Kategorien ändern insbesondere nicht die derzeit festen steuerlichen Sphären; ein Wechsel
  zur allgemeinen Budgetverwaltung wird noch nicht angeboten. Desktop-Pfade, Betriebssystem-Integration
  und weitere fachliche Einstellungen folgen schrittweise.

- **Bankimport (CSV):** Admin lädt eine CSV hoch, prüft Spaltenzuordnung und Vorschau
  und übernimmt die gültigen Zeilen als offene Bankbelege. Einzelne Bankbelege werden
  anschließend ausdrücklich als Buchung erfasst; Datum, Betrag und Zahlweg bleiben an
  den Bankbeleg gebunden. Editor kann Umsätze lesen. Import und Buchungsübernahme sind
  gegen gleichzeitige Verarbeitung geschützt. Gleiche Dateien werden über Zeilenmerkmale
  erkannt, übersprungene Duplikate angezeigt. Identische Zeilen innerhalb einer Datei
  bleiben ohne eindeutige Bankreferenz durch ihre laufende Vorkommensnummer getrennt.
  Überlappende Auszüge ohne zuverlässige Referenzen müssen anhand der Duplikatliste
  geprüft werden; identische Zahlungen lassen sich dort nicht immer eindeutig zuordnen.
  Unterstützt werden EUR, das gemeinsame Bank-Zahlverfahren und maximal 5000 CSV-Zeilen.
  CAMT, mehrere verwaltete Bankkonten, Zuordnung zu vorhandenen Buchungen und KI-Abgleich
  folgen separat.

User bleiben auf eigene Entwürfe beschränkt. Die neuen Endpunkte prüfen Rollen und
Vereinszugehörigkeit; veraltete Änderungen an Stammdaten und Buchungen ergeben einen
Konflikt. Entwürfe unterstützen derzeit noch keine Budget-/Zweckbindungszuordnungen.
Die Migrationen `004_planning.sql` bis `011_web_extended_settings.sql` ergänzen bestehende
Webinstallationen beim Containerstart ohne Datenlöschung.

## Bewusst noch nicht Teil dieses Piloten

- Vollständige Übernahme des Desktop-Buchungsmodells (Steuern, Umbuchungen,
  Jahresabschluss und Storno).
- SQLite-Import, Synchronisation und Anschluss bestehender Desktop-Installationen.
- Beitragsabrechnung, PDF-/XLSX-Berichtsexport und Tätigkeitsberichte, Rechnungs-OCR, CAMT-Bankimport und KI.
- Automatisierte Backup-Zeitpläne und Beleg-OCR.

Die Pilotbuchungen liegen in eigenen `web_*`-Tabellen. Sie dürfen erst nach Abgleich
aller Fachregeln und geprüfter Migration als Ersatz der produktiven Buchführung
verwendet werden. Die Desktop-Version behält ihren bisherigen API- und Datenbankpfad.

## Entwicklung und Tests

```sh
npm ci --prefix backend
npm ci --prefix web
DATABASE_URL=postgresql://... npm run migrate:dev --prefix backend
DATABASE_URL=postgresql://... APP_ORIGIN=http://localhost:5173 COOKIE_SECURE=false \
  SETUP_TOKEN=<zufälliger-einrichtungstoken> npm run dev --prefix backend
# In einem zweiten Terminal (Backend standardmäßig Port 3000):
npm run dev --prefix web
```

Builds: `npm run build --prefix backend` und `npm run build --prefix web`.
Adaptertests: `npm run test:adapter --prefix web`. Der Web-Build benötigt den vollständigen
Checkout, da Komponenten, Typen und Bilder mit der Desktop-Version geteilt werden.

Die Backend-Integrationstests benötigen eine **entbehrliche Testdatenbank**:
Der Auth-Test leert die Organisationstabellen; Workflow-Tests verwenden ein eigenes
Schema. Niemals DATABASE_URL einer produktiven Installation hierfür verwenden.

```sh
DATABASE_URL=postgresql://... npm run migrate:dev --prefix backend
TEST_DATABASE=1 DATABASE_URL=postgresql://... TEST_DATABASE_URL=postgresql://... \
  npm test --prefix backend
```

Ohne explizite Datenbankvariablen werden Integrationstests übersprungen; das ist kein
Nachweis für einen geprüften Mehrbenutzerbetrieb. Der GitHub-Workflow `Web pilot checks`
führt sie mit PostgreSQL 16 aus und baut die Container.

Die Browserprüfungen starten über das Web-Paket:

```sh
# Playwright-Browser einmalig installieren:
(cd web && npx playwright install chromium)
# Vite für diese Prüfungen auf localhost:5174 starten.
npm run test:browser --prefix web
# Frischer, entbehrlicher Backend-Datenbestand, APP_ORIGIN=http://localhost:5174
# und SETUP_TOKEN=pilot-browser-setup-token-123456 erforderlich:
PILOT_E2E=1 npm run test:live --prefix web
```

Ein bereits installiertes Chromium kann mit `PLAYWRIGHT_CHROMIUM_EXECUTABLE` angegeben
werden. Der Live-Test verwendet ausschließlich die dokumentierten Testkonten und
soll nie gegen einen bestehenden Vereinsdatenbestand laufen.
