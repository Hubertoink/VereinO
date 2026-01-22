# VereinO – Finanzmanagement für gemeinnützige Vereine

<p align="center">
  <strong>Offline-first Desktop-App für die moderne Vereinsbuchhaltung</strong><br>
  Cross-Platform • Electron + React + TypeScript • MIT License
</p>

---

## 📋 Inhaltsverzeichnis

- [Über das Projekt](#-über-das-projekt)
- [Features](#-features)
- [Installation](#-installation)
- [Verwendung](#-verwendung)
- [Online-Plattform](#-online-plattform--submission-portal)r
- [Technologie-Stack](#-technologie-stack)
- [Lizenz](#-lizenz)

---

## 🎯 Über das Projekt

**VereinO** ist eine speziell für gemeinnützige Vereine entwickelte Finanzverwaltungssoftware. Die App ermöglicht eine einfache und übersichtliche Buchführung – komplett offline nutzbar, mit optionaler Cloud-Synchronisation.

Die Anwendung unterstützt die besonderen Anforderungen gemeinnütziger Organisationen, einschließlich der korrekten Sphärentrennung (ideeller Bereich, Zweckbetrieb, Vermögensverwaltung, wirtschaftlicher Geschäftsbetrieb) und zweckgebundener Mittelverwendung.

---

## ✨ Features

### 📊 Dashboard
- **KPI-Karten**: Kassenstand, Einnahmen/Ausgaben pro Monat, offene Zweckmittel, nicht zugeordnete Belege
- **Charts**: Visualisierung von Einnahmen/Ausgaben nach Sphäre, Budget vs. Ist-Vergleich
- **Aktivitätsfeed**: Übersicht der letzten Buchungen, Abschlüsse und Import/Export-Vorgänge

### 💰 Buchungsverwaltung (Journal)
- Erfassung von Einnahmen, Ausgaben und Umbuchungen
- Unterstützung für Bar- und Bankzahlungen
- Automatische Belegnummerierung
- Mehrstufige MwSt-Sätze
- Kategorisierung nach Sphären (IDEELL, ZWECK, VERMÖGEN, WGB)

### 🏷️ Zweckbindungen (Earmarks)
- Verwaltung zweckgebundener Spenden und Fördermittel
- Nachverfolgung der Mittelverwendung
- Automatische Prüfung auf korrekte Verwendung

### 📈 Budgets
- Jahresbudgets pro Sphäre und Kategorie
- Echtzeit-Verfolgung von Budget vs. tatsächlichen Ausgaben
- Zeitraumbasierte Budgetierung

### 👥 Mitgliederverwaltung
- Vollständige Mitgliederdatenbank
- Verknüpfung mit Buchungen (Spenden, Beiträge)
- Such- und Filterfunktionen

### 📎 Belegverwaltung
- Digitale Erfassung und Speicherung von Belegen
- Verknüpfung mit Buchungen
- Anhänge-Management

### 📑 Reports & Export
- Export-Funktionen für Berichte
- Excel-Export (ExcelJS)
- Individuelle Auswertungen

### 🔒 Datensicherheit
- **Lokale SQLite-Datenbank**: Alle Daten bleiben auf deinem Gerät
- **Backup & Restore**: Einfacher Export/Import der Datenbank
- **Smart Restore**: Intelligente Wiederherstellung bei Datenbankproblemen
- **Audit-Trail**: Protokollierung aller Änderungen

### ⚙️ Einstellungen
- Anpassbare Geschäftsjahre
- Perioden-Sperrung für abgeschlossene Zeiträume
- Vereinsdaten und Freistellungsbescheid
- Datenbank-Management (Import/Export)

---

## 🚀 Installation

### Voraussetzungen

- **Node.js** 20 oder höher
- **npm** (wird mit Node.js installiert)
- **Git** (zum Klonen des Repositories)

### Schritt 1: Repository klonen

```bash
git clone https://github.com/Hubertoink/VereinO.git
cd VereinO
```

### Schritt 2: Abhängigkeiten installieren

```bash
npm install
```

### Schritt 3: Entwicklung starten (optional)

Um die App im Entwicklungsmodus zu starten:

```bash
npm run dev
```

### Schritt 4: Ausführbare Datei (EXE) erstellen

Um eine installierbare Desktop-Anwendung zu erstellen:

```bash
# Projekt bauen
npm run build

# App paketieren (erstellt EXE für Windows, DMG für macOS, AppImage für Linux)
npm run package
```

Nach dem Paketieren findest du die erstellten Dateien im `dist/` oder `out/` Ordner:

| Betriebssystem | Dateiformat |
|----------------|-------------|
| Windows        | `.exe` (Installer) |
| macOS          | `.dmg` |
| Linux          | `.AppImage` |

### Alternative: Direkte Release-Downloads

Vorbereitete Installationsdateien können (falls verfügbar) direkt von der [Releases-Seite](https://github.com/Hubertoink/VereinO/releases) heruntergeladen werden.

---

## 📖 Verwendung

### Erste Schritte

1. **App starten**: Öffne die installierte Anwendung
2. **Setup-Wizard**: Beim ersten Start führt dich ein Assistent durch die Grundkonfiguration
3. **Vereinsdaten eingeben**: Name, Adresse, Bankverbindung
4. **Erste Buchung**: Nutze den Quick-Add Button (`+ Buchung`) für schnelle Erfassung

### Datenbank sichern

1. Gehe zu `Einstellungen → Allgemein → Datenbank`
2. Klicke auf `Exportieren`
3. Wähle einen Speicherort für die Backup-Datei (.sqlite)

### Datenbank wiederherstellen

1. Gehe zu `Einstellungen → Allgemein → Datenbank`
2. Klicke auf `Importieren…`
3. Wähle eine vorhandene SQLite-Datei

> ⚠️ **Achtung**: Beim Import wird die aktuelle Datenbank vollständig ersetzt!

---

## 🌐 Online-Plattform – Submission Portal

Für Vereinsmitglieder, die Ausgaben einreichen möchten, steht ein **Submission Portal** zur Verfügung:

### 🔗 [https://vereino.kassiero.de](https://vereino.kassiero.de)

Das Portal ermöglicht einen einfachen Workflow für die Belegeinreichung:

#### Für Mitglieder (Einreicher)
- **Buchungen anlegen**: Ausgaben mit allen relevanten Daten erfassen
- **Belege hochladen**: Digitale Kopien von Quittungen und Rechnungen anhängen
- **Als JSON exportieren**: Eingereichte Buchungen als JSON-Datei herunterladen
- **An Kassierer senden**: JSON-Export per E-Mail oder Dateifreigabe übermitteln

#### Für Kassierer (in der VereinO Desktop-App)
- **JSON importieren**: Eingereichte Buchungen in der App prüfen
- **Validieren**: Belege und Beträge kontrollieren
- **Übernehmen**: Geprüfte Buchungen in die offizielle Buchhaltung aufnehmen

### Workflow

```
┌─────────────────┐    JSON-Export    ┌──────────────────┐
│  Mitglied       │ ───────────────► │  Kassierer       │
│  (Portal)       │                   │  (Desktop-App)   │
├─────────────────┤                   ├──────────────────┤
│ • Buchung       │                   │ • Import prüfen  │
│   anlegen       │                   │ • Validieren     │
│ • Beleg         │                   │ • In Journal     │
│   hochladen     │                   │   übernehmen     │
│ • JSON Export   │                   │                  │
└─────────────────┘                   └──────────────────┘
```

Diese Trennung ermöglicht:
- **Dezentrale Erfassung**: Mitglieder können von überall Ausgaben einreichen
- **Zentrale Kontrolle**: Der Kassierer behält die volle Kontrolle über die Buchhaltung
- **Offline-Fähigkeit**: Die Hauptbuchhaltung bleibt offline und sicher

---

## 🛠️ Technologie-Stack

### Desktop-App (Frontend)
- **Electron** – Cross-Platform Desktop Framework
- **React** – UI-Bibliothek
- **TypeScript** – Typsichere Entwicklung
- **Vite** – Build-Tool & Dev-Server
- **SQLite (better-sqlite3)** – Lokale Datenbank

### Backend (Submission Portal)
- **Fastify** – Web-Framework
- **PostgreSQL** – Relationale Datenbank
- **Zod** – Schema-Validierung
- **JWT** – Token-basierte Authentifizierung
- **Docker** – Container-Deployment

### Entwicklungstools
- **ESLint & Prettier** – Code-Qualität
- **Playwright** – E2E-Tests
- **VS Code** – IDE-Integration mit Tasks & Debugging

---

## 📁 Projektstruktur

```
VereinO/
├── electron/
│   ├── main/           # Electron Main-Prozess
│   │   ├── db/         # Datenbank-Logik
│   │   ├── ipc/        # IPC-Handler
│   │   ├── repositories/  # Datenzugriffsschicht
│   │   └── services/   # Business-Logik
│   └── preload/        # Preload/IPC-Brücke
├── src/
│   ├── renderer/       # React-Anwendung
│   │   ├── components/ # UI-Komponenten
│   │   ├── views/      # Seiten/Views
│   │   ├── hooks/      # Custom React Hooks
│   │   └── context/    # React Context Provider
│   └── App.tsx         # Root-Komponente
├── backend/            # Submission Portal API (Fastify)
├── shared/             # Gemeinsame Typen
└── docs/               # Dokumentation
```

---

## 📄 Lizenz

Dieses Projekt ist unter der **MIT-Lizenz** lizenziert. Siehe [LICENSE](LICENSE) für weitere Details.

---

## 🤝 Mitwirken

Beiträge sind willkommen! So kannst du helfen:

1. Fork das Repository
2. Erstelle einen Feature-Branch (`git checkout -b feature/NeuesFeature`)
3. Committe deine Änderungen (`git commit -m 'Add NeuesFeature'`)
4. Push zum Branch (`git push origin feature/NeuesFeature`)
5. Öffne einen Pull Request

---

## 📞 Kontakt & Support

- **GitHub Issues**: [https://github.com/Hubertoink/VereinO/issues](https://github.com/Hubertoink/VereinO/issues)
- **Submission Portal**: [https://vereino.kassiero.de](https://vereino.kassiero.de)

---

<p align="center">
  Made with ❤️ für gemeinnützige Vereine
</p>
