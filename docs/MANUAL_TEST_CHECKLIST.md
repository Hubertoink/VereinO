# VereinO – manuelle Regressionstest-Checkliste

Diese Checkliste ist für einen vollständigen Funktionstest nach größeren Änderungen gedacht.

## Testregeln und Vorbereitung

- [ ] Ausschließlich mit einer Testorganisation oder einer Kopie der Produktivdaten testen.
- [ ] Vor dem Test ein manuelles Backup erstellen und dessen Speicherort notieren.
- [ ] Ausgangswerte notieren: Anzahl Buchungen, Mitglieder, offene Verbindlichkeiten und Kontostände.
- [ ] Mindestens zwei Organisationen anlegen, um die Datentrennung zu prüfen.
- [ ] Testdateien bereithalten: PDF, JPG/PNG, XLSX/CSV beziehungsweise Importvorlage und Einreichungs-JSON.
- [ ] Für Zeitraumtests ein offenes und ein abgeschlossenes Geschäftsjahr verwenden.
- [ ] Nach jedem größeren Abschnitt die App schließen, neu starten und die Persistenz prüfen.

Empfohlene Teststammdaten:

- Konto `Testbank` vom Typ Bank und Konto `Testkasse` vom Typ Kasse
- Aktives Budget `Testbudget` über 1.000,00 €
- Archiviertes Budget `Altbudget`
- Aktive Zweckbindung `Testzweck` über 500,00 €
- Inaktive oder abgelaufene Zweckbindung `Altzweck`
- Tags `Test`, `Spende` und `Projekt`
- Mitglied `Max Mustermann` mit Beitragsplan

## 1. Kritischer Schnelltest

Diese Punkte zuerst prüfen. Bei einem Fehler den ausführlichen Test abbrechen.

- [ ] App startet ohne Fehlermeldung und zeigt die zuletzt aktive Organisation.
- [ ] Alle Hauptseiten lassen sich öffnen: Dashboard, Buchungen, Verbindlichkeiten, Mitglieder, Vorschüsse, Budgets, Zweckbindungen, Einreichungen, Belege, Reports und Einstellungen.
- [ ] Eine Einnahme kann angelegt, gespeichert und im Journal wiedergefunden werden.
- [ ] Eine Ausgabe kann angelegt, bearbeitet und gespeichert werden.
- [ ] Eine Buchung mit Datei kann geöffnet werden; der Anhang bleibt nach Neustart vorhanden.
- [ ] Eine Buchung kann einem Budget und einer Zweckbindung zugeordnet werden.
- [ ] Dashboard und Reportwerte ändern sich nach einer neuen Buchung.
- [ ] Ein manuelles Backup wird erstellt und in der Backupliste angezeigt.
- [ ] App-Neustart erhält Buchungen, Einstellungen und Filterkonfiguration.
- [ ] Wechsel zwischen zwei Organisationen zeigt jeweils nur deren eigene Daten.

## 2. Start, Fenster und Navigation

- [ ] Setup-Assistent funktioniert bei einer neuen/leeren Installation.
- [ ] Minimieren, Maximieren, Wiederherstellen und Schließen funktionieren.
- [ ] Fenstergröße und Position werden sinnvoll wiederhergestellt.
- [ ] Ein Fenster außerhalb eines nicht mehr vorhandenen Monitors wird sichtbar geöffnet.
- [ ] Top-Navigation und Seitenleiste funktionieren.
- [ ] Automatischer Wechsel zur Seitenleiste bei schmalem Fenster funktioniert.
- [ ] Eingeklappte Seitenleiste bleibt nach Neustart erhalten.
- [ ] Aktive Seite und aktive Navigation sind visuell synchron.
- [ ] Tastatur-/Leader-Shortcuts öffnen die erwarteten Seiten und Aktionen.
- [ ] Escape schließt Modale, ohne unbeabsichtigt Daten zu speichern.
- [ ] Mehrfaches schnelles Navigieren erzeugt keine leeren Seiten oder doppelten Modale.

## 3. Organisationen und Datentrennung

- [ ] Organisation anlegen und Namen speichern.
- [ ] Organisation umbenennen.
- [ ] Logo und Erscheinungsbild pro Organisation speichern.
- [ ] Zwischen Organisationen wechseln.
- [ ] Buchungen, Mitglieder, Budgets, Zweckbindungen und Einstellungen sind korrekt getrennt.
- [ ] Nach Neustart ist die zuletzt aktive Organisation aktiv.
- [ ] Organisationswechsel bei geöffnetem Modal verursacht keine Datenvermischung.
- [ ] Organisation ohne Daten löschen.
- [ ] Löschen einer Organisation mit Daten zeigt eine eindeutige Bestätigung.
- [ ] Abbruch der Löschbestätigung erhält alle Daten.

## 4. Konten und Zahlwege

- [ ] Bank-, Kassen-, PayPal-, Karten- und sonstiges Konto anlegen.
- [ ] Name, IBAN, Farbe, Sortierung und Aktivstatus bearbeiten.
- [ ] Standardzuordnung für Bar/Bank wird in Buchungsdialogen korrekt angeboten.
- [ ] Inaktives Konto verschwindet aus Neuauswahlen, bleibt bei alten Buchungen lesbar.
- [ ] Konto mit vorhandener Nutzung kann nicht unbemerkt gelöscht werden.
- [ ] Kontofarbe erscheint in Journal, Dashboard und Filtern konsistent.
- [ ] Kontostände entsprechen den zugehörigen Einnahmen, Ausgaben und Transfers.

## 5. Buchungen – Grundfälle

- [ ] Brutto-Einnahme mit Datum, Beschreibung, Sphäre, Konto und Tag anlegen.
- [ ] Brutto-Ausgabe mit denselben Feldern anlegen.
- [ ] Netto-Buchung mit 0 %, 7 % und 19 % MwSt. anlegen.
- [ ] Netto-, MwSt.- und Bruttobetrag werden korrekt berechnet.
- [ ] Dezimalwerte mit deutschem Komma und Punkt werden korrekt behandelt.
- [ ] Nullbetrag, negativer Betrag und ungültige Eingabe werden sinnvoll abgewiesen.
- [ ] Sehr lange Beschreibung und Kommentar speichern und anzeigen.
- [ ] Sonderzeichen, Umlaute und Emoji bleiben erhalten.
- [ ] Buchungsnummern sind eindeutig und chronologisch plausibel.
- [ ] Mehrere Buchungen schnell hintereinander erzeugen keine doppelte Nummer.
- [ ] Option „nach Speichern schließen/offen lassen“ verhält sich gemäß Einstellung.
- [ ] Neue Buchung aktualisiert Journal, Dashboard, Reports und Kontostand ohne Neustart.

## 6. Transfers und interne Buchungen

- [ ] Transfer zwischen zwei unterschiedlichen Konten anlegen.
- [ ] Quellkonto wird belastet und Zielkonto wird erhöht.
- [ ] Transfer mit identischem Quell- und Zielkonto wird abgewiesen.
- [ ] Transfer kann bearbeitet werden; beide Kontostände werden aktualisiert.
- [ ] Transfer erscheint in Filtern für Quelle und Ziel mit richtiger Richtung.
- [ ] Interne Buchung mit negativer Quelle und positivem Ziel anlegen.
- [ ] Summe der internen Zuordnungen muss null sein.
- [ ] Quellen- und Zielsummen entsprechen jeweils dem Bruttobetrag.
- [ ] Ungleichgewicht oder fehlende Quell-/Zielzeile wird mit verständlicher Meldung blockiert.
- [ ] Interne Buchung verändert keine Bank-/Kassenkontostände.

## 7. Buchungen – Bearbeiten, Löschen und Stornieren

- [ ] Datum, Beschreibung, Konto, Betrag, Sphäre und Tags bearbeiten.
- [ ] Wechsel zwischen Brutto und Netto speichert korrekte Beträge.
- [ ] Bearbeitung mit ungespeicherten Änderungen zeigt die konfigurierte Rückfrage.
- [ ] Abbrechen verwirft Änderungen vollständig.
- [ ] Löschen funktioniert, wenn Löschen erlaubt ist.
- [ ] Stornieren erzeugt eine verknüpfte Gegenbuchung.
- [ ] Original und Storno zeigen gegenseitige Referenzen.
- [ ] Bereits stornierte Buchung kann nicht erneut bearbeitet oder storniert werden.
- [ ] Stornobuchung selbst kann nicht unzulässig verändert werden.
- [ ] Geschlossene Periode blockiert Bearbeiten, Löschen und Stornieren.
- [ ] Audit-/Änderungsverlauf enthält die ausgeführte Aktion.

## 8. Budget- und Zweckbindungszuordnungen

Dieser Abschnitt ist nach dem Repository-Refactor besonders wichtig.

- [ ] Einzelnes Budget einer Einnahme zuordnen.
- [ ] Einzelnes Budget einer Ausgabe zuordnen.
- [ ] Mehrere Budgets mit Teilbeträgen zuordnen.
- [ ] Summe der Budgetbeträge darf den Buchungsbetrag nicht überschreiten.
- [ ] Dasselbe Budget kann nicht doppelt zugeordnet werden.
- [ ] Budgetzuordnung bearbeiten, entfernen und neu hinzufügen.
- [ ] Einzelne und mehrere Zweckbindungen analog testen.
- [ ] Dasselbe Zweckbindungsziel kann nicht doppelt vorkommen.
- [ ] Inaktive Zweckbindung wird bei neuen Buchungen blockiert.
- [ ] Datum außerhalb des erzwungenen Budgetzeitraums wird blockiert.
- [ ] Datum außerhalb des erzwungenen Zweckbindungszeitraums wird blockiert.
- [ ] Archivierte Budgets bleiben bei bestehenden Buchungen lesbar.
- [ ] Legacy-Anzeige zeigt weiterhin die erste Zuordnung korrekt.
- [ ] Nach Neustart sind alle Mehrfachzuordnungen und Teilbeträge unverändert.
- [ ] Budget-/Zweckbindungsfilter finden die Buchung nach jeder zugeordneten Position.
- [ ] Sammelzuordnung für Budget, Zweckbindung und Tags aktualisiert alle ausgewählten Buchungen.
- [ ] Interne Umbuchung zwischen Budgets/Zweckbindungen erhält negative und positive Beträge.

## 9. Journal

- [ ] Suche nach Beschreibung, Buchungsnummer und `#ID` funktioniert.
- [ ] Datums-, Sphären-, Typ-, Konto-, Zahlweg-, Budget-, Zweckbindungs- und Tagfilter funktionieren einzeln.
- [ ] Kombination mehrerer Filter liefert nur passende Ergebnisse.
- [ ] Filterchips zeigen korrekte Werte und lassen sich einzeln entfernen.
- [ ] „Alle Filter löschen“ setzt Seite und Ergebnis zurück.
- [ ] Sortierung nach Datum und weiteren angebotenen Spalten funktioniert auf-/absteigend.
- [ ] Seitengröße und Pagination funktionieren bei mehr als einer Seite.
- [ ] Tabellenkopf kann umsortiert werden.
- [ ] Spalten ein-/ausblenden und Presets „Minimal“, „Standard“ und „Details“ funktionieren.
- [ ] Spalteneinstellungen bleiben nach Neustart erhalten.
- [ ] Klick auf Tag, Budget oder Zweckbindung setzt den passenden Filter.
- [ ] Sprung aus Dashboard, Verbindlichkeit oder Mitglied markiert die richtige Buchung.
- [ ] Inline-/Tab-Bearbeitung und abgedocktes Bearbeitungsfenster funktionieren.
- [ ] Mehrere offene Buchungs-Tabs behalten jeweils ihren eigenen Zustand.

## 10. Abgedocktes Buchungsfenster

- [ ] Neues abgedocktes Fenster öffnen.
- [ ] Ein zweiter Klick fokussiert den vorhandenen Entwurf statt ihn zu duplizieren.
- [ ] Entwurf synchronisiert sich mit dem Hauptfenster.
- [ ] Speichern aktualisiert das Hauptfenster.
- [ ] Bearbeiten, Detailansicht, Stornieren und Anhänge funktionieren abgedockt.
- [ ] Schließen mit ungespeicherten Änderungen zeigt die erwartete Rückfrage.
- [ ] Abbrechen der Rückfrage hält das Fenster offen.
- [ ] Hauptfenster schließen fordert zuerst die offenen Buchungsfenster zur Entscheidung auf.
- [ ] Fensterposition bleibt erhalten und wird auf sichtbare Monitore begrenzt.

## 11. Anhänge und Belege

- [ ] PDF, JPG und PNG an eine neue Buchung anhängen.
- [ ] Mehrere Dateien mit gleichem Anzeigenamen anhängen.
- [ ] Datei aus Buchungsdetail öffnen.
- [ ] „Speichern unter“ erzeugt eine lesbare Kopie.
- [ ] Datei löschen entfernt nur den gewählten Anhang.
- [ ] Abbruch eines Dateidialogs erzeugt keine Fehlermeldung.
- [ ] Anhänge bleiben nach Bearbeiten und Neustart erhalten.
- [ ] Belegübersicht zeigt die richtigen Buchungen und Dateianzahlen.
- [ ] Verwaiste/fehlende Datei führt zu verständlicher Fehlermeldung statt Absturz.
- [ ] Dateinamen mit Umlauten und Sonderzeichen funktionieren.

## 12. Budgets

- [ ] Budget mit Jahr, Sphäre, Name/Kategorie/Projekt, Betrag, Farbe und Zeitraum anlegen.
- [ ] Budget bearbeiten und archivieren.
- [ ] Verbrauch, Zufluss und Restbetrag stimmen mit Testbuchungen überein.
- [ ] Budgetdetail zeigt die zugehörigen Buchungen.
- [ ] Klick aus Budgetdetail springt korrekt ins Journal.
- [ ] Zeitraumprüfung lässt sich aktivieren/deaktivieren.
- [ ] Löschen eines unbenutzten Budgets funktioniert.
- [ ] Löschen eines benutzten Budgets warnt oder wird blockiert.
- [ ] Dashboard-Kacheln und Reports zeigen aktualisierte Werte.

## 13. Zweckbindungen

- [ ] Zweckbindung mit Code, Name, Rahmen, Farbe und Zeitraum anlegen.
- [ ] Zweckbindung bearbeiten, deaktivieren und wieder aktivieren.
- [ ] Einnahmen erhöhen und Ausgaben vermindern den verfügbaren Rahmen korrekt.
- [ ] Überziehungsschutz zeigt die erwartete Warnung beziehungsweise Blockierung.
- [ ] Detailansicht und Sprung ins Journal funktionieren.
- [ ] Zeitraumprüfung lässt sich aktivieren/deaktivieren.
- [ ] Löschen einer unbenutzten Zweckbindung funktioniert.
- [ ] Benutzte Zweckbindung bleibt historisch auflösbar.

## 14. Verbindlichkeiten und Forderungen

- [ ] Neue Verbindlichkeit und neue Forderung anlegen.
- [ ] Pflichtfeldvalidierung für Partei, Betrag, Datum und Typ prüfen.
- [ ] Fälligkeit, Rechnungsnummer, Sphäre, Konto, Budget, Tags und Anhänge speichern.
- [ ] Offenen, teilweise bezahlten und bezahlten Status erzeugen.
- [ ] Teilzahlung hinzufügen; Restbetrag wird korrekt berechnet.
- [ ] Vollzahlung beziehungsweise „bezahlt“ setzen.
- [ ] Als Buchung übernehmen; Verknüpfung und Buchungsnummer erscheinen.
- [ ] Doppelte Übernahme derselben Rechnung wird verhindert.
- [ ] Sprung von Rechnung zur Buchung funktioniert.
- [ ] Bearbeiten und Löschen funktionieren gemäß Status.
- [ ] Suche, Status-, Zeitraum-, Sphären-, Budget- und Tagfilter funktionieren.
- [ ] Sortierung, Spaltenauswahl und Pagination funktionieren.
- [ ] Rechnungsanhang öffnen, speichern und entfernen.
- [ ] Dashboard-Zähler für offene Verbindlichkeiten aktualisiert sich.

## 15. Vorschüsse

- [ ] Vorschuss für Mitglied und freien Empfänger anlegen.
- [ ] Platzhalterbuchung und Vorschussbetrag stimmen überein.
- [ ] Einzelne Ausgaben/Buchungen zum Vorschuss hinzufügen.
- [ ] Vorschussbuchung bearbeiten und entfernen.
- [ ] Teilweise und vollständig auflösen.
- [ ] Restbetrag und Status aktualisieren sich korrekt.
- [ ] Löschen eines offenen Vorschusses zeigt Bestätigung.
- [ ] Geschlossene Perioden und verknüpfte Buchungen werden respektiert.
- [ ] Daten bleiben nach Neustart erhalten.

## 16. Mitglieder und Beiträge

- [ ] Mitglied mit Mitgliedsnummer, Kontaktdaten, Adresse und Status anlegen.
- [ ] Mitglied bearbeiten, pausieren und austreten lassen.
- [ ] Suche, Sortierung, Filter und Pagination funktionieren.
- [ ] Beitragsbetrag und monatliches, quartalsweises sowie jährliches Intervall speichern.
- [ ] Fällige Perioden werden korrekt berechnet.
- [ ] Beitrag als bezahlt markieren und mit Buchung verknüpfen.
- [ ] Markierung wieder entfernen.
- [ ] Automatische Buchungsvorschläge sind plausibel.
- [ ] Historie und Zeitleiste zeigen bezahlt, offen und überfällig korrekt.
- [ ] Mitgliedsbrief erstellen und in externer Anwendung öffnen.
- [ ] XLSX- und PDF-Export mit ausgewählten Feldern prüfen.
- [ ] Umlaute, Anschrift und Mitgliedsnummer erscheinen korrekt in Export/Brief.
- [ ] Mitglied mit verknüpften Beiträgen kann nicht inkonsistent gelöscht werden.

## 17. Einreichungen

- [ ] Gültige Einreichungs-JSON importieren.
- [ ] Einzelobjekt und Liste importieren.
- [ ] Ungültiges JSON und fehlende Pflichtfelder werden verständlich gemeldet.
- [ ] Anhänge lassen sich ansehen und entfernen.
- [ ] Einreichung genehmigen, ablehnen und löschen.
- [ ] Genehmigte Einreichung in Buchung umwandeln.
- [ ] Betrag, Beschreibung, Kategorie, Budget, Zweckbindung, Tags und Anhänge werden übernommen.
- [ ] Umgewandelte Einreichung zeigt Verknüpfung zur Buchung.
- [ ] Katalog für das Webformular exportieren und Inhalt stichprobenartig prüfen.
- [ ] Statusfilter und Zähler aktualisieren sich.

## 18. Dashboard

- [ ] Einnahmen, Ausgaben, Saldo und Liquidität stimmen mit Journalwerten überein.
- [ ] Bank-/Kassen- und einzelne Kontostände stimmen.
- [ ] Monats-/Tagesdiagramme zeigen den gewählten Zeitraum.
- [ ] Budgetabweichungen und Zweckbindungsnutzung stimmen.
- [ ] Arbeitsliste zeigt offene Verbindlichkeiten, Einreichungen und weitere Aufgaben.
- [ ] Klicks auf Karten/Diagramme navigieren zur richtigen gefilterten Ansicht.
- [ ] Leere Datenbank erzeugt sinnvolle Null-/Leerzustände.
- [ ] Änderungen aktualisieren das Dashboard ohne vollständigen Neustart.

## 19. Reports und Exporte

- [ ] Report ohne Filter stimmt mit Gesamtsummen im Journal überein.
- [ ] Alle Journal-relevanten Filter einzeln und kombiniert prüfen.
- [ ] Einnahmen, Ausgaben, Saldo, Sphären, Zahlwege und Monatswerte plausibilisieren.
- [ ] PDF-/Standardexport erzeugen und öffnen.
- [ ] XLSX-Export erzeugen; Spalten, Zahlenformate und Vorzeichen prüfen.
- [ ] Fiskalbericht erzeugen.
- [ ] Kassenwartsbericht erzeugen.
- [ ] Export mit eigener Spaltenauswahl prüfen.
- [ ] Dateidialog abbrechen, ohne Fehlerzustand zu hinterlassen.
- [ ] Exportpfad über „Im Ordner anzeigen“ öffnen.
- [ ] Tätigkeitsbericht anlegen, Pflichtfelder prüfen, bearbeiten und löschen.
- [ ] Umlaute, Eurozeichen und lange Texte erscheinen korrekt in PDF/XLSX.

## 20. Spenden, Steuerbefreiung und Kassenprüfung

- [ ] Geldspendenbescheinigung mit vollständigen Organisations- und Spenderdaten erzeugen.
- [ ] Sachspendenfall mit Beschreibung, Zustand, Herkunft und Bewertung erzeugen.
- [ ] Logo, Finanzamt, Steuernummer und Bescheiddatum erscheinen korrekt.
- [ ] Steuerbefreiungsnachweis hochladen, Gültigkeit bearbeiten, öffnen und löschen.
- [ ] Kassenprüfer-Standarddaten speichern.
- [ ] Kassenprüfung für ein Jahr anlegen.
- [ ] Relevante Buchungen und Salden im Prüfbericht stichprobenartig vergleichen.
- [ ] Kassenprüfungs-PDF erzeugen und öffnen.
- [ ] Prüfungsrelevante Buchungen sind gemäß Fachlogik geschützt.

## 21. Import

- [ ] Importvorlage und Testdaten exportieren.
- [ ] Gültige Datei laden und Vorschau prüfen.
- [ ] Spaltenzuordnung automatisch und manuell prüfen.
- [ ] Regeln für Beschreibung, Konto, Tags, Typ, Budget, Zweckbindung und Sphäre testen.
- [ ] Fehlende Stammdaten erkennen und anlegen.
- [ ] Duplikate als überspringen, importieren und zusammenführen behandeln.
- [ ] Warnungen und Fehler pro Zeile anzeigen.
- [ ] Entwurf bearbeiten und übernehmen.
- [ ] Importzahlen „importiert/übersprungen/fehlerhaft“ mit Datei vergleichen.
- [ ] Fehlerdatei und Import-Log öffnen.
- [ ] Ungültige Datei verändert keine Daten.
- [ ] Erfolgreicher Import erzeugt vorher ein Sicherheitsbackup.
- [ ] Importierte Buchungen erscheinen in Journal, Dashboard und Reports.

## 22. Backup, Wiederherstellung und Speicherort

Dieser Abschnitt ist nach der IPC-Auslagerung besonders wichtig.

- [ ] Manuelles Backup erstellen.
- [ ] Backupliste zeigt Datei, Größe und Datum.
- [ ] Backupordner öffnen.
- [ ] Eigenen Backupordner auswählen.
- [ ] Vorhandene Backups werden beim Ordnerwechsel korrekt migriert.
- [ ] Backupordner auf Standard zurücksetzen.
- [ ] Backup inspizieren; Datensatzzahlen sind plausibel.
- [ ] Testdaten nach Backup verändern und anschließend Backup wiederherstellen.
- [ ] Nach Restore stimmen Buchungen, Mitglieder, Anhänge und Einstellungen mit dem Backupstand überein.
- [ ] Datenbank exportieren und exportierte Datei öffnen/kopieren.
- [ ] Datenbankimport zeigt vorab einen Vergleich.
- [ ] Importabbruch lässt die aktive Datenbank unverändert.
- [ ] Datenbank in neuen Speicherordner migrieren.
- [ ] Bestehenden Datenbankordner verwenden.
- [ ] Auf Standardspeicherort zurücksetzen.
- [ ] Smart-Restore-Vorschau und beide angebotenen Aktionen prüfen.
- [ ] Anhänge funktionieren nach Speicherortmigration weiterhin.
- [ ] Schreibgeschützten/ungültigen Backupordner testen: Aktion meldet Fehler und Datenänderung läuft nicht weiter.
- [ ] „Alle Buchungen löschen“ erzeugt vorher ein Backup.
- [ ] Wenn das Sicherheitsbackup fehlschlägt, werden keine Buchungen gelöscht.

## 23. Jahresabschluss

- [ ] Vorschau für ein offenes Jahr prüfen.
- [ ] Exportpaket für den Jahresabschluss erzeugen.
- [ ] Jahr abschließen; Sicherheitsbackup wird vorher erstellt.
- [ ] Buchungen im geschlossenen Zeitraum sind gesperrt.
- [ ] Neue Buchung im Folgejahr bleibt möglich.
- [ ] Wiederöffnung hebt die Sperre korrekt auf.
- [ ] Fehlgeschlagenes Sicherheitsbackup verhindert den Abschluss.
- [ ] Abschlussstatus bleibt nach Neustart bestehen.

## 24. Einstellungen

- [ ] Darstellung: jedes Theme, Hintergrundbild und Glasmodus prüfen.
- [ ] Menüführung, Iconfarben, Zeilenstil und Dichte prüfen.
- [ ] Verhalten für Buchungsentwürfe, Bearbeitungstabs und Löschen/Stornieren prüfen.
- [ ] Datumsformat ISO/lesbar auf mehreren Seiten prüfen.
- [ ] Tabellen-Spalten und Reihenfolge speichern.
- [ ] Organisation: Name, Anschrift, Kassierer, Logo und Berichtsdaten speichern.
- [ ] Konten, Tags und Farben verwalten.
- [ ] Speicher/Backup-, Import-, Spenden-, Kassenprüfungs- und Jahresabschluss-Panes öffnen.
- [ ] Updates manuell prüfen.
- [ ] Einstellungen bleiben nach Seitenwechsel, Organisationswechsel und Neustart erhalten.
- [ ] Organisationsbezogene Einstellungen vermischen sich nicht zwischen Organisationen.

## 25. Updates, externe Dateien und Links

- [ ] Updateprüfung ohne verfügbares Update zeigt einen ruhigen, verständlichen Status.
- [ ] Verfügbares Update, Downloadfortschritt und Installationsaufforderung prüfen, sofern Testrelease vorhanden.
- [ ] Externe HTTPS-/HTTP-Hilfelinks öffnen im Standardbrowser.
- [ ] E-Mail-Link öffnet das konfigurierte Mailprogramm.
- [ ] Datei-/Ordneraktionen öffnen nur den erwarteten lokalen Pfad.
- [ ] `file:`, `javascript:`, `data:` und unbekannte URL-Protokolle werden nicht extern ausgeführt.
- [ ] Externe URL mit eingebetteten Zugangsdaten wird abgewiesen.

## 26. Persistenz und Wiederanlauf

- [ ] App nach jeder CRUD-Aktion schließen und neu öffnen.
- [ ] Filter, Spalten, Theme, Navigation und Seitengröße bleiben wie vorgesehen erhalten.
- [ ] Offene/teilweise bezahlte Status bleiben korrekt.
- [ ] Budget-/Zweckbindungs-Mehrfachzuordnungen bleiben vollständig.
- [ ] Anhänge sind weiterhin lesbar.
- [ ] Organisation und Datenbankpfad bleiben korrekt.
- [ ] App startet auch nach einem erzwungenen Prozessabbruch ohne beschädigte Datenbank.
- [ ] Migration einer Kopie einer älteren VereinO-Datenbank funktioniert.

## 27. Fehlerfälle und Robustheit

- [ ] Pflichtfelder leer lassen und Fehlermeldungen auf Verständlichkeit prüfen.
- [ ] Doppelklick auf Speichern erzeugt keinen doppelten Datensatz.
- [ ] Sehr große Datei und nicht unterstützten Dateityp testen.
- [ ] Nicht vorhandene/verschobene Anhangdatei testen.
- [ ] Schreibgeschützten Zielordner bei Export und Backup testen.
- [ ] Datenträger-voll-Situation nach Möglichkeit in einer isolierten Testumgebung simulieren.
- [ ] Sehr lange Suchtexte und Sonderzeichen führen nicht zu SQL-/UI-Fehlern.
- [ ] 1.000+ Buchungen: Journal, Suche, Filter, Dashboard und Reports bleiben bedienbar.
- [ ] Mehrfaches Öffnen/Schließen von Modalen erzeugt keine doppelten Events oder Toasts.
- [ ] Keine unverständlichen Electron-IPC-Präfixe in Fehlermeldungen.

## 28. Abschlusskontrolle

- [ ] Ausgangszahlen und Endzahlen sind durch die ausgeführten Testaktionen erklärbar.
- [ ] Keine Daten der zweiten Testorganisation wurden verändert.
- [ ] Automatisches und manuelles Backup sind vorhanden und inspizierbar.
- [ ] App einmal aus dem Produktions-Build statt nur aus dem Dev-Server starten.
- [ ] Entwicklerkonsole enthält keine neuen unbehandelten Fehler.
- [ ] Gefundene Fehler mit Testabschnitt, Schritten, erwartetem und tatsächlichem Ergebnis dokumentieren.

## Empfohlene Reihenfolge bei wenig Zeit

1. Kritischer Schnelltest
2. Buchungen, Transfers und interne Buchungen
3. Budget-/Zweckbindungszuordnungen
4. Backup/Wiederherstellung und Jahresabschluss
5. Verbindlichkeiten, Mitglieder und Vorschüsse
6. Reports/Exporte und Anhänge
7. Organisationstrennung und Persistenz
