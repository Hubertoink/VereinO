# VereinO Submission Web

Mobile-first Web-App zum Einreichen von Buchungen für VereinO.

## Features

- 📱 **Mobile-first Design** – Optimiert für Smartphones
- 📷 **Beleg-Foto** – Direkt Foto aufnehmen oder Bild hochladen
- 📋 **Mehrere Buchungen** – Beliebig viele Buchungen sammeln
- 📥 **JSON Export** – Als `.vereino-submission.json` herunterladen
- 💾 **Lokale Speicherung** – Daten bleiben im Browser erhalten
- 🌙 **Dark Mode** – Unterstützt System-Präferenz

## Entwicklung

```bash
# Dependencies installieren
npm install

# Dev-Server starten
npm run dev
```

Öffne http://localhost:3000

## Deployment mit Docker

### Build & Run

```bash
# Zuerst den Vite-Build erstellen
npm run build

# Docker-Image bauen
docker build -t vereino-submission-web .

# Container starten
docker run -d -p 3000:3000 --name vereino-submission vereino-submission-web
```

### Mit Docker Compose

```bash
# Build und Start
docker-compose up -d --build

# Logs ansehen
docker-compose logs -f

# Stoppen
docker-compose down
```

### Mittwald Deployment

1. Repository auf dem Server klonen
2. In den `submission-web` Ordner wechseln
3. Build erstellen: `npm ci && npm run build`
4. Docker-Image bauen: `docker build -t vereino-submission-web .`
5. Container starten mit gewünschtem Port-Mapping

Alternativ mit docker-compose:
```bash
docker-compose up -d --build
```

### Reverse Proxy (optional)

Für HTTPS mit nginx als Reverse Proxy:

```nginx
server {
    listen 443 ssl http2;
    server_name buchung.deinverein.de;
    
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## Workflow

1. **Mitglied** öffnet die Web-App auf dem Handy
2. Gibt Buchungsdaten ein (Datum, Betrag, Beschreibung)
3. Fotografiert optional den Beleg
4. Fügt mehrere Buchungen zur Liste hinzu
5. Lädt JSON-Datei herunter
6. Sendet die Datei per E-Mail an den Kassier

7. **Kassier** importiert die Datei in VereinO Desktop
8. Prüft die Einreichungen
9. Kann Details vor Genehmigung bearbeiten
10. Genehmigt → Buchung wird automatisch erstellt

## JSON Format

```json
{
  "version": "1.0",
  "exportedAt": "2024-12-03T10:30:00.000Z",
  "submissions": [
    {
      "externalId": "abc123",
      "date": "2024-12-03",
      "type": "OUT",
      "grossAmount": 4999,
      "description": "Büromaterial",
      "counterparty": "Büro Schmidt",
      "categoryHint": "Verwaltung",
      "submittedBy": "Max Mustermann",
      "submittedAt": "2024-12-03T10:30:00.000Z",
      "attachment": {
        "name": "beleg.jpg",
        "mimeType": "image/jpeg",
        "dataBase64": "..."
      }
    }
  ]
}
```

## Technologie

- Vanilla JavaScript (kein Framework)
- Vite für Build
- Express.js für Production Server
- Docker für Deployment
