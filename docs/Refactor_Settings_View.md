# Settings View Refactoring Plan

## Ziel
Die **SettingsView** Komponente (ca. 1000+ Zeilen) aus `App.tsx` herauslösen und in eine eigenständige, wartbare Struktur überführen, ohne die Funktionalität zu beeinträchtigen.

## Aktueller Zustand (Analyse)

### Settings-Komponente in App.tsx
- **Zeilen**: ca. 5000-6500 (SettingsView + Sub-Panes)
- **Struktur**: Inline function component mit mehreren Sub-Panes (GeneralPane, TablePane, StoragePane, ImportPane, OrgPane, TagsPane, YearEndPane)
- **Props**: 20+ Props werden von App.tsx übergeben
- **State**: Lokaler State in jedem Sub-Pane für Modals, Busy-States, etc.
- **Dependencies**: 
  - `storage.ts` für Ordner-Auswahl
  - `DbMigrateModal` für Migrations-Dialoge
  - `window.api` für IPC-Calls
  - `notify` für Toast-Nachrichten
  - `bumpDataVersion` für globale Aktualisierungen

### Aktuelle Sub-Panes
1. **GeneralPane** (Darstellung & Layout)
   - Farb-Theme
   - Navigation (links/oben)
   - Journal-Stil (Zeilen, Dichte)
   - Datumsformat
   - Datenverwaltung (Export/Import DB)
   - Erweiterte Optionen (Alle Buchungen löschen)

2. **TablePane** (Spaltenkonfiguration)
   - Spalten-Sichtbarkeit
   - Spalten-Reihenfolge (DnD)
   - Preset-Buttons

3. **StoragePane** (Speicherort & Backup)
   - DB-Location Verwaltung
   - Backup-Erstellung/-Wiederherstellung
   - Auto-Backup Einstellungen
   - Smart Restore

4. **ImportPane** (Datenimport)
   - CSV Import
   - CAMT.053 Import

5. **OrgPane** (Organisation)
   - Vereinsname
   - Kassierer
   - Adresse

6. **TagsPane** (Tag-Verwaltung)
   - Inline Tags Manager

7. **YearEndPane** (Jahresabschluss)
   - Periode Lock
   - Unlock Funktion

## Refactoring-Strategie

### Phase 1: Vorbereitung & Struktur
1. **Ordner-Struktur erstellen**
   ```
   src/renderer/views/Settings/
     ├── SettingsView.tsx          # Haupt-Container
     ├── SettingsNav.tsx            # Tile-Navigation
     ├── panes/
     │   ├── GeneralPane.tsx
     │   ├── TablePane.tsx
     │   ├── StoragePane.tsx
     │   ├── ImportPane.tsx
     │   ├── OrgPane.tsx
     │   ├── TagsPane.tsx
     │   └── YearEndPane.tsx
     ├── components/
     │   ├── DnDOrder.tsx          # Spalten-Reorder Component
     │   ├── BackupList.tsx
     │   ├── LocationInfo.tsx
     │   └── ThemeSelector.tsx
     ├── hooks/
     │   ├── useBackupSettings.ts   # Auto-Backup Logic
     │   ├── useStorageLocation.ts  # DB Location State
     │   └── useSettingsSync.ts     # Settings <-> localStorage Sync
     └── types.ts                   # Shared Types
   ```

2. **Types Definition erstellen**
   ```typescript
   // types.ts
   export type TileKey = 'general' | 'table' | 'import' | 'storage' | 'org' | 'tags' | 'yearEnd' | 'tutorial' | 'about'
   
   export type NavLayout = 'left' | 'top'
   export type NavIconColorMode = 'color' | 'mono'
   export type ColorTheme = 'default' | 'fiery-ocean' | ... 
   export type JournalRowStyle = 'both' | 'lines' | 'zebra' | 'none'
   export type JournalRowDensity = 'normal' | 'compact'
   export type DateFmt = 'ISO' | 'PRETTY'
   
   export interface SettingsProps {
     // UI Preferences
     navLayout: NavLayout
     setNavLayout: (v: NavLayout) => void
     navIconColorMode: NavIconColorMode
     setNavIconColorMode: (v: NavIconColorMode) => void
     colorTheme: ColorTheme
     setColorTheme: (v: ColorTheme) => void
     journalRowStyle: JournalRowStyle
     setJournalRowStyle: (v: JournalRowStyle) => void
     journalRowDensity: JournalRowDensity
     setJournalRowDensity: (v: JournalRowDensity) => void
     dateFmt: DateFmt
     setDateFmt: (v: DateFmt) => void
     sidebarCollapsed: boolean
     setSidebarCollapsed: (b: boolean) => void
     
     // Table Config
     cols: Record<string, boolean>
     setCols: (c: Record<string, boolean>) => void
     order: string[]
     setOrder: (o: string[]) => void
     defaultCols: Record<string, boolean>
     defaultOrder: string[]
     journalLimit: number
     setJournalLimit: (n: number) => void
     labelForCol: (k: string) => string
     
     // Tags
     tagDefs: Array<{ id: number; name: string; color?: string | null; usage?: number }>
     setTagDefs: React.Dispatch<React.SetStateAction<...>>
     
     // Callbacks
     notify: (type: 'success' | 'error' | 'info', text: string, ms?: number) => void
     bumpDataVersion: () => void
     openTagsManager?: () => void
     openSetupWizard?: () => void
   }
   ```

### Phase 2: Hooks Extraktion
1. **useBackupSettings.ts** - Auto-Backup Logik
   ```typescript
   export function useBackupSettings() {
     const [autoMode, setAutoMode] = useState<'OFF' | 'PROMPT' | 'SILENT'>('PROMPT')
     const [intervalDays, setIntervalDays] = useState(7)
     const [lastAuto, setLastAuto] = useState<number | null>(null)
     const [backups, setBackups] = useState<BackupInfo[]>([])
     
     useEffect(() => {
       // Load from settings
     }, [])
     
     const refreshBackups = async () => { ... }
     const makeBackup = async () => { ... }
     const restoreBackup = async (path: string) => { ... }
     
     return { autoMode, setAutoMode, intervalDays, setIntervalDays, ... }
   }
   ```

2. **useStorageLocation.ts** - DB Speicherort
   ```typescript
   export function useStorageLocation() {
     const [info, setInfo] = useState<LocationInfo | null>(null)
     const [busy, setBusy] = useState(false)
     const [error, setError] = useState('')
     
     const refresh = async () => { ... }
     const pickFolder = async () => { ... }
     const migrateTo = async (root: string) => { ... }
     const useFolder = async (root: string) => { ... }
     const resetToDefault = async () => { ... }
     
     return { info, busy, error, refresh, pickFolder, ... }
   }
   ```

3. **useSettingsSync.ts** - Settings Synchronisation
   ```typescript
   // Sync zwischen localStorage und Server-Settings
   export function useSettingsSync<T>(
     key: string,
     defaultValue: T,
     options?: { localOnly?: boolean; serverOnly?: boolean }
   ) {
     const [value, setValue] = useState<T>(defaultValue)
     
     useEffect(() => {
       // Load from localStorage + server
     }, [key])
     
     const updateValue = async (newValue: T) => {
       setValue(newValue)
       // Save to localStorage + server
     }
     
     return [value, updateValue] as const
   }
   ```

### Phase 3: Komponenten Extraktion (Bottom-Up)

#### 1. Utility Components
```typescript
// components/DnDOrder.tsx
export function DnDOrder({ 
  order, 
  cols, 
  onChange, 
  labelFor 
}: { ... }) {
  // Drag & Drop Logic für Spalten-Reihenfolge
}

// components/ThemeSelector.tsx
export function ThemeSelector({ 
  value, 
  onChange 
}: { ... }) {
  // Theme Dropdown mit Preview Swatches
}

// components/BackupList.tsx
export function BackupList({ 
  backups, 
  onRestore 
}: { ... }) {
  // Table der verfügbaren Backups
}

// components/LocationInfo.tsx
export function LocationInfo({ 
  info 
}: { ... }) {
  // Display aktueller DB-Location
}
```

#### 2. Pane Components
```typescript
// panes/GeneralPane.tsx
export function GeneralPane({ 
  navLayout,
  setNavLayout,
  colorTheme,
  setColorTheme,
  // ... weitere Props
  notify,
  bumpDataVersion
}: GeneralPaneProps) {
  const [showDeleteAll, setShowDeleteAll] = useState(false)
  const [showImportConfirm, setShowImportConfirm] = useState(false)
  
  return (
    <div className="settings-pane">
      {/* Cluster 1: Darstellung */}
      {/* Cluster 2: Anzeige & Lesbarkeit */}
      {/* Cluster 3: Datenverwaltung */}
      {/* Modals */}
    </div>
  )
}
```

#### 3. Main Container
```typescript
// SettingsView.tsx
export function SettingsView(props: SettingsProps) {
  const [activeTile, setActiveTile] = useState<TileKey>('general')
  
  return (
    <div className="settings-container">
      <h1>Einstellungen</h1>
      
      <SettingsNav 
        active={activeTile} 
        onSelect={setActiveTile} 
      />
      
      <div className="settings-content">
        {activeTile === 'general' && <GeneralPane {...props} />}
        {activeTile === 'table' && <TablePane {...props} />}
        {activeTile === 'storage' && <StoragePane {...props} />}
        {/* ... weitere Panes */}
      </div>
    </div>
  )
}
```

### Phase 4: Integration in App.tsx

**Vorher:**
```typescript
{activePage === 'Einstellungen' && (
  <SettingsView
    defaultCols={defaultCols}
    defaultOrder={defaultOrder}
    // ... 20+ props
  />
)}
```

**Nachher:**
```typescript
{activePage === 'Einstellungen' && (
  <SettingsView
    // UI Preferences
    navLayout={navLayout}
    setNavLayout={setNavLayout}
    // ... grouped props
    
    // Callbacks
    notify={notify}
    bumpDataVersion={bumpDataVersion}
    openTagsManager={() => setShowTagsManager(true)}
    openSetupWizard={() => setShowSetupWizard(true)}
  />
)}
```

### Phase 5: Weitere Optimierungen

1. **Props Reduction via Context**
   ```typescript
   // SettingsContext.tsx
   export const SettingsContext = createContext<SettingsContextType>(null!)
   
   export function SettingsProvider({ children, ...props }: ...) {
     return (
       <SettingsContext.Provider value={props}>
         {children}
       </SettingsContext.Provider>
     )
   }
   
   // In Panes:
   const { notify, bumpDataVersion } = useContext(SettingsContext)
   ```

2. **Form State Management** (optional)
   - Erwägen: React Hook Form für komplexere Formulare (Org-Pane)
   - Oder: Custom `useFormState` Hook

3. **Lazy Loading der Panes**
   ```typescript
   const GeneralPane = lazy(() => import('./panes/GeneralPane'))
   const TablePane = lazy(() => import('./panes/TablePane'))
   // ...
   
   <Suspense fallback={<div>Lade...</div>}>
     {activeTile === 'general' && <GeneralPane />}
   </Suspense>
   ```

## Migrations-Schritte (Sichere Umsetzung)

### Schritt 1: Setup (Keine funktionalen Änderungen)
- [ ] Ordner-Struktur erstellen
- [ ] `types.ts` mit allen Type Definitionen
- [ ] Leere Pane-Dateien erstellen

### Schritt 2: Utility Components (isoliert testbar)
- [ ] `DnDOrder.tsx` extrahieren
- [ ] `ThemeSelector.tsx` extrahieren
- [ ] `BackupList.tsx` extrahieren
- [ ] `LocationInfo.tsx` extrahieren

### Schritt 3: Hooks (keine UI)
- [ ] `useBackupSettings.ts` extrahieren und testen
- [ ] `useStorageLocation.ts` extrahieren und testen
- [ ] `useSettingsSync.ts` extrahieren und testen

### Schritt 4: Panes (Einzeln migrieren)
- [ ] `GeneralPane.tsx` - Copy & Anpassen
- [ ] `TablePane.tsx` - Copy & Anpassen
- [ ] `StoragePane.tsx` - Copy & Anpassen (nutzt Hooks)
- [ ] `ImportPane.tsx` - Copy & Anpassen
- [ ] `OrgPane.tsx` - Copy & Anpassen
- [ ] `TagsPane.tsx` - Copy & Anpassen
- [ ] `YearEndPane.tsx` - Copy & Anpassen

### Schritt 5: Main Container
- [ ] `SettingsView.tsx` erstellen
- [ ] `SettingsNav.tsx` für Tile-Navigation
- [ ] Integration in App.tsx (Feature Flag möglich)

### Schritt 6: Cleanup
- [ ] Alte SettingsView aus App.tsx entfernen
- [ ] Unused Imports bereinigen
- [ ] Tests hinzufügen (optional)

## Risiken & Mitigationen

| Risiko | Wahrscheinlichkeit | Impact | Mitigation |
|--------|-------------------|--------|------------|
| State-Synchronisation verloren | Mittel | Hoch | Hooks für localStorage/Server-Sync vor Migration testen |
| Props drilling | Niedrig | Mittel | Context API nur wenn >5 Ebenen tief |
| Backup-Funktionalität kaputt | Mittel | Kritisch | StoragePane zuerst isoliert testen mit Mock-API |
| Modal-Dialoge nicht modal | Niedrig | Mittel | Portal-Logik beibehalten |
| IPC-Calls fehlschlagen | Niedrig | Hoch | Error Boundaries + Fallbacks |

## Test-Plan

### Unit Tests (optional)
- [ ] `useBackupSettings` Hook
- [ ] `useStorageLocation` Hook
- [ ] `DnDOrder` Component

### Integration Tests (manuell)
- [ ] Theme wechseln → Änderung persistiert
- [ ] Spalten umordnen → Neue Reihenfolge in Buchungen sichtbar
- [ ] Backup erstellen → Datei im Ordner vorhanden
- [ ] Backup wiederherstellen → Daten geladen
- [ ] Ordner wechseln → DB migriert/verwendet
- [ ] Auto-Backup → Einstellungen wirken beim nächsten Start
- [ ] DB Export/Import → Datei korrekt
- [ ] Alle Buchungen löschen → Funktioniert + Bestätigung erforderlich

### Smoke Tests
- [ ] Einstellungen öffnen → Keine Console Errors
- [ ] Zwischen Tiles wechseln → Smooth
- [ ] Änderungen speichern → Übernommen in anderen Views

## Rollback-Strategie

1. **Feature Branch**: Alle Änderungen auf separatem Branch
2. **Git Tags**: Tag vor Refactoring setzen
3. **Backup**: App.tsx vor Änderungen sichern
4. **Incremental**: Pane für Pane mit Commits → bei Fehler einzeln rückgängig
5. **Feature Flag** (optional):
   ```typescript
   const USE_NEW_SETTINGS = false // Toggle für A/B Test
   
   {activePage === 'Einstellungen' && (
     USE_NEW_SETTINGS 
       ? <NewSettingsView {...props} />
       : <OldSettingsView {...props} />
   )}
   ```

## Erfolgskriterien

- [ ] App.tsx reduziert um >800 Zeilen
- [ ] SettingsView vollständig in eigenem Ordner
- [ ] Keine Regression in Funktionalität
- [ ] Props-Anzahl reduziert (via Context)
- [ ] Hooks wiederverwendbar in anderen Views
- [ ] Code lesbar, wartbar, testbar
- [ ] Performance gleich oder besser (Lazy Loading)

## Zeitschätzung

- **Phase 1** (Struktur): 1h
- **Phase 2** (Hooks): 2-3h
- **Phase 3** (Components): 3-4h
- **Phase 4** (Integration): 1-2h
- **Phase 5** (Optimierung): 2h
- **Testing**: 2-3h

**Gesamt**: ~12-16h (verteilt über mehrere Sessions empfohlen)

## Nächste Schritte

1. Diesen Plan in `docs/Refactor_Settings_View.md` speichern ✅
2. Review mit Team/Maintainer (falls vorhanden)
3. Feature Branch erstellen: `git checkout -b refactor/settings-view`
4. Schritt 1 durchführen: Ordner-Struktur + types.ts
5. Feedback einholen nach jedem Schritt

---

**Autor**: GitHub Copilot  
**Datum**: 2025-11-08  
**Status**: Plan → Ready for Implementation
