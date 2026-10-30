# VereinO Sync – Vorschlag

Stand: 30. Oktober 2026. Architekturvorschlag, noch nicht implementiert oder bereitgestellt.

## Empfehlung

Die lokale SQLite-Datenbank bleibt erhalten. Jeder verbundene Rechner bekommt eine lokale Kopie desselben Vereinsbestands. Mittwald speichert ausschließlich verschlüsselte Nutzdaten und die für den Abgleich notwendigen Metadaten. Entschlüsselung und Buchhaltungslogik laufen in VereinO auf dem Gerät.

Als erste Version empfehle ich einen **versionierten Snapshot-Sync für abwechselndes Arbeiten an mehreren Geräten**. Das passt zur vorhandenen Architektur und hält die Datenübernahme überschaubar. Gleichzeitiges Bearbeiten mit automatischer Zusammenführung wäre eine zweite, wesentlich größere Ausbaustufe. Wenn mehrere Personen von Anfang an gleichzeitig buchen sollen, sollte direkt diese zweite Architektur umgesetzt werden.

Ein Auth-Token kontrolliert nur den Serverzugang. Für Ende-zu-Ende-Verschlüsselung braucht es einen unabhängigen, zufällig erzeugten Schlüssel, den der Server niemals erhält.

## Ausgangslage im Repository

- `electron/main/db/database.ts`: SQLite mit WAL und Fremdschlüsseln, eigener Datenordner je Organisation, separate Dateien unter `files/`.
- `electron/main/services/backup.ts`: Online-Backup über `better-sqlite3` und Kopieren der Anhänge. Nützliche Grundlage; der vorhandene Fallback zum direkten Kopieren der offenen Datenbank ist für Sync ungeeignet. Datenbank und Dateien müssen als zusammengehöriger Stand erfasst werden.
- Belegverweise enthalten lokale Dateipfade. Im Transportformat braucht es portable Datei-IDs; beim Einspielen werden die lokalen Pfade neu aufgebaut.
- Einstellungen enthalten auch gerätegebundene Geheimnisse, etwa KI-Zugänge und den lokalen MCP-Token. Ein unverändertes Hochladen der kompletten Datenbank ist deshalb kein geeigneter Sync-Export.
- `backend/` enthält bereits Fastify, PostgreSQL und JWT-Authentifizierung, aber fachliche Klartext-Endpunkte. Das ist noch kein E2E-Sync. Framework und Betriebswissen sind wiederverwendbar; Datenmodell, Authentifizierung und Endpunkte müssen für den verschlüsselten Dienst separat entwickelt und geprüft werden.

## Schlüssel, Geräte und Wiederherstellung

1. Beim Aktivieren erzeugt das erste Gerät eine kryptografisch zufällige Vault-ID und einen zufälligen 256-Bit-Vereinsschlüssel. Jeder Verein erhält einen eigenen Vault und eigene Schlüssel.
2. Jedes Gerät besitzt einen eigenen widerrufbaren Serverzugang. Für das MVP sind zufällige Bearer-Tokens mit serverseitig gespeichertem Hash möglich; ein Login kann später kurzlebige Access-Tokens und rotierende Refresh-Tokens ausstellen. Verschlüsselungsschlüssel und Auth-Tokens bleiben strikt getrennt. Ein Login-Reset entschlüsselt keine Daten.
3. Datenstände und Belege werden vor dem Upload authentifiziert verschlüsselt. Vorschlag: libsodium `secretstream` mit XChaCha20-Poly1305, separater Ableitung je Verwendungszweck und frischem Stream-Header je Datei. Vault-ID, Formatversion und Objekt-ID werden authentifiziert eingebunden. Das verschlüsselte Manifest enthält Belegnamen, Prüfsummen, Schema-Version und Vorgängerstand. Die Bibliothek erkennt manipulierte bzw. unvollständige Streams; Clients müssen den finalen Abschluss-Tag verlangen. [Libsodium-Dokumentation](https://doc.libsodium.org/secret-key_cryptography/secretstream)
4. „Gerät verbinden“ verwendet einen einmaligen, kurz gültigen Pairing-Vorgang. Das neue Gerät erzeugt lokal ein Schlüsselpaar; das vorhandene Gerät verifiziert dessen öffentlichen Schlüssel über einen lokal angezeigten QR-Code oder einen auf beiden Geräten verglichenen Fingerabdruck. Erst dann überträgt es den Vereinsschlüssel verschlüsselt an dieses Gerät und autorisiert dessen eigenen Serverzugang. Ein kurzer Pairing-Code dient nur zur Zuordnung, nicht als Verschlüsselungsschlüssel. Die konkrete Protokollwahl benötigt vor Umsetzung eine Sicherheitsprüfung; keine selbst entworfene Kryptografie.
5. Schlüssel und Geräte-Tokens liegen außerhalb der synchronisierten Datenbank im geschützten lokalen Speicher. Electron `safeStorage` bietet betriebssystemabhängigen Schutz. Unter Linux darf ein ungeschütztes Backend wie `basic_text` nicht still akzeptiert werden; dann ist ein unterstützter Schlüsselspeicher oder eine explizite Entsperrung pro Sitzung nötig. [Electron-Dokumentation](https://www.electronjs.org/docs/latest/api/safe-storage)
6. Beim Einrichten wird ein zufälliges Wiederherstellungsgeheimnis zum Offline-Aufbewahren ausgegeben. Damit wird eine serverseitig ausschließlich verschlüsselt gespeicherte Kopie des Vereinsschlüssels geschützt. Zusätzlich braucht es eine unabhängige Möglichkeit, den Serverzugang wiederherzustellen, etwa ein gesondertes Wiederherstellungs-Credential. Das Geheimnis zur Entschlüsselung darf auch bei der Wiederherstellung niemals an den Server geschickt werden. Der Ablauf muss mit einem frischen Gerät getestet werden.
7. Fehlen alle entsperrbaren Geräte und das Wiederherstellungsgeheimnis, können auch Betreiber und Support die Inhalte nicht wiederherstellen. Beim Entfernen eines Geräts wird sein Token widerrufen; für den Schutz künftiger Daten vor einem zuvor berechtigten Gerät muss zusätzlich der Vereinsschlüssel rotiert und an die verbleibenden Geräte verteilt werden. Bereits heruntergeladene Inhalte lassen sich nicht zurückrufen.

## Sync-Ablauf der ersten Version

1. Ein vorhandener Verein wird nach lokalem Backup einem neuen Vault zugeordnet. Ein zweites Gerät lädt diesen Vault als eigene lokale Organisation; es vermischt ihn nicht automatisch mit einer vorhandenen lokalen Buchhaltung.
2. Vor Arbeitsbeginn fragt der Client den aktuellen Serverstand ab. Ein neuer Stand wird vollständig heruntergeladen, entschlüsselt und geprüft. Bei lokalen Änderungen wird die Übernahme blockiert und ein Konflikt angezeigt.
3. Eine serverseitige, zeitlich begrenzte Schreibberechtigung mit Erneuerung zeigt an, welches Gerät gerade bearbeitet. Andere Geräte können lesen. Alle schreibenden Wege müssen diese Regel beachten: auch Import, KI-Werkzeuge, Dauerbuchungen, Hintergrundjobs und separate Buchungsfenster.
4. Für einen Export werden lokale Schreibvorgänge kurz gesperrt, eine konsistente SQLite-Sicherung erstellt und die dazugehörigen Dateien gesichert. In der Exportkopie bleiben nur synchronisierbare Fachdaten und ausdrücklich freigegebene Einstellungen. Geheimnisse, lokale Pfade und gerätespezifische Optionen werden ausgefiltert. Die Exportkopie wird bereinigt bzw. neu aufgebaut, sodass entfernte Geheimnisse auch nicht in freien SQLite-Seiten verbleiben.
5. Der Client verschlüsselt den Datenstand und neue Belege. Bereits veröffentlichte verschlüsselte Belegobjekte sind unveränderlich und können wiederverwendet werden. Zuordnung und Klartext-Prüfsummen bleiben im verschlüsselten Manifest. Temporäre Klartextdateien liegen zugriffsbeschränkt lokal und werden nach Abschluss entfernt.
6. Uploads landen zunächst als unvollständige Transaktion auf dem Server. Erst wenn alle referenzierten Objekte vorhanden sind, wird der neue Stand atomar veröffentlicht. Der Client sendet dabei seine Basisrevision und einen Idempotenzschlüssel. Der Server nimmt den Commit nur an, wenn die Basisrevision noch aktuell und die Schreibberechtigung gültig ist. Andernfalls antwortet er mit einem Konflikt. Netzwerkfehler und Wiederholungen dürfen weder doppelte Commits noch Teilstände erzeugen.
7. Andere Geräte prüfen beim Öffnen, beim erneuten Verbinden und in kurzen Intervallen auf Änderungen. Lokale Revision und Dirty-Status werden dauerhaft geführt. Änderungen nach einem laufenden Export bleiben als noch nicht synchronisiert markiert.
8. Ein Download ersetzt niemals die gerade geöffnete SQLite-Datei. Zuerst Entschlüsselung, Manifest-, Datei-, Schema-, Integritäts- und Fremdschlüsselprüfung in einem temporären Verzeichnis; anschließend lokales Backup, Schreibstopp, Schließen aller DB-Verbindungen und absturzsicherer Austausch von Datenbank und Dateien. Ein Wiederanlaufprotokoll stellt nach einem Absturz entweder den alten oder den neuen vollständigen Stand her. Lokale Einstellungen werden erhalten, UI und Caches danach neu geladen.

**Konfliktbeispiel:** Laptop und PC starten bei Revision 12. Der Laptop veröffentlicht Revision 13. Der PC hat offline weitergearbeitet und versucht ebenfalls einen Nachfolger von 12 zu veröffentlichen. Das wird abgelehnt. VereinO bewahrt beide Stände auf; es gibt kein stilles „letzter Upload gewinnt“. Für Version 1 erfolgt die Auflösung ausdrücklich durch Auswahl eines Bestands mit Sicherung des anderen bzw. Übernahme fehlender Buchungen. Offline-Bearbeitung ist damit möglich, aber nicht automatisch zusammenführbar. Ein abgelaufenes Schreib-Lease allein löst dieses Problem nicht.

Historische Revisionen ermöglichen eine Wiederherstellung, ersetzen jedoch keine unabhängigen Backups. Ältere Clients dürfen unbekannte Schema-Versionen nicht einspielen oder überschreiben. Eine Wiederherstellung wird als neue Revision veröffentlicht und nicht durch Zurücksetzen des Revisionszählers durchgeführt.

## Mittwald-Betrieb

Der Screenshot nennt Projekt `p-gn5trd` und den A-Record `185.215.158.240`. Daraus lassen sich weder gebuchter Tarif noch Container-Freigabe, Speicherplatz, Domain-Zuordnung oder vorhandene Datenbanken ablesen. Diese Voraussetzungen müssen vor einer Bereitstellung im mStudio geprüft werden.

Vorgeschlagene Komponenten:

| Komponente | Aufgabe |
| --- | --- |
| HTTPS-Domain, beispielsweise `sync.vereino.de` bei verfügbarer Domain | TLS-Terminierung und Weiterleitung an die Sync-API |
| Node.js/Fastify-Container | Gerätezugang, Pairing, Berechtigungen, Uploads, Revisionen und Quoten |
| PostgreSQL im internen Netz | Vaults, Geräte, Token-Hashes, Revisionen, Uploadstatus und verschlüsselte Schlüsselpakete |
| Persistentes Datei-Volume | Verschlüsselte Datenstände und Belegobjekte unter zufälligen IDs |
| Backup-Job | Konsistente PostgreSQL-Dumps und Sicherung der zugehörigen verschlüsselten Objekte |

Mittwald dokumentiert PostgreSQL über Container; Container-Hosting ist nicht in jedem Tarif enthalten. [PostgreSQL bei Mittwald](https://developer.mittwald.de/docs/v2/platform/databases/postgresql/)

Persistente Volumes und HTTP-Ingress werden unterstützt. Die API erhält die öffentliche HTTPS-Route; die Datenbank bleibt intern erreichbar. Die IP allein ist kein API-Endpunkt: DNS, Domain-Zuordnung und TLS-Zertifikat gehören zum Setup. [Mittwald Container-Dokumentation](https://developer.mittwald.de/docs/v2/platform/workloads/containers/)

Für Datenbank-Container reichen Dateisystemkopien allein nicht als konsistentes Backup. SQL-Dumps, Objekt-Aufbewahrung und Wiederherstellung müssen zusammen geplant und getestet werden. [Mittwald Backup-Anleitung](https://developer.mittwald.de/de/docs/v2/guides/operations/database-container-backups/)

Jeder API-Aufruf prüft die Vault-Berechtigung des Geräts. Upload-Größen und Speicherquoten werden begrenzt; Pairing erhält Ablaufzeit und Rate-Limits. Tokens, Request-Inhalte, Schlüssel und sensible URLs dürfen nicht in Logs erscheinen. Support sieht Betriebszustand und Speicherverbrauch, keine Buchhaltung.

## Was „Betreiber kann nicht mitlesen“ bedeutet

Der Dienst und seine Backups enthalten keine Schlüssel zum Entschlüsseln der Buchhaltungsdaten. Sichtbar bleiben notwendige Metadaten, etwa Gerätezugriffe, IP-Adressen, Zeitpunkte, Revisionen und Datenmengen. Die lokale SQLite-Kopie ist dadurch noch nicht verschlüsselt; lokaler Datenschutz und Vollverschlüsselung des Geräts bleiben ein separates Thema.

E2E schützt nicht vor einem kompromittierten Endgerät oder einer manipulierten App-Version. Als Herausgeber der App könnte ein Betreiber grundsätzlich schädlichen Client-Code verteilen; die Zusage muss deshalb auf die überprüfte Client- und Schlüsselarchitektur bezogen sein. Signierte Releases, überprüfbare Änderungen und eine Sicherheitsprüfung gehören dazu. Bereits bestehende optionale KI-Funktionen sind ein separater Datenfluss zu ihrem Anbieter; E2E-Sync macht diesen nicht automatisch vertraulich gegenüber dem KI-Anbieter.

Authentifizierte Verschlüsselung erkennt Manipulation innerhalb eines Objekts, verhindert aber allein keinen Server-Rollback auf einen alten gültigen Stand. Clients müssen zuletzt bestätigte Revisionen und eine authentifizierte Vorgängerkette behalten und Rücksprünge melden. Ein ganz neues Gerät braucht dafür einen vertrauenswürdigen Checkpoint aus dem Pairing; vollständige Erkennung unterschiedlicher Serveransichten erfordert weitergehenden Geräteabgleich.

## Zweite Stufe: paralleles Arbeiten

Für automatisches Zusammenführen brauchen die Fachobjekte globale IDs statt nur lokaler Integer-IDs, Versionsstände, Löschmarkierungen und ein dauerhaftes Änderungsjournal. Jede lokale Transaktion schreibt ihre Sync-Änderungen atomar in eine Outbox; der Server verteilt verschlüsselte Änderungspakete. Clients übernehmen sie idempotent und transaktional.

Unabhängige Änderungen können zusammengeführt werden. Gegensätzliche Änderungen an derselben Buchung müssen sichtbar aufgelöst werden. Buchung plus Zuordnungen und Belege bleiben eine fachliche Einheit; Belegnummern, Jahresabschluss, Löschungen und Bankimport-Dubletten brauchen eigene Regeln. Ein pauschales CRDT oder „last write wins“ ist dafür keine ausreichende Lösung. Der Server kann verschlüsselte Buchhaltungsinhalte nicht fachlich validieren; diese Prüfung erfolgt auf den Geräten.

## Umsetzung und Abnahme

1. Portables Export-/Importformat mit Allowlist für Einstellungen, konsistenten Belegen und absturzsicherer Wiederherstellung schaffen.
2. Kryptografie, lokalen Schlüsselspeicher, Geräte-Pairing und Wiederherstellung als isolierten Prototyp implementieren und prüfen lassen.
3. Separaten Sync-Dienst mit Vault-Isolation, Uploadabschluss, atomarem Revisionsvergleich, Geräte-Widerruf und Backups bauen.
4. Einstellungen „Synchronisierung“ ergänzen: aktivieren, Gerät verbinden, Wiederherstellungsschlüssel sichern, Geräte entfernen und Status anzeigen. Zustände: aktuell, lokale Änderungen, offline, synchronisiert gerade, Konflikt und Fehler.
5. Mit zwei getrennten Geräteprofilen testen: Neuaufnahme, Wechsel zwischen Geräten, Offline-Änderungen, parallele Uploads, Prozessabbruch während Übernahme, ungültige Schlüssel, manipulierte Dateien, fehlende Belege, gesperrte Geräte, inkompatible Versionen und Wiederherstellung nach komplettem Geräteverlust. Serverdatenbank, Dateien und Logs auf Klartextinhalte prüfen; außerdem bestehende Buchhaltungsregeln und lokale Einstellungen nach Sync verifizieren.
6. Erst danach im bestätigten Mittwald-Projekt bereitstellen und mit einem Testverein erproben.

Die erste Version liefert Gerätewechsel mit Konfliktschutz. Gleichzeitiges automatisches Zusammenführen ist ausdrücklich nicht Bestandteil dieser Stufe.

## Entfernung der Einreichungen

Die Desktop-Funktion einschließlich Navigation, Dashboards, Tastenkürzel, Import/Export, Freigabe und IPC-API wurde entfernt. Historische Tabellen und Migrationen bleiben für Bestandsdaten und Backups erhalten. Referenzprüfungen auf alte Einreichungen und die Darstellung historischer Audit-Einträge bleiben ebenfalls bestehen. Bereits daraus erzeugte Buchungen werden nicht verändert.

`submission-web/` bleibt als gekennzeichneter historischer Prototyp im Repository. Ein eventuell laufendes öffentliches Portal wurde mit dieser Codeänderung nicht abgeschaltet. Der Sync ist ein Vorschlag; es wurden weder Hosting-Ressourcen angelegt noch Daten hochgeladen.
