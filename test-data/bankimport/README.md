# CAMT-Testdaten für Dauerbuchungen

Die Dateien sind auf die im Testprofil gezeigten Dauerbuchungen abgestimmt. Sie enthalten ausschließlich fiktive Testdaten.

## Import

1. `dauerbuchungen-bank-camt053.xml` im Bankimport öffnen und manuell dem Zahlkonto **Bank** zuweisen. Die IBAN in der Datei ist absichtlich eine Test-IBAN.
2. `dauerbuchungen-volksbank-camt053.xml` öffnen und dem Zahlkonto **Volksbank** zuweisen.
3. Jeden offenen Bankbeleg öffnen und die vorgeschlagene Dauerbuchung prüfen.

## Erwartete Treffer

| Datei | Bankbeleg | Erwartung |
| --- | --- | --- |
| Bank | Abo Zeitung, 20,00 €, 20.07.2026 | Bereits gebuchte Juli-Buchung wird vorgeschlagen |
| Bank | Adobe Intune, 6,00 €, 20.07.2026 | Bereits gebuchte Juli-Buchung wird vorgeschlagen |
| Bank | Canva, 14,00 €, 20.07.2026 | Bereits gebuchte Juli-Buchung wird vorgeschlagen; die beendete Vorlage wird nicht erneut ausgeführt |
| Volksbank | Adobe Photoshop, 10,00 €, 20.07.2026 | Bereits gebuchte Juli-Buchung hat Vorrang vor der nächsten Wochenfälligkeit |
| Volksbank | Aldi, 25,00 €, 20.07.2026 | Bereits gebuchte Juli-Buchung wird vorgeschlagen |

In diesem Testszenario ist **Zuordnen** die erwartete Aktion. Sie verbindet den Bankbeleg mit der vorhandenen Juli-Buchung und darf keine zweite Buchung erzeugen.

Damit wird die Richtung „Dauerbuchung zuerst, Bankimport danach“ getestet. Für die Gegenrichtung kann nach einem Reset zuerst die CAMT-Datei importiert und anschließend eine noch nicht gebuchte Fälligkeit über **Buchen & zuordnen** verarbeitet werden.

Die Dateien besitzen feste Bankreferenzen. Ein erneuter Import wird deshalb korrekt als Duplikat erkannt. Für einen vollständigen Wiederholungstest entweder die Testorganisation zurücksetzen oder die Referenzen in einer Kopie der XML-Datei ändern.
