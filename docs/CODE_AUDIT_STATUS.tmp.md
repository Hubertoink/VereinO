# Offene Codeverbesserungen

Stand: 17.11.2026. Temporäre Arbeitsliste; nur noch offene Bereiche. Die bisherigen IDs bleiben für die Zuordnung erhalten.

Nächster empfohlener Schritt: **N01 – Beitragsworkflow aus dem KI-Controller auslagern.**

## N01 – KI-Controller weiter nach Fachabläufen aufteilen

Status: **Offen**.

Evidenz: [AiAssistantController.tsx](../src/renderer/views/AI/AiAssistantController.tsx) hat weiterhin **4.847 Zeilen**. Unter anderem liegen `prepareContributionPayment` (ca. 1432), `createContributionPayment` (ca. 1634), `applyContributionLinks` (ca. 1701), Tagaktionen (ca. 1959), Rechnungsaktionen (ca. 2305) und Bankaktionen (ca. 2828) im selben Controller.

- [ ] Zuerst Beitragsvorbereitung, Zahlungsanlage und Verknüpfung als zusammenhängenden typisierten Workflow extrahieren.
- [ ] Bestehenden Review-State weiterverwenden; keine zweite Entwurfskopie einführen.
- [ ] Freigabe, Abbruch, Fehler/Teilerfolg sowie unveränderte IPC-Payloads und Routingpriorität absichern.
- [ ] Danach Tag-/Stammdaten-, Rechnungs- und Bankabläufe jeweils getrennt bearbeiten und einzeln abhaken.

Abnahme des ersten Schnitts: Beitragsablauf außerhalb des Controllers, unverändertes Verhalten in gezielten Ablaufprüfungen, bestehende KI-Suites und Typechecks grün. Die reine Zeilenzahl ist kein ausreichendes Abnahmekriterium.

## N02 – App-Buchungscontroller und abgedocktes Fenster auslagern

Status: **Offen**.

Evidenz: [App.tsx](../src/renderer/App.tsx) hat **3.887 Zeilen** und **105 `useState`-Aufrufe**. `DetachedQuickAddWindow` beginnt ca. 554, `saveDetachedEdit` ca. 962; `AppInner` beginnt ca. 1495 und enthält `savePlusEdit` ca. 2693. Beide Teile binden `useQuickAdd` ein, bleiben aber in derselben Datei mit Navigation und globalen Dialogen.

- [ ] Zunächst das zusammenhängende abgedockte Fenster einschließlich seines Lebenszyklus in ein eigenes Modul verschieben.
- [ ] Anschließend Buchungssteuerung des Hauptfensters über eine schmale typisierte Schnittstelle auslagern.
- [ ] Unterschiedliche Speicher-/Schließbedingungen beider Fenster erhalten; Gemeinsamkeiten vor einer Zusammenführung einzeln prüfen.

Abnahme: Speichern, Bearbeiten, Anhänge, Draft-Wechsel und Schließen in Haupt-/abgedocktem Fenster bleiben korrekt; Essential-Browserprüfungen und Typechecks grün.

## N03 – Zentrale IPC-Registrierung weiter nach Domänen gliedern

Status: **Offen**.

Evidenz: [ipc/index.ts](../electron/main/ipc/index.ts) hat weiterhin **3.038 Zeilen**. Beispielsweise liegen Rechnungsaktionen (`invoices.*`, ca. 2466) und Rechnungsdateien (`invoiceFiles.*`, ca. 2537–2620) neben Settings, OCR und Organisationen.

- [ ] Rechnungs-/Dateikanäle als ersten zusammengehörigen Registrierungsbereich extrahieren, orientiert am vorhandenen Mitgliederimport-Modul.
- [ ] Kanalnamen, Zod-Verträge, Berechtigungen und Datenänderungsbenachrichtigungen unverändert erhalten.

Abnahme: Zentrale Registrierung ruft das Domänenmodul auf; Handler-Tests prüfen Vertragsfehler, Mutationen und Benachrichtigungen; keine doppelte Kanalregistrierung.

## N05 – Vollserialisierung der Submission-Anhänge untersuchen und reduzieren

Status: **Offen**.

Evidenz: `saveToStorage` in [submission-web/src/app.js](../submission-web/src/app.js), ca. 498, führt weiterhin `JSON.stringify(nextSubmissions)` und `localStorage.setItem(...)` für die gesamte Liste einschließlich eingebetteter Bilddaten aus.

- [ ] Mit repräsentativen Bildmengen serialisierte Größe und Speicherzeit messen; es liegt bisher keine Laufzeitmessung vor.
- [ ] Darauf basierend Anhänge getrennt persistieren, statt sie bei jeder Listenänderung erneut zu serialisieren; Migration vorhandener Daten berücksichtigen.
- [ ] Exportformat, Reload, fehlgeschlagene Speicherung und Datenmigration absichern.

Abnahme: Bestandsdaten bleiben lesbar/exportierbar; unveränderte Anhänge werden bei Listenänderungen nicht erneut vollständig serialisiert; Speicherfehler bleiben sichtbar und zerstören keinen Formularzustand.
