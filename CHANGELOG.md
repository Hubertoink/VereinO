# Changelog

Alle nennenswerten Änderungen an VereinO werden in dieser Datei dokumentiert.

Das Format basiert auf [Keep a Changelog](https://keepachangelog.com/de/1.1.0/)
und dieses Projekt folgt [Semantic Versioning](https://semver.org/lang/de/).

## [2.9.9] - 2026-07-18

### Hinzugefügt

- Mitglieder: Die Empfänger eines Einladungs-Batches können vor dem Versand in einer eigenen Liste geprüft werden.
- Rechnungserfassung: Einzelrechnungen werden wie Batch-PDFs anhand des gespeicherten Belegs auf mögliche Duplikate geprüft.

### Geändert

- Buchungserfassung: Das Kompakt-Flyout ist für neue Profile die Standarddarstellung; vorhandene Einstellungen bleiben erhalten.
- Buchungs-Flyout: Budget- und Zweckbindungszeilen verwenden einheitliche Feldhöhen, und bei Nettobeträgen steht die USt-Auswahl in derselben Zeile.
- Rechnungserfassung: Tag-Badges und Tag-Vorschläge sind kompakter dargestellt.
- Bankimport: „Ohne Buchung erledigen“ verwendet einen eigenen Bestätigungsdialog mit optionalem Prüfhinweis.

## [2.9.8] - 2026-07-16

### Geändert

- KI-Rechnungserfassung: Die direkte KI-Auslesung verwendet bei aktivem Docling nun denselben lokalen Dokumenttext als zusätzliche Evidenz wie der Rechnungsbatch.

### Behoben

- KI-Rechnungsbatch: Laufende Auswertungen können über das beim Darüberfahren sichtbare × verworfen werden; verspätete KI-Ergebnisse werden danach nicht gespeichert.

## [2.9.7] - 2026-07-14

### Hinzugefügt

- KI: Mittwald AI Hosting kann als OpenAI-kompatibler Anbieter mit den verfügbaren OCR-, Qwen-, Mistral- und gpt-oss-Modellen verwendet werden.

### Geändert

- KI-Rechnungsbatch: Mittwald-PDFs werden mit GLM-OCR extrahiert und danach von Qwen für den Buchungsentwurf bewertet.

### Behoben

- KI-Rechnungsbatch: Qwen erhält keine nicht unterstützten PDF-Inputs mehr; strukturierte Entwürfe tolerieren unvollständige Modellfelder und hängende Anfragen laufen kontrolliert ab.

## [2.9.6] - 2026-07-14

### Geändert

- Tastaturbefehle: „Gehe zu …“ wird nun mit `Alt` statt mit der Leertaste geöffnet.
- Oberfläche: Der Maximieren-Button zeigt bei maximiertem Fenster ein separates Wiederherstellen-Icon mit klarerem Abstand der überlappenden Quadrate.

### Behoben

- Tastaturbefehle: „Gehe zu …“ bleibt funktionsfähig, wenn der Navigationspunkt „KI“ eingeblendet ist.

## [2.9.5] - 2026-07-14

### Hinzugefügt

- Buchungsjournal: Einnahmen und Ausgaben öffnen auf Klick eine Liste der letzten zehn passenden Buchungen; ein Doppelklick öffnet die Buchungsdetails.

### Geändert

- Buchungsjournal: Offene Buchungsreiter liegen platzsparend in der Paginierungsleiste. Die Aktionsspalte und ihre Bearbeiten-Schaltflächen sind kompakter und besitzen einen farbigen Hover-Zustand.
- Buchungserfassung: Die Kopf-Aktionen für neuen Reiter, Erweitern und Schließen haben klare Hover- und Fokuszustände.
- Reports: Zeitraum, Filter, Tätigkeitsbericht und Export sind als gemeinsame Aktionsgruppe umrahmt.

### Behoben

- Buchungsjournal: Die Einnahmen-/Ausgaben-Popover behalten bei Ladewechseln eine konstante Hook-Reihenfolge und positionieren sich direkt unter der jeweiligen Summenkachel.

## [2.9.4] - 2026-07-13

### Hinzugefügt

- Buchungserfassung: Der steuerliche Bereich im kompakten Flyout besitzt eine kurze Erklärung per Info-Tooltip.

### Geändert

- Performance: Große Dateioperationen für Exporte, Backups, Anhänge, Speicherortwechsel und Rechnungs-Scans laufen asynchron; Datei-Hashes werden nicht mehr über synchrone Komplettlesevorgänge berechnet.
- Performance: Das Dashboard lädt seine zentralen Kennzahlen gebündelt als gecachten Snapshot. Beitragsfälligkeiten werden dabei pro Aufruf gesammelt statt je Mitglied einzeln abgefragt.
- Buchungserfassung und Verbindlichkeiten: Zahlungskonten werden mit ihrer hinterlegten Farbe und nur mit der Kontobezeichnung angezeigt.
- Budgets und Zweckbindungen: Die Ansichten „Detail“ und „Kompakt“ verwenden die gleiche segmentierte Auswahl wie die Buchungserfassung.

### Behoben

- Oberfläche: Bei deaktiviertem Blur bleiben Fenster und Rahmen opak statt deutlich transparent.
- Buchungsjournal: Einnahmen-, Ausgaben-, Umbuchungs- und interne Buchungen erhalten in den Buchungsreitern passende Farbakzente.
- Buchungsdetails: Das Dialogfenster öffnet zentriert im App-Fenster.

## [2.9.2] - 2026-07-13

### Hinzugefügt

- Buchungserfassung: In den Einstellungen kann zwischen Dialog, kompaktem Flyout und eigenem Fenster gewählt werden. Das Flyout unterstützt Buchungsreiter sowie schrittweise einblendbare Angaben für Budget, Zweckbindung, Tags, Kommentare und Anhänge.
- Rechnungserfassung: Einzelrechnungen werden vor der Erkennung über ein eigenes Upload-Flyout abgelegt oder ausgewählt.

### Geändert

- Buchungserfassung: Das kompakte Flyout ist dichter gestaltet; Betrags- und Tagfelder folgen nun der Feldhöhe der übrigen Eingaben, und Konten erscheinen in ihrer hinterlegten Farbe.
- Buchungserfassung: Das Flyout wird mit der App geladen, damit beim ersten Öffnen kein sichtbarer Ladewechsel entsteht.

### Behoben

- Buchungserfassung: Die Kopf-Aktionen zum Erweitern und Schließen reagieren wieder unmittelbar auf den sichtbaren Icons.
- Einstellungen: Die Auswahl des Buchungslayouts hat nun einen sauber umlaufenden Rahmen.
- Oberfläche: Kontraste von KI-Rechnungsentwürfen und der Einnahmen-/Ausgabenbilanz sind in hellen und dunklen Themes besser lesbar.

## [2.9.1] - 2026-07-12

### Hinzugefügt

- Daten/Docling: Eine vorhandene lokale Docling-Installation kann geprüft und optional aktiviert werden; Installation und Modelle werden nicht automatisch heruntergeladen.
- Rechnungserfassung: Docling übernimmt bei Scans oder PDFs ohne brauchbare Textschicht lokal OCR und Dokumentlayoutanalyse.
- KI-Rechnungsbatch: Docling kann strukturierte lokale Texte als zusätzliche KI-Evidenz liefern oder ohne API-Key konservative Grundentwürfe vorbereiten.

### Geändert

- Daten: Docling besitzt einen eigenen Unterpunkt neben Speicher, Import und Updates mit Status, Version, Laufzeit und Installationshilfe.
- Rechnungserfassung: Digitale PDFs mit guter Textschicht verwenden weiterhin den schnellen PDF.js-Pfad; Docling läuft nur als OCR-Fallback.
- KI-Rechnungsbatch: Bereits vorbefüllte KI-Entwürfe starten beim Öffnen des Reviews keinen erneuten Docling-Lauf.

### Behoben

- Docling: Windows-Installationen außerhalb des `PATH`, etwa unter `AppData\\Local\\Programs\\Python`, werden zuverlässig erkannt.
- Docling: Markdown-Kommentare, Bildmarker und Formatierungszeichen werden vor der lokalen Rechnungsfelderkennung entfernt.
- Docling: Das Status-Badge „Nicht installiert“ besitzt in dunklen und transparenten Designs ausreichend Kontrast.

## [2.9.0] - 2026-07-12

### Hinzugefügt

- KI-Rechnungsbatch: Mehrseitige Scanpakete mit mehreren Rechnungen werden vor der Buchungsanalyse seitenweise klassifiziert und in eigenständige Rechnungsentwürfe aufgeteilt.
- KI-Rechnungsbatch: Erkannte Einzelrechnungen zeigen ihre Seitenspanne und Gruppierungssicherheit; unsichere Grenzen werden ausdrücklich zur Prüfung markiert.
- KI-Rechnungsbatch: Bis zu 50 Seiten eines Scanpakets können vollständig, lückenlos und ohne doppelte Seiten gruppiert werden.

### Geändert

- KI-Rechnungsbatch: Duplikate werden nach der Aufteilung pro erkannter Einzelrechnung geprüft; die ursprüngliche PDF bleibt erhalten, bis alle Teilrechnungen gebucht oder verworfen wurden.
- Rechnungserfassung: Dokument- und Datenkopf sind dezent farblich abgehoben; der Bereich „Erkannte Daten“ besitzt mehr Innenabstand.
- Qualitätssicherung: Electron-E2E-Tests laufen wegen des anwendungsweiten Single-Instance-Zustands deterministisch in einem Worker und mit einer frischen App-Instanz pro Smoke-Test.

### Behoben

- KI-Rechnungsbatch: Ungültige KI-Gruppierungen mit fehlenden, doppelten oder nicht fortlaufenden Seiten werden abgelehnt, statt unbemerkt falsche Teilrechnungen zu erzeugen.
- E2E: Start- und Tooltip-Prüfungen verwenden stabile, barrierefreie Bereitschafts- und Fokusbedingungen.

## [2.8.7] - 2026-07-12

### Hinzugefügt

- KI-Einstellungen: Systemproxy, direkte Verbindung oder ein manueller HTTP-, HTTPS- beziehungsweise SOCKS-Proxy können gezielt für KI-Anfragen gewählt werden.
- KI-Einstellungen: Der Verbindungstest zeigt die aufgelöste Route und verständliche Hinweise bei Proxy-, Firewall-, DNS-, Zertifikats- und API-Fehlern.

### Geändert

- KI-Anfragen verwenden eine isolierte Electron-Netzwerksitzung und damit im Systemmodus den Proxy-, PAC- und Zertifikatsspeicher des Betriebssystems.

### Behoben

- CI: Der Buchungsdialog-E2E-Test berücksichtigt sowohl nebeneinanderliegende als auch responsive untereinander angeordnete Kommentar- und Anhangsbereiche.

## [2.8.6] - 2026-07-12

### Hinzugefügt

- Rechnungsjournal: Mehrere PDF-Rechnungen können über einen Batch-Upload oder den vereinsbezogenen `Submit`-Ordner im Hintergrund durch die konfigurierte KI vorbereitet werden.
- Rechnungsjournal: Ein Flyout zeigt wartende, laufende, prüfbereite und fehlgeschlagene Rechnungsentwürfe; fertige Vorschläge lassen sich im bestehenden Rechnungs- und Buchungsdialog prüfen.
- Rechnungsjournal: Inhaltsbasierte Duplikaterkennung hält bereits als Buchungsanhang gespeicherte PDFs an und erlaubt Verwerfen oder eine bewusste erneute KI-Analyse.

### Geändert

- Rechnungsjournal: Der Rechnungsbutton besitzt getrennte Aktionen für Einzel- und Batch-Erfassung sowie direkten Zugriff auf den `Submit`-Ordner.
- Buchungsdialog: Anhangsaktionen werden als dezente Icons erst bei Hover oder Tastaturfokus eingeblendet.
- Buchungsjournal: Offene Rechnungs-Tabs verwenden eine kompakte Beschreibung als Betreff, sobald diese verfügbar ist.

### Behoben

- Rechnungsjournal: Bereits wartende Batch-Einträge werden erneut auf gespeicherte Duplikate geprüft und nicht unbeabsichtigt automatisch analysiert.
- Rechnungsjournal: Identische, erneut ausgewählte PDFs werden im `Submit`-Ordner wiederverwendet, statt künstliche `(2)`-Kopien anzulegen.
- Rechnungsjournal: Duplikat- und Queue-Benachrichtigungen bleiben bei unterschiedlich gestarteten Electron-Prozessen rückwärtskompatibel und verursachen keinen Toast-Fehler.
- Buchungsdialog: Lange Kommentarvorschauen bleiben innerhalb der vorgesehenen Spalte und überlagern den Anhangsbereich nicht.

## [2.7.1] - 2026-07-08

### Hinzugefügt

- Buchungsjournal: Die Suche findet Buchungen jetzt auch über Datumsbegriffe wie `26. Juni`, `26.06.2026`, `Juni` oder `Juni 2026`.

### Verbessert

- Buchungsjournal: Beschreibungen nutzen den verfügbaren Tabellenplatz besser und werden erst nach bis zu zwei Zeilen gekürzt.
- Verbindlichkeiten: Aktionsmenüs in Details öffnen außerhalb des Modal-Layouts, ohne den Inhalt zu verschieben.
- Verbindlichkeiten: Die Tabelle erhält bei geringer Fensterbreite einen horizontalen Scrollbereich.

## [2.7.0] - 2026-07-08

### Geändert

- Darstellung: Niko BG erscheint als eigenes Hintergrundbild in den Einstellungen und im Setup-Assistenten.
- Darstellung: Das Merle-Beckord-Easter-Egg setzt Niko BG nur noch initial, danach kann der Hintergrund frei gewechselt werden.

## [2.6.6] - 2026-07-08

### Hinzugefügt

- Darstellung: Kleines Easter Egg fuer den Kassier-Namen Merle Beckord mit eigenem Hintergrundbild.

## [2.6.5] - 2026-07-08

### Geändert

- Bankimport: CAMT-/CSV-Texte werden bereinigt, Gegenpartei und Zweck werden in Vorschau und Buchungsbeschreibung nachvollziehbarer angezeigt.
- KI: VereinI denkt bei Agent-Aufgaben stärker aus Kassier-Sicht und weicht bei fehlenden Tools nicht mehr auf fachlich riskante Ersatzaktionen aus.
- KI: Bankbelege können als eigener Agent-Review mit bestehenden Buchungen verknüpft werden, ohne Storno- oder Ersatzbuchung.

### Behoben

- Bankimport: Umlaute aus CAMT-Dateien mit abweichendem Encoding werden korrekt dekodiert.
- Bankimport: IBANs aus Verwendungszwecken werden aus Beschreibungstexten entfernt, bleiben aber als Gegenkonto-IBAN erhalten.
- KI: Reine Bankbeleg-Verknüpfungen werden nicht mehr als Storno-/Ersatzbuchungs-Review vorgeschlagen.

## [2.6.2] - 2026-07-07

### Geändert

- KI: Buchungs-Reviews unterstützen jetzt mehrere Budget-Zuordnungen auf einer einzelnen Buchung, inklusive Teilbeträgen.
- Buchungsjournal: Der schwebende `+ Buchung`-Button zieht am Tabellenende animiert nach links, damit rechte Betragswerte sichtbar bleiben.

### Behoben

- KI: Budget- und Zweckbindungszuordnungen aus Agent-Reviews werden mit dem vollen Bruttobetrag bzw. den angegebenen Teilbeträgen übernommen.
- Buchungen: Legacy-Zuordnungen ohne moderne Mehrfachzeile werden in Details, Bearbeiten-Dialog, Tabellen-Badges und Hover-Auswertungen wieder mit Betrag angezeigt.
- Buchungsjournal: Hover-Auswertungen für Budget, Zweckbindung, Tags und Zahlungskonten werden nach Datenänderungen neu geladen.

## [2.6.1] - 2026-07-07

### Geändert

- KI: Bereits vorhandene Buchungen können jetzt als Review gesammelt mit Mitgliedsbeiträgen verknüpft werden, statt nur neue Beitragsbuchungen vorzuschlagen.
- KI: Geöffnete Agent-Buchungsentwürfe zeigen nach dem Speichern im Chat jetzt sichtbar an, dass die Buchung bereits erstellt wurde.

### Behoben

- Updates: Der Sprung aus dem Update-Hinweis öffnet nun zuverlässig die Einstellungen direkt im Bereich `Updates` statt gelegentlich in `Darstellung` zu landen.

## [2.4.0] - 2026-07-05

### Hinzugefügt

- KI: Neuer OpenAI-gestützter Assistent mit Chatoberfläche, Anhängen, Verlauf, Einstellungen und Review-Pipeline.
- KI: Buchungsvorschläge aus Belegen, Excel-Dateien und Bankimporten können vorbereitet und nach Prüfung übernommen werden.
- KI: VereinO-Datenkontext für Mitglieder, Buchungen, Tags, Kategorien, Zahlungskonten und Reports ergänzt.

### Geändert

- Navigation: Der KI-Reiter ist als Modul verfügbar, aber bei neuen Installationen standardmäßig nicht sichtbar.

## [2.3.6] - 2026-07-04

### Geändert

- Baseline-Release vor der OpenAI-KI-Integration mit aktuellem Arbeitsstand.

## [2.3.5] - 2026-07-01

### Behoben

- Buchungsjournal: Die Zusammenfassung für Einnahmen, Ausgaben und Überschuss/Defizit wird bei Zahlweg- und Kontofiltern jetzt korrekt neu berechnet.

## [2.3.4] - 2026-06-30

### Geändert

- Budgets und Zweckbindungen: Kompaktkarten blenden leere Budgets und Zeiträume sauber aus und zeigen ohne Budget stattdessen Einnahmen/Ausgaben bzw. Zugewiesen/Verbraucht.
- Dashboard: Letzte Aktivitäten beschreiben Budget-/Zweckbindungszuweisungen und Bankverknüpfungen deutlich verständlicher, inklusive passender Icons und direkter Belegsprünge bei verknüpften Bankumsätzen.

## [2.3.3] - 2026-06-29

### Hinzugefügt

- Navigation: Bankimport zeigt ein Zahlenbadge für offene Bankbelege.
- Einrichtung: Setup-Assistent um neue Schritte für Darstellung, Workflow, Buchungsansicht, Tags und Backup erweitert.
- Budgets und Zweckbindungen: Karten können zwischen Detail- und Kompaktansicht umgeschaltet werden.
- Budgets und Zweckbindungen: Verwaltungstabellen zeigen eingeklappt maximal fünf Einträge und aufgeklappt 10er-Pagination.

### Geändert

- Dashboard: Liniendiagramme werden bei Vollbild kompakter angeordnet; Einnahmen vs. Ausgaben bleibt als eigene Kachel sichtbar.
- Darstellung: Kontrast der Umschaltbuttons in dunklen und hellen Themes verbessert.

## [2.1.5] - 2026-06-25

### Hinzugefügt

- Import: Neuer Assistent mit Vorabvalidierung, Entwurfsansicht, Problemfilter und bearbeitbarer Importtabelle.
- Import: Regeln für Textmuster, Batch-Zuweisungen und Duplikat-Entscheidungen im Entwurf ergänzt.

### Geändert

- Import: Konten, Budgets und Zweckbindungen werden in der Entwurfstabelle jetzt als echte Dropdown-Auswahl aus VereinO angeboten.

### Behoben

- Import: Wenn neue IPC-Funktionen nach einem Update noch nicht im laufenden Fenster verfügbar sind, zeigt VereinO jetzt eine klare Neustart-Meldung statt still zu scheitern.

## [2.1.4] - 2026-06-25

### Hinzugefügt

- Import: Buchungsvorlagen enthalten jetzt vorhandene Zahlwege, Budgets, Zweckbindungen und Tags als auswählbare Listen.
- Import: Buchungen können als bearbeitbare Excel-Datei exportiert und mit Buchungs-ID/Belegnummer wieder aktualisiert werden.

### Behoben

- Import: Zahlungswege aus Vorlagen und Testdateien werden beim Import korrekt übernommen.
- Import: Datenbanken mit alten Fremdschlüsselreferenzen auf `vouchers_old` werden vor dem Import repariert.
- Darstellung: Der Schließen-Button in Buchungsdetails bleibt in hellen Themes kontrastreich.
- Tabelle: Die Spalte `Art` wird bei aktivem Storno-Modus nicht mehr als konfigurierbare Journalspalte angeboten.

## [2.0.7] - 2026-06-24

### Hinzugefügt

- Einstellungen: Updates sind jetzt über einen eigenen Reiter erreichbar.
- Buchungsdetails: Vorhandene Anhänge werden angezeigt und öffnen per Klick direkt den zugehörigen Beleg.

### Geändert

- Fensterlayout: Die Mindestbreite wurde erhöht und die Kopfzeile, Fenstersteuerung sowie Einstellungsreiter für 50/50-Fenstersnap optimiert.

### Behoben

- Buchungen und Einreichungen: Tabellen bleiben bei minimaler Fensterbreite vollständig über horizontale Scrollleisten bedienbar.

## [1.9.8] - 2026-06-23

### Hinzugefügt

- Zahlwege: Eigene Zahlungswege wie Bankkonten, PayPal oder Karten lassen sich jetzt separat verwalten, einfärben und Buchungen direkt zuweisen.
- Buchungsjournal: Hover-Übersichten für Zahlwege zeigen Einnahmen, Ausgaben, Saldo, Gesamtbetrag und Buchungsanzahl; ein Klick auf den Zahlweg aktiviert direkt den passenden Filter.

### Geändert

- Auswertungen und Exporte: Berichte, Dashboard-Zusammenfassungen sowie PDF/XLS-Ausgaben verwenden jetzt konsequent die tatsächlichen Zahlwege statt nur `Bar` und `Bank`.
- Einstellungen: Der separate Kontrastmodus für Bildhintergründe entfällt, weil der Glaseffekt dieselbe Aufgabe ohne zusätzliche Option abdeckt.

### Behoben

- Datenbank: Neue Organisationen erhalten Zahlungsweg-Tabellen und zugehoerige Buchungsspalten jetzt auch bei frischen Datenbanken vollstaendig, ohne nachtraegliche Schemafehler.
- Fensterverhalten: Abgedockte Buchungsfenster werden beim Schliessen des Hauptfensters sauber mit beendet.

## [1.9.7] - 2026-06-21

### Hinzugefügt

- Darstellung: Optionaler Kontrastmodus für Bildhintergründe verbessert die Lesbarkeit von Karten, Tabellen und farbigen Buchungsbeträgen.
- Buchungen: Hover-Details für Storno-Verknüpfungen sowie ein Klickfilter für Original- und Gegenbuchung ergänzt.
- Updates: Beim Start wird nach verfügbaren Versionen gesucht und zehn Sekunden lang ein Hinweis mit direktem Sprung zu den Einstellungen angezeigt.

### Geändert

- Buchungen: Bei geringer Fensterhöhe scrollt nur noch der Tabellenbereich; Suche, Summenübersicht, Pagination und Tabellenkopf bleiben sichtbar.
- Buchungsfenster: Position und Größe externer Buchungsfenster werden bildschirmübergreifend gespeichert.

### Behoben

- Buchungen: Bearbeitungsreiter öffnen ein manuell geschlossenes externes Buchungsfenster wieder zuverlässig.
- Buchungen: Der globale Filter-Reset entfernt auch den Filter „Original + Storno“.
- Buchungen: Storno-Badges verwenden die kompakte Größe der übrigen Tags und Kategorien.

## [1.9.5] - 2026-06-19

### Hinzugefügt

- Buchungen: Option "Bearbeitungen als Reiter" ergänzt, damit mehrere geöffnete Buchungen im Hauptfenster parallel bearbeitet werden können.

### Geändert

- Einstellungen: Bereich "Navigation & Layout" klarer gruppiert und Toggle-Erklärungen direkt an den jeweiligen Optionen ergänzt.
- Buchungen: Offene Buchungsentwürfe und Bearbeitungen teilen sich eine gemeinsame Reiterleiste mit getrennten Kennzeichnungen.

### Behoben

- Buchungen: Bearbeitungsreiter bleiben beim Schließen des Bearbeitungsmodals erhalten und fokussieren abgedockte Buchungen wieder korrekt.

## [1.9.4] - 2026-06-19

### Hinzugefügt

- Buchungen: Storno-Funktion für Korrekturbuchungen ergänzt, inklusive Statusanzeige für Storno- und stornierte Buchungen.
- Exporte und Berichte: Storno-Status in Journal-, Jahresabschluss-, Kassier- und Fiskalberichten sichtbar gemacht.

### Geändert

- Buchungen: Neuinstallationen verwenden standardmäßig Storno statt endgültigem Löschen.
- Buchungen: Updates behalten die Ausnahmeregel "Buchungen endgültig löschen" automatisch aktiv, solange die Einstellung vorher noch nicht gesetzt war.
- Einstellungen: Hinweistext zum Löschmodus präzisiert, damit Neuinstallation und Update-Verhalten klar unterscheidbar sind.

### Behoben

- Buchungen: Storno-Buchungen werden vor erneutem Storno, Bearbeitung und endgültigem Löschen geschützt.
- Buchungen: Referenzen zwischen Originalbuchung und Storno bleiben in Tabellen, Modalen und Exporten nachvollziehbar.

## [1.9.2] – 2026-06-17

### Hinzugefügt

- Einreichungen: Export einer Webformular-Katalogdatei mit Organisation, Budgets, Zweckbindungen und Tags.
- Submission Web: Import der Katalogdatei und Auswahl von Budget, Zweckbindung und Tags pro Einreichung.

### Geändert

- Einreichungen: Import und Review übernehmen vorgeschlagene Kategorien aus dem Webformular als Vorauswahl.
- Submission Web: JSON-Export auf Version `1.1` erweitert und Dokumentation für HTTP/HTTPS-Testbetrieb ergänzt.

## [1.9.1] – 2026-06-17

### Hinzugefügt

- Buchungen: Buchungsreiter (Booking Draft Tabs) hinzugefügt, damit mehrere Buchungsentwürfe parallel geöffnet und wieder aufgenommen werden können.
- Tastatur-Shortcuts: `Alt`-Overlay auf Verbindlichkeiten- und Mitglieder-Modale erweitert.
- Tastatur-Shortcuts: `Alt+Q` für „+ Neu“ in Verbindlichkeiten und Mitglieder ergänzt.

### Geändert

- Buchungen: Shortcut-Badges für Suche, Zeitraum, Filter, Spalten und Batch-Zuordnung werden beim ersten Laden der Buchungsansicht zuverlässig registriert.

### Behoben

- Verbindlichkeiten: Renderer-Crash beim Wechsel in den Verbindlichkeiten-Reiter behoben.
- Buchungen: Tag-Hover zeigt lokale Fallback-Werte und bleibt im Dev-Build nicht mehr dauerhaft auf „Lädt…“ hängen.
- Tastatur-Shortcuts: Stabilere Registrierung der Buchungs-Toolbar-Shortcuts nach Seitenwechseln und Filteränderungen.

## [1.8.4] – 2026-03-01

### Hinzugefügt

- Kassierbericht: Option „Auswertung nach Tags“ als eigenständige, konsolidierte Sektion (Summen für Einnahmen/Ausgaben/Saldo je Tag)
- Kassierbericht: Optionale Tags-Spalte in der Einzelbuchungsliste (Anhang)
- Buchungsmodal: IN/OUT-Buttons mit visuellen +/− Kennzeichnungen
- Buchungsmodal: Nutzungsbasierte Standardwerte (Art, Zahlweg, Brutto/Netto) anhand Benutzergewohnheiten

### Geändert

- Dashboard: Budgets, Zweckbindungen und Sphärenanteile reagieren nun auf den gewählten Zeitraumfilter (Monat/Jahr/3 Jahre/Gesamt)
- Dashboard: Zeitraumfilter visuell vom Zitatbereich abgesetzt (eigener Rahmen + Icon)
- Report-Export: Jahresauswahl verwendet nur tatsächlich verfügbare Buchungsjahre (inkl. aktuelles Jahr)

## [1.8.3] – 2026-02-28

### Hinzugefügt

- Report: Neuer Tab „Kassierbericht (Mitglieder)“ im Export-Dialog – erzeugt ein übersichtliches PDF für die Mitgliederversammlung mit Kassenstand (Bar/Bank), Einnahmen/Ausgaben, letzter Kassenprüfung, Sphären-Übersicht, Mitglieder-Statistik, offenen Verbindlichkeiten, Zweckbindungen und Budgets
- Kassierbericht: Sektionen ohne Daten werden automatisch ausgeblendet für ein cleaneres PDF
- Kassierbericht: Einzelbuchungs-Auflistung optional als Anhang mit eigenem Zeitraum und Sortierung

### Behoben

- Kassierbericht: Seitenumbrüche verhindern Schnitte mitten in Tabellen, KPI-Karten und Sektionen

## [1.8.2] – 2026-02-27

### Geändert

- Kassenprüfung: Soll-Bestand wird bis Stichtag über den gesamten Buchungszeitraum berechnet (nicht nur seit Jahresbeginn)
- Journal: Überschuss-Tooltip zeigt zusätzlich Bar- und Bank-Aufschlüsselung

### Behoben

- Kassenprüfung: Historie-Erfassung nach Ausgleichsbuchung wiederhergestellt (IPC-/Preload-Verdrahtung für `cashChecks`)
- Journal: Bar-/Bank-Werte im Überschuss-Tooltip berücksichtigen nun Transfers (BAR↔BANK) korrekt

## [1.8.1] – 2026-02-26

### Geändert

- UI: Layout-Anpassungen und Zahlungs-Badge-Updates übernommen

### Behoben

- Journal: Brutto/Netto-Betragsmodus wird beim Bearbeiten korrekt gespeichert

## [1.8.0] – 2026-02-24

### Behoben

- Organisationslöschung stabilisiert, Übertragungsberichte und Filter-Dropdown-UX verbessert
- Journal: Transfers werden bei Zahlweg-Filter korrekt berücksichtigt

## [1.7.5] – 2026-02-23

### Behoben

- Datenbank: Fehlende cash_checks- und member_advances-Schemata repariert

## [1.7.2] – 2026-02-19

### Geändert

- Spenden: Unterschreiber ist nun editierbar, mehr Platz für Unterschrift

## [1.7.0] – 2026-02-18

### Behoben

- Budget-Filter-Label und Legacy-Budget-Schema-Migration repariert

## [1.6.6] – 2026-02-17

### Hinzugefügt

- Spenden: Quittungs-Flow, verbessertes Modal-UX und Integration des Org-Logos

## [1.6.5] – 2026-02-14

### Geändert

- Diverse Workspace-Anpassungen übernommen

### Behoben

- UI-Änderungen im Mitglieder-Modal

## Ältere Versionen

Frühere Änderungen sind im Git-Verlauf dokumentiert.
