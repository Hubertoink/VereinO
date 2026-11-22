# Submission Web App - Architektur

Diese Dokumentation beschreibt den Aufbau der mobilen Web-App für Buchungseinreichungen.

## Übersicht

Die Submission Web App ermöglicht Vereinsmitgliedern, Buchungen (Belege) über ihr Smartphone einzureichen. Der Kassier kann diese dann in der VereinO Desktop-App prüfen und als echte Buchungen übernehmen.

```
┌─────────────────────────────────────────────────────────────────┐
│                    MITGLIED (Smartphone)                        │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │              Submission Web App (PWA-ready)               │  │
│  │                  localhost:3333 / Mittwald                │  │
│  └─────────────────────────┬─────────────────────────────────┘  │
│                            │                                    │
│                    JSON-Datei Export                            │
│                            │                                    │
└────────────────────────────┼────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                     KASSIER (Desktop)                           │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │              VereinO Electron App                         │  │
│  │                                                           │  │
│  │  ┌─────────────────┐    ┌─────────────────────────────┐   │  │
│  │  │ JSON Import     │───▶│ Einreichungen View          │   │  │
│  │  └─────────────────┘    │ - Prüfen / Bearbeiten       │   │  │
│  │                         │ - Genehmigen → Buchung      │   │  │
│  │                         │ - Ablehnen / Löschen        │   │  │
│  │                         └─────────────────────────────────┘   │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## Projektstruktur

```
submission-web/
├── Dockerfile              # Docker-Container für Deployment
├── README.md               # Kurzanleitung
├── ARCHITECTURE.md         # Diese Datei
├── package.json            # Dependencies (Vite, Express)
├── vite.config.js          # Vite Build-Konfiguration
├── server.js               # Express-Server für Production
├── src/
│   ├── index.html          # Haupt-HTML mit allen Views
│   ├── app.js              # JavaScript-Logik
│   └── styles.css          # Alle CSS-Styles
└── dist/                   # Build-Output (generiert)
```

## Technologie-Stack

| Komponente | Technologie | Zweck |
|------------|-------------|-------|
| Frontend | Vanilla JS | Keine Framework-Abhängigkeit, kleine Bundle-Größe |
| Build | Vite | Schnelles Bundling, Hot Reload in Dev |
| Server | Express.js | Statisches File-Serving in Production |
| Container | Docker | Deployment auf Mittwald/Server |
| Storage | IndexedDB | Einreichungen und Belegdateien auf dem Gerät |

## Datenfluss

### 1. Eingabe (Web App)

```javascript
// Submission-Objekt im JSON-Export
{
  id: "sub_1733000000000_abc123",    // Eindeutige ID
  date: "2025-12-04",                 // Buchungsdatum
  type: "OUT",                        // OUT = Ausgabe, IN = Einnahme
  sphere: "IDEELL",                   // Sphäre (IDEELL, ZWECK, VERMOEGEN, WGB)
  grossAmount: 15000,                 // Betrag in CENT (150,00 €)
  description: "Vereinsmaterial",     // Beschreibung
  counterparty: "Baumarkt XY",        // Zahler/Empfänger
  categoryHint: "Material",           // Kategorie-Hinweis
  submittedBy: "Max Mustermann",      // Einreicher
  submittedAt: "2025-12-04T10:30:00", // Zeitstempel
  attachment: {                       // Optional: Belegbild
    name: "beleg.jpg",
    mimeType: "image/jpeg",
    dataBase64: "..."                 // Base64-kodiertes Bild
  }
}
```

### 2. Export

Die App exportiert eine JSON-Datei mit allen Einreichungen:

```javascript
{
  exportedAt: "2025-12-04T12:00:00.000Z",
  submittedBy: "Max Mustermann",
  submissions: [ /* Array von Submission-Objekten */ ]
}
```

### 3. Import (Desktop App)

Die Desktop-App transformiert das Format:

```javascript
// Transformation in electron/main/ipc/index.ts
{
  // ... alle Felder ...
  attachments: [{                    // Umbenannt: attachment → attachments
    filename: "beleg.jpg",           // Umbenannt: name → filename
    mimeType: "image/jpeg",
    dataBase64: "..."
  }]
}
```

### 4. Genehmigung → Buchung

Bei Genehmigung wird ein Voucher erstellt:

```javascript
// In SubmissionsView.tsx
await window.api.invoke('vouchers.create', {
  date: draft.date,
  type: draft.type,
  grossAmount: draft.grossAmount / 100,  // CENT → EURO!
  description: draft.description,
  counterparty: draft.counterparty,
  sphere: draft.sphere,
  attachments: submission.attachments
})
```

⚠️ **Wichtig**: Die Web App speichert Beträge in **Cent**, die Voucher-API erwartet **Euro**!

## Views & Navigation

Die App verwendet eine Single-Page-Architektur mit drei Views:

```
┌─────────────────────────────────────────┐
│              Header                      │
│  "Buchung einreichen"     [Badge: 3]    │
├─────────────────────────────────────────┤
│                                         │
│              Main Content               │
│                                         │
│  [Form View]     - Neue Buchung         │
│  [List View]     - Eingereichte Liste   │
│  [Settings View] - Einreicher-Name      │
│                                         │
├─────────────────────────────────────────┤
│              Bottom Nav                 │
│  [➕ Neu]   [📋 Liste]   [⚙️ Einst.]   │
└─────────────────────────────────────────┘
```

## Komponenten (app.js)

### DOM-Referenzen
```javascript
const dateInput = document.getElementById('date')
const typeInput = document.getElementById('type')
const sphereInput = document.getElementById('sphere')
const amountInput = document.getElementById('amount')
// ... etc.
```

### Kernfunktionen

| Funktion | Zweck |
|----------|-------|
| `init()` | App initialisieren, Storage laden |
| `handleFormSubmit()` | Neue Buchung speichern |
| `renderSubmissionsList()` | Liste der Buchungen anzeigen |
| `handleDownload()` | JSON-Export generieren |
| `compressImage()` | Bildkompression für Uploads |
| `showToast()` | Feedback-Nachrichten |
| `showConfirm()` | Bestätigungs-Dialog |
| `showAlert()` | Info-Dialog (z.B. Sphäre-Hilfe) |

### Lokale Speicherung

Die IndexedDB-Datenbank `vereino-submissions` speichert Buchungen in Einfügereihenfolge und Belegdateien als Blobs. Speichern und Löschen ändern beide Object Stores in einer Transaktion. Der JSON-Export liest einen konsistenten Stand und kodiert die Anhänge als Base64.

Beim ersten Zugriff übernimmt die App die frühere Liste aus dem LocalStorage-Schlüssel `vereino-submissions`. Nach erfolgreichem Commit entfernt sie die alte Liste. Eine abgebrochene Migration lässt die Originaldaten intakt. Ein Migrationsvermerk pro Buchung schützt vor Duplikaten, falls der Browser zwischen Commit und Aufräumen geschlossen wurde. Der Name des Einreichers bleibt unter `vereino-submitter` im LocalStorage.

## Styling (styles.css)

### CSS-Variablen

```css
:root {
  --primary: #4f46e5;      /* Indigo */
  --success: #10b981;      /* Grün (Einnahmen) */
  --danger: #ef4444;       /* Rot (Ausgaben) */
  --surface: #ffffff;
  --border: #e2e8f0;
  --text: #1e293b;
  --radius: 12px;
}
```

### Dark Mode
```css
@media (prefers-color-scheme: dark) {
  :root {
    --surface: #1e1e2e;
    --text: #e2e8f0;
    /* ... */
  }
}
```

### Mobile-First
- Touch-optimierte Buttons (min. 44px Höhe)
- Safe-Area für Notch-Geräte
- Responsive Schriftgrößen

## Deployment

### Lokal (Development)
```bash
cd submission-web
npm install
npm run dev        # Vite Dev Server auf :5173
```

### Docker (Production)
```bash
cd submission-web
docker build -t vereino-submission-web .
docker run -d -p 3333:3333 --name vereino-submissions vereino-submission-web
```

### Mittwald
1. Docker-Image bauen und pushen
2. Container auf Mittwald starten
3. Domain/Subdomain konfigurieren

## Sicherheitshinweise

- **Keine Authentifizierung**: Die App ist für den internen Vereinsgebrauch gedacht
- **IndexedDB**: Buchungen und Belege bleiben auf dem Gerät des Nutzers
- **Bildkompression**: Reduziert Dateigrößen vor Export
- **Kein Server-Storage**: Keine Daten werden serverseitig gespeichert

## Erweiterungsmöglichkeiten

- [ ] PWA mit Service Worker für echte Offline-Funktion
- [ ] Push-Benachrichtigungen bei Genehmigung/Ablehnung
- [ ] QR-Code-Scanner für Belege
- [ ] Direkter API-Upload statt JSON-Download
- [ ] Multi-Verein Support mit Authentifizierung
