# Modularisierungsplan für AIView

Stand: 05.09.2026. Ausgangspunkt: `src/renderer/views/AI/AIView.tsx` mit 5.685 Zeilen.

## Ziel und Umfang

Die View soll nach dem Refactoring etwa **400–650 Zeilen** umfassen. Abnahmekriterium sind **höchstens 750 Zeilen inklusive Imports und Leerzeilen**, damit ausreichend Abstand zur Grenze von 1.000 Zeilen bleibt.

Die View verbindet anschließend die bestehenden UI-Hooks, die fachlichen Workflows und die Darstellung. Fachliche Entscheidungen, IPC-Aufrufe, Snapshot-Verarbeitung und größere JSX-Blöcke erhalten eigene Module. Die vorhandenen Auslagerungen werden weiterverwendet. Dieser Plan beschreibt die weitere Umsetzung; er ändert noch keine Laufzeitlogik.

## Bestandsaufnahme

Die Zeilenangaben beziehen sich auf den Ausgangsstand und dienen nur zur Orientierung.

| Bereich | Aktuelle Funktionen / Stellen | Vorgesehene Module |
| --- | --- | --- |
| Review-Zustand | `pending*`-States ab Zeile 305, `hasOpenReviewWorkflow`, Reset und Wiederherstellung | `aiReviewState.ts`, `useAiReviewState.ts` |
| Agent-Integration | `prepareAgentDraft` ab 380, `agentUiContext` ab 668, Wissen und Trace | `aiAgentDrafts.ts`, `aiAgentContext.ts`, `useAiAgentKnowledge.ts`; vorhandenen `useAiAgentWorkflow` weiterverwenden |
| Jobs und Referenzdaten | `loadJobs`, `selectJob`, Konten, Erwähnungen, Job-Wiederherstellung, Historienfilter | `useAiJobs.ts`, `useAiReferenceData.ts`; vorhandenen `useAiHistoryActions` anschließen |
| Chat-Lebenszyklus | Organisationswechsel ab 998, Snapshot-Effekt ab 1080, `startNewChat` | `useAiChatSession.ts`, vorhandenes `aiChat.ts` |
| Buchungsnavigation | `openMessageBookingDraft`, `openVoucherMention`, QuickAdd-Listener, Kandidaten als Entwurf öffnen | `useAiBookingNavigation.ts` |
| Dokumente und Text | `processDocuments`, `processFileTextTask`, `processText`, `answerToolResultWithAi`, Gesprächskontext | `useAiDocumentWorkflow.ts`, `useAiTextWorkflow.ts`, `aiConversation.ts` |
| Berichte | `loadReportVouchers`, `buildReportKpiData`, `processReportExport` | `aiReportData.ts`, `useAiReportWorkflow.ts` |
| Mitglieder | Anlage, Follow-ups, Lesen, Änderungen ab 1711–2438, dazwischen Beitragslogik | `aiMemberData.ts`, `useAiMemberWorkflow.ts`; bestehendes `aiMemberDomain.ts` ergänzen |
| Beiträge | Fälligkeiten laden, Zahlungsplan auswerten, Beitragsbuchung und Verknüpfungen | `aiContributionData.ts`, `useAiContributionWorkflow.ts` |
| Dauerbuchungen | `applyPendingRecurringBooking` und zugehöriger Entwurfszustand | `useAiRecurringBookingWorkflow.ts` |
| Tags und Stammdaten | Lookup-Funktionen, Tag-Entwürfe, Geschäftspartner-, Budget- und Zweckbindungsaktionen ab 2557 | `aiMasterDataLookup.ts`, `useAiTagWorkflow.ts`, `useAiMasterDataWorkflow.ts` |
| Buchungsänderungen | Buchungs-Tags, Metadaten, Storno, Ersatzbuchung ab 3138–3595 | `useAiVoucherTagWorkflow.ts`, `useAiVoucherUpdateWorkflow.ts`, `useAiVoucherCorrectionWorkflow.ts` |
| Offene Posten | `toggleInvoiceAction`, `applyPendingInvoiceActions` | `useAiInvoiceWorkflow.ts` |
| Bankprüfung | `processBankImport`, `updateBankSuggestion`, Bankverknüpfungen, Aktionen und Follow-ups ab 3596–3936 | `useAiBankReviewWorkflow.ts`, `useAiBankLinkWorkflow.ts`; bestehendes `aiBankReview.ts` ergänzen |
| Kandidatenfreigabe | Zahlungskonto-Follow-up, fehlende Tags, Planner-Rückfrage, Buchungsausführung ab 4017–4331; Kandidatenaktionen ab 5238 | `useAiBookingReviewWorkflow.ts`, `aiBookingReviewPlan.ts` |
| Prompt-Orchestrierung | `executeAiActionPlan` mit ca. 239 Zeilen und `submitPrompt` mit ca. 640 Zeilen | `aiPromptDecision.ts`, `aiActionPlanExecutor.ts`, `useAiPromptSubmission.ts` |
| Darstellung | `renderComposer` und JSX ab 5298 | `AiHeader.tsx`, `AiReviewPanel.tsx`, `AiBookingReviewCard.tsx`, `AiDrawers.tsx` |

Die Bereiche überlappen teilweise. Ihre Größen dürfen deshalb nicht als unabhängige Einsparungen addiert werden.

## Regeln für die Modulgrenzen

1. **Ein Eigentümer pro Zustand.** `useAiReviewState` verwaltet die typisierten Review-Slices; Jobs gehören `useAiJobs`, Nachrichten weiterhin `useAiMessages`, Eingaben weiterhin `useAiComposer`. Fachliche Hooks erhalten nur ihren benötigten State und ihre benötigten Aktionen. Sie halten keine zweite Kopie desselben Entwurfs.
2. **Reine Berechnung von Seiteneffekten trennen.** Kontextaufbereitung, Entwurfsnormalisierung, KPI-Berechnung und Routing-Entscheidungen sind Funktionen ohne React oder `window`. Datenmodule laden über schmale, typisierte API-Schnittstellen; Workflow-Hooks koordinieren diese Aufrufe und Zustandsänderungen.
3. **Gerichtete Abhängigkeiten.** Die View setzt Module zusammen. Workflows dürfen gemeinsame Datenmodule verwenden, aber nicht gegenseitig ihre Hooks importieren. Beispielsweise verwenden Bericht und Beitrag dieselbe Fälligkeitsabfrage; Buchung und Stammdaten dieselben Lookups.
4. **Typisierte Grenzen.** Review-Aktionen und Routing-Ergebnisse erhalten diskriminierte Unions. Kein universelles `Record<string, any>` als Ersatz für die bisherigen Abhängigkeiten. Zunächst die vorhandenen IPC- und Domänentypen verwenden.
5. **Kleine Schnittstellen zur Darstellung.** Fachlich gruppierte Modelle wie `{ state, actions }` an Review-Komponenten übergeben. Kein globaler Context nur zur Vermeidung von Props und kein mehrere Tausend Zeilen großer `useAiViewController`.
6. **Ausführung und UI-Busy unterscheiden.** Ein gemeinsamer Auftragsrahmen übernimmt die Sperre gegen parallele Ausführung und deren Freigabe. Unteraktionen dürfen die Sperre nicht vor Abschluss des gesamten Auftrags lösen. Direkte Kartenaktionen und Prompt-Aktionen verwenden dieselben fachlichen Operationen.
7. **Bestehendes Verhalten zuerst festhalten.** Reihenfolge konkurrierender Prompt-Zweige, lokale Aktionen ohne API-Key, Fehlermeldungen, Teilerfolge und Wiederholungsverhalten werden vor der jeweiligen Umstellung durch Tests erfasst. Fachliche Änderungen werden gesondert ausgewiesen.

## Umsetzung in acht Schritten

### 1. Verhalten und Zustandsgrenzen absichern

- Die Prioritäten von `submitPrompt` und `executeAiActionPlan` als Entscheidungstabelle dokumentieren: offene Reviews, Korrekturwünsche, Anhänge, Agent-Runtime, lokale Aktionen und allgemeine Textanfragen.
- Bestehende Review-Typen zu einem gemeinsamen `AiReviewState` bündeln; Zustandsaktionen für Ersetzen, Aktualisieren, Wiederherstellen und Zurücksetzen bereitstellen.
- Gemeinsame Selektoren für offene Workflows verwenden. Unterschiedliche fachliche Endzustände (`CREATED`, `APPLIED`, `RESOLVED`, gebuchte Kandidaten) bleiben explizit.
- Reset und Snapshot-Restore müssen sämtliche Review-Slices erfassen. Keine neue Persistenzstruktur ohne Kompatibilität mit vorhandenen Snapshots.

Abnahme: Tests für vollständigen Reset/Restore, verschiedene Endzustände und die erfassten Routing-Prioritäten.

### 2. Agent- und Datenaufbereitung herauslösen

- `prepareAgentDraft` in nach Draft-Art getrennte Mapper überführen. Die Mapper liefern typisierte Review-Updates und Nachrichten; die Integration führt sie aus.
- `agentUiContext` als reine Projektion extrahieren, einschließlich vorhandener Begrenzungen für Samples und Kandidatenlisten.
- Agent-Wissen, Referenzdaten, Jobs und deren Auswahl in die vorgesehenen Hooks verschieben.
- Hilfsfunktionen für Dateikonvertierung und Nutzungsformatierung in passende bestehende Domänenmodule oder kleine Hilfsmodule verschieben.

Abnahme: repräsentative Agent-Drafts einschließlich Auto-Regel-Metadaten, ungültige/leere Payloads, unveränderte Kontextfelder, Job- und Kandidatenauswahl.

### 3. Fachliche Lese- und Vorbereitungsabläufe auslagern

- Dokumentanalyse, dateibasierte Textaufträge, generische Textantworten und Gesprächskontext separieren.
- Mitgliederlisten, Beitragsfälligkeiten, Tags, Budget-/Zweckbindungs-Lookups und Berichtsdaten in gemeinsam verwendbare Datenmodule verschieben.
- Berichtsberechnung vom Laden und Exportieren trennen.
- Mitgliederanlage und -änderung sowie Beitragsentwürfe in ihre Workflow-Hooks verschieben.

Abnahme: Pagination, Datums-/Betragsübernahme, Bericht ohne API-Key, Anhänge und bestehende Vorschau-/Entwurfsresultate.

### 4. Fachliche Schreibaktionen auslagern

- Mitglieds-, Beitrags-, Dauerbuchungs-, Tag-, Stammdaten- und Rechnungsaktionen in ihre jeweiligen Hooks verschieben.
- Buchungs-Tags, Metadatenkorrekturen, Storno und Ersatzbuchung getrennt halten.
- Gemeinsame Toggle-/Auswahloperationen nur dort vereinheitlichen, wo die Zustandsregeln tatsächlich gleich sind.
- Erfolgsmeldungen, lokale Zustandsaktualisierung, `dispatchDataChanged`, `onBooked` und Nachladen pro Operation vollständig übernehmen.

Abnahme: ausgewählte gegenüber abgewählten Einträgen, bereits angewendete Einträge, Teilfehler, erneutes Ausführen nach Teilfehlern, Aktualisierungsereignisse. Tests verwenden gemockte IPC-Aufrufe.

### 5. Bank- und Buchungsreview abschließen

- Bankvorschläge, bestehende Buchungen verknüpfen und Dauerbuchungszuordnung in die Bank-Workflows verschieben.
- Kandidaten speichern/freigeben, Zahlungskonto-Follow-ups und Rückfragen zu fehlenden Tags in den Buchungsreview verschieben.
- QuickAdd-Navigation und den Saved-Listener auslagern; Listener-Lebenszyklus und Zuordnung über die Draft-ID erhalten.
- Gemeinsame Tag- und Lookup-Operationen als explizite Abhängigkeiten übergeben, damit keine zyklischen Workflow-Abhängigkeiten entstehen.

Abnahme: gebuchte Kandidaten werden nicht erneut verarbeitet; Mehrfachkandidaten, Rückfrage-Abbruch, fehlende Tags, Bankbeleg-Verknüpfung und gespeicherte QuickAdd-Entwürfe.

### 6. Prompt-Verarbeitung neu zusammensetzen

- Den vorhandenen `aiPromptRouter` als Fallback weiterverwenden und davor die erfassten Regeln für Follow-ups und offene Reviews abbilden.
- Routing liefert eine typisierte Entscheidung; ein separater Executor ruft die zugehörige Workflow-Aktion auf.
- Lokale, zustandsabhängige Follow-ups mit asynchroner Prüfung behalten einen ausdrücklichen Rückgabewert für „behandelt“ bzw. „nicht behandelt“. Keine Seiteneffekte in reine Routing-Prädikate verschieben.
- `useAiPromptSubmission` beschränkt sich auf Eingabeprüfung, Ausführungssperre, Benutzernachricht, Routing/Ausführung, Fehlerbehandlung und Eingabeabschluss.
- Wiederholte `try/catch/finally`-Blöcke erst nach den Verhaltenstests zusammenführen. Unterschiedliche Fehlertitel und Regeln zum Leeren der Eingabe erhalten.
- `executeAiActionPlan` ruft die bereits extrahierten Aktionen auf. Die Prioritäten werden ausdrücklich festgelegt, nicht durch eine zufällige Registrierungsreihenfolge.

Abnahme: mehrdeutige Prompts, Korrektur statt Bestätigung, mehrere offene Reviews, Anhänge, fehlender API-Key, Agent-Fallback, genau eine Benutzernachricht und kein doppelter Schreibaufruf je Auftrag.

### 7. Chat-Lebenszyklus und JSX verkleinern

- `useAiChatSession` koordiniert Restore, Persistierung, neuen Chat und Organisationswechsel über die bereits definierten Zustandsaktionen.
- Asynchrone Ergebnisse einem Organisations-/Sitzungsstand zuordnen. Verspätete Ergebnisse dürfen keinen neueren Chat überschreiben. Offene Stream-/UI-Timer beim Reset prüfen.
- Header, Review-Zusammenstellung, Buchungskandidatenkarte und Drawer-Zusammenstellung extrahieren. Die vorhandenen Einzelkarten bleiben die Darstellungsbausteine.
- Die View enthält danach primär die Zusammensetzung der Hooks, wenige übergreifende Selektoren und das Seitenlayout.

Abnahme: Organisationswechsel während laufender Ladevorgänge, neuer Chat während Nachrichtenanimation, Snapshot nach Neustart, Drawer-Bedienung und Review-Navigation. Integrationsprüfung in Electron mit Testdaten.

### 8. Endprüfung und Größenkontrolle

- Lint, beide Typechecks und alle betroffenen Tests ausführen; abschließend die gesamte Jest-Suite ausführen und vorhandene unabhängige Fehler getrennt ausweisen.
- Die wichtigsten Nutzerabläufe in Electron prüfen: Dokument → Vorschlag → Buchung; Mitgliederänderung → Bestätigung; Bankreview → Verknüpfung; neuer Chat und Organisationswechsel.
- Ungenutzte Imports, doppelte Typen und durch die Migration überflüssig gewordene Wrapper entfernen.
- `AIView.tsx` auf höchstens 750 Zeilen prüfen. Neue Fachmodule möglichst bei 150–400 Zeilen halten; Module über etwa 500 Zeilen nochmals auf mehrere Verantwortlichkeiten prüfen.
- Importzyklen und übergroße Parameterobjekte prüfen. Reine Zeilenverschiebung in einen zentralen Controller erfüllt die Abnahme nicht.

## Zeilenbudget für die fertige View

| Bestandteil | Geplantes Budget |
| --- | ---: |
| Imports, Props und kleine UI-Konstanten | 40–60 |
| Zusammensetzung der Hooks und Workflow-Abhängigkeiten | 180–260 |
| Übergreifende UI-Ableitungen und Adapter | 50–100 |
| Seitenlayout und Komponentenaufrufe | 130–200 |
| **Gesamt** | **400–620** |

Das Budget ist eine Planungsschätzung. Die feste Abnahmegrenze von 750 Zeilen lässt Reserve für lesbare Formatierung und notwendige Integration. Jeder Schritt soll als eigener prüfbarer Änderungssatz mit passenden Tests umgesetzt werden; fachliche Module können dabei nacheinander migriert werden.
