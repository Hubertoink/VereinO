# Web: Aktualisierung, KI und Organisationsprofile

Nachfolgeänderung: Organisationsarten sind jetzt bei Erstellung festgelegt; statt
Profilwechsel werden mehrere Organisationen unterstützt. Siehe [Organisationsworkflow](WEB_ORGANIZATIONS.md).

Automatische Aktualisierung, KI-Anbindung und Organisationsprofile NONPROFIT/GENERAL
mit Oberfläche, Datenmodell, Rollenprüfung, Tests und lokalem Docker-Teststand.
Lokaler Docker-Teststand aktualisiert. Keine Veröffentlichung/kein Git-Push erfolgt.

## Implementiert

- Klassisches Originaljournal ohne Aktualisieren-Button; Aktualisierung nach
  Datenänderungen, bei Fokus/Sichtbarkeit und alle 30 Sekunden im sichtbaren Tab.
- Migration 012: Organisationsprofil mit Admin-Schreibrecht, Versionsschutz und Audit;
  zusätzliche Kategoriezuordnung für Buchungen/Entwürfe, ohne alte Sphären zu löschen.
- Profilwahl in Ersteinrichtung und Organisationsdaten; Navigation blendet Mitglieder
  in GENERAL aus. Journal/Plus warten auf Profil und behandeln Ladefehler sichtbar.
- Kategorien durch Buchungserfassung, Listen, Suche, Filter, Auswertung und CSV-Export.
  Archivierte Namen bleiben sichtbar. Freigaben erhalten historische Kategorien auch
  nach Profilwechsel/Archivierung. Dauerbuchungen speichern/übertragen Kategorie-IDs.
  Bankimport nutzt denselben Kategoriepfad; PostgreSQL-Test prüft Kategorieübernahme
  und Ablehnung einer Kategorie aus fremder Organisation.
- Lokale Muster getrennt je Organisation/Benutzer. Lernen erst nach erfolgreichem
  Web-Save. Unverfügbare Tags/Transfers/Konten/Zuordnungen werden nicht vorgeschlagen;
  GENERAL erhält keine Sphärenvorschläge.
- Migration 013: KI-Einstellungen, Admin-Schreibrecht, Versionsschutz, Audit ohne
  Schlüssel. AES-256-GCM mit Organisations-/Providerbindung; AI_ENCRYPTION_KEY.
- Providertransport: feste URLs, Timeout, begrenzte Antwortgröße, sichere Fehler;
  Responses für OpenAI/MiniMax wie Desktop, Chat Completions für Mittwald.
- Einstellungsoberfläche unter KI-Muster und Admin-Verbindungstest.
- KI-Textassistenz mit Original-KI-CSS/Markdown, Navigation und Journal-Einstiegen.
  User-Kontext: bis zu 50 eigene Entwürfe; Admin/Editor: Summen + letzte 100 Buchungen.
  Kontextumfang ist sichtbar. Fragen nutzen frischen Kontext und die letzten maximal
  zehn Nachrichten des laufenden Gesprächs (begrenzte Textlänge, keine Persistenz).
- Beleganalyse für PDF/Bilder, strenge Ergebnisvalidierung, Prüfung im Originalformular.
  User speichern Entwürfe. Warnungen sichtbar; fehlendes Datum bleibt leer.
- Migration 014: temporärer Analysebeleg mit Eigentümer; atomare Zuordnung zu
  Buchung/Entwurf, Belegübernahme bei Freigabe, Schutz vor doppelter Verwendung.
- Mittwald-PDF: Poppler rendert alle Seiten, maximal 12, keine stille Teilanalyse.
  Temporärdateien werden entfernt; Original-PDF bleibt als Beleg gespeichert.
- Web-Rechnungseinstieg unterstützt mehrere Dateien nacheinander. Migration 015
  speichert Analyseergebnisse für eine benutzereigene Prüfliste (24 Stunden), die
  Seitenwechsel übersteht. Einzeln prüfen/übernehmen/verwerfen; verbuchte oder
  Entwürfen zugeordnete Dateien verschwinden aus der Liste. Electron-Steuerung
  bleibt ausschließlich in der Desktop-App.

## Vorliegende Nachweise

- PostgreSQL-Tests in temporären Schemas: webProfiles, aiWorkflow, recurring,
  bankImport; Rechte, Organisationstrennung, Konflikte, Kategorien, Freigabe,
  Originalbelegabruf und Rollback von Eintrag/Nummernsequenz bestanden.
- Unit-Tests: aiSecrets, aiProvider, aiInvoice, aiPdf; echte lokale PDF-Rasterung,
  Providerantworten simuliert. Kein kostenpflichtiger Provideraufruf durchgeführt.
- Web-Adapter-/CSV-/Muster-Tests bestanden; Browserprüfung des klassischen Journals,
  beider Berichtsprofile, Buchungsabläufe aller Rollen, Dauerbuchungen aller Rollen.
- AI-Browserprüfung: Navigation, Frage/Antwort, Upload, Review, fehlgeschlagener Save
  ohne Musterlernen, erfolgreicher Entwurf mit Kategorie/Dokument-ID.
- Backend-/Web-Builds und Desktop-Typecheck bestanden. Abschließende vollständige
  Browsersuite bestanden, ebenso alle 16 Adaptertests. KI-Prüfliste zusätzlich
  mit Mehrfachupload, Neuladen, Verwerfen und Übernahme im Browser geprüft.
- Browserprüfung profile-settings-smoke: Profilwechsel aktualisiert Navigation und
  Organisationsdaten; GENERAL blendet Spenden/Steuerbescheid aus und verwendet
  Organisationsbezeichnungen. KI-Einstellungen speichern und Verbindungstest
  (simuliertes Backend) bestanden.

- Vollständige backend/tests-Suite: 28 Tests mit echten isolierten PostgreSQL-
  Schemas bestanden. Standard-Browsersuite (Buchungen, Mitglieder, Berichte,
  Belege, Dauerbuchungen, Einstellungen, Bankimport und CSV-Export) bestanden.
- Neue Journal-/KI-/Profile-Tests sind im regulären test:browser-Skript enthalten.

- Beide Journals: Profilwechsel bis Buchungserfassung und Rechnungseinstieg im
  Browser geprüft. Plus erhält automatische Aktualisierung bei Fokus/Sichtbarkeit
  und alle 30 Sekunden. KI-Folgefrage übermittelt begrenzten Verlauf; Browser geprüft.

- Textbasierte Buchungsvorschläge: `/ai/booking-proposal` validiert Beträge/Datum/
  Kategorie und erzeugt noch keinen Eintrag. UI öffnet Originalformular, User
  speichern Entwürfe. HTTP-Test prüft fehlende Schreibwirkung, Browser prüft
  Übernahme und dass keine alte Analyse-Datei wiederverwendet wird. Builds bestanden.

## Umfang und Grenzen

Die Web-KI unterstützt Fragen, Folgefragen, geprüfte Buchungsvorschläge und
Beleganalyse mit Mehrfachauswahl. Sie führt keine autonomen Änderungen oder
Löschungen aus. Der allgemeine Desktop-KI-Aktionsagent ist nicht Teil dieser
Web-Anbindung. Freigaben bleiben im rollenbasierten Entwurfsworkflow.
Ein echter Provideraufruf steht aus: Ein Admin muss den gewünschten Anbieter
und API-Schlüssel in den KI-Einstellungen konfigurieren. Transport und
Fehlerverhalten sind mit simulierten Providerantworten getestet.

## Docker-Stand

Am 2026-09-16 abschließend gebaut und unter http://localhost:8080 bereitgestellt.
Migrationen 012–015 angewendet; Backend/PostgreSQL gesund. Echter Browsercheck
mit Admin, Editor und User: Anmeldung, KI-Seite, Profil-/KI-Einstellungen,
Prüfliste und Buchungszugriff (User 403) bestanden. Keine echten Provideraufrufe.
Vorheriges PostgreSQL-Backup: `/tmp/vereino-before-profile-ai.dump`, Inhaltsverzeichnis
mit pg_restore erfolgreich geprüft. Bestehende Datenbank bleibt erhalten.
Lokale `.env.web` enthält den persistenten AI_ENCRYPTION_KEY (nicht ausgeben).
Compose reicht ihn durch; Backend-Image enthält Poppler; Proxy-Timeout 120 Sekunden.

## API-Referenz

https://developers.openai.com/api/reference/typescript/resources/beta/subresources/responses/methods/create
