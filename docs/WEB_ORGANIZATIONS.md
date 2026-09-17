# Organisationen in VereinO Web

## Ablauf

1. Beim ersten Start legt die Einrichtung eine Organisation und den ersten Admin
   an. Name und Organisationsart (Vereinsverwaltung / allgemeine Budgetverwaltung)
   werden gemeinsam gespeichert. Die Organisationsart ist danach unveränderlich.
2. Oben links öffnet der Organisationsname die Liste der eigenen freigegebenen
   Organisationen. Der aktive Zugang und seine Rolle sind erkennbar.
3. Ein Admin kann dort „Organisation erstellen“ wählen. Der Dialog erklärt die
   beiden Organisationsarten und die dauerhafte Festlegung.
4. Der erstellende Admin erhält automatisch Admin-Zugang. Weitere aktive Benutzer
   der aktuellen Organisation können einzeln ausgewählt werden, mit eigener Rolle
   für die neue Organisation. Standardmäßig wird niemand zusätzlich übernommen.
   Es werden keine Buchungen, Stammdaten, Belege oder KI-Schlüssel kopiert.
5. Nach dem Erstellen erscheint die neue Organisation im Dropdown. Die aktuelle
   Organisation bleibt ausgewählt, bis der Benutzer bewusst wechselt. Beim Wechsel
   wird die Oberfläche vollständig neu geladen; Navigation, Rollen, Formulare,
   Filter und Organisationsdaten werden aus dem neuen Kontext geladen.
6. In den Einstellungen werden Name, Anschrift und Finanzverantwortliche Person
   zusammen gespeichert. Logo und Vereinsbescheid haben eigene Bereiche. Der
   Organisationstyp wird als feste Information angezeigt. Vereinsbescheide und
   Vereinsfunktionen erscheinen nur für Vereinsverwaltung.

## Berechtigungen und Daten

- Ein Konto kann mehrere Organisationszugänge mit unterschiedlichen Rollen haben.
- Die Benutzerverwaltung zeigt die Mitglieder der aktiven Organisation. Ändern von
  Rolle oder Aktivität wirkt nur dort; der letzte aktive Admin bleibt geschützt.
- Das Passwort gehört zum Konto, nicht zur Organisation. Ein Admin kann ein Konto
  mit weiteren Organisationszugängen nicht per Passwortreset übernehmen. Solche
  Benutzer ändern ihr Passwort selbst unter „Mein Konto“.
- Ein Wechsel prüft die aktive Mitgliedschaft und ersetzt die Sitzung. Alte Tabs
  senden weiterhin ihre erwartete Organisations-ID; bei Abweichung werden Lesen
  und Schreiben mit einer Aufforderung zum Neuladen abgewiesen.
- API-Rechte und Datenabfragen verwenden die Rolle und Organisation aus der
  authentifizierten Mitgliedschaft, nicht aus Benutzerangaben im Request-Body.
- Darstellungsvorlieben und Passwort bleiben kontobezogen. Fachliche Einstellungen,
  Buchungen, Entwürfe, KI-Schlüssel und Stammdaten bleiben organisationsbezogen.

## Migration und Prüfung

Migration 016 übernimmt die bisherige Organisation/Rolle/Aktivität jedes Kontos in
Mitgliedschaften und ergänzt den Organisationskontext vorhandener Sitzungen.
Migration 017 fixiert das vorhandene Verwaltungsprofil; fehlende Altprofile werden
als Vereinsverwaltung übernommen. Migration 018 löst die alte globale Deaktivierung
vom Organisationszugang, damit gesperrte Altbenutzer später gezielt reaktiviert
werden können. Ihre Mitgliedschaften bleiben bis dahin inaktiv. Buchungen und
bisherige Kategorien bleiben erhalten.

Backend-Integrationstest `backend/tests/organizations.test.ts`: Altbestandmigration,
Profiländerungsverbot, Rollenschutz, ausgewählte Mitgliedschaften, Fremdzugriffe,
Sitzungsrotation, alte Tabs, Datenisolation und organisationsbezogene Deaktivierung.
Browserprüfung `web/test/profile-settings-smoke.mjs`: Erstellung, Benutzer-/Rollenauswahl,
Organisationswechsel, unveränderliche Art, angepasste Navigation und responsive Formulare.

## Lokaler Teststand

Docker unter http://localhost:8080 aktualisiert. Backend und PostgreSQL gesund.
29 Backend-Tests mit isolierten PostgreSQL-Schemas, vollständige Browser-Suite,
Backend-/Web-Build und Desktop-Typecheck bestanden. Echte Docker-Anmeldung mit
Admin, Editor und User sowie Dropdown, Erstellungsdialog und feste Organisationsart
geprüft. Für diese Prüfung wurden keine zusätzlichen Organisationen im echten
Testbestand angelegt. Backup vor der Migration: `/tmp/vereino-before-multiorg.dump`.
