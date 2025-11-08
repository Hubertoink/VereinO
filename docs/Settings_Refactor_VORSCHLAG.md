# Vorschlag: Settings View Refactoring (Sichere Umsetzung)

## Zusammenfassung

Die **SettingsView** in `App.tsx` umfasst aktuell **~1500+ Zeilen** mit komplexer Logik für:

- UI-Präferenzen (Theme, Layout, Darstellung)
- Tabellen-Konfiguration (Spalten-Sichtbarkeit, Drag & Drop)
- Speicherort-Verwaltung (DB-Location, Migration)
- Backup-System (Automatisch/Manuell, Wiederherstellung)
- Datenimport (CSV, CAMT.053)
- Organisation & Jahresabschluss

**Ziel**: Diese Komponente vollständig aus `App.tsx` herauslösen in einen eigenen `views/Settings/` Ordner, um:

1. **App.tsx** deutlich zu verkleinern (~1500 Zeilen einsparen)
2. Settings-Logik wartbarer und testbarer machen
3. Wiederverwendbare Hooks/Components erstellen
4. Code-Organisation verbessern

---

## ✅ Empfohlener Ansatz: **Iterativ & Sicher**

### Warum iterativ?

- **Kein "Big Bang" Refactoring** → geringeres Risiko
- **Jeder Schritt einzeln testbar** → sofort Feedback
- **Rollback einfach** → einzelne Commits rückgängig machbar
- **Lernkurve sanft** → Schritt für Schritt Verständnis

---

## 📋 Phasen-Plan (Empfohlen)

### **Phase 1: Vorbereitung (Foundation)**

**Ziel**: Struktur schaffen ohne funktionale Änderungen

#### Schritte:

1. **Ordner erstellen**

   ```bash
   mkdir -p src/renderer/views/Settings/{panes,components,hooks}
   ```

2. **Types File** erstellen

   ```typescript
   // src/renderer/views/Settings/types.ts
   export type TileKey = 'general' | 'table' | 'storage' | 'import' | 'org' | 'tags' | 'yearEnd'
   
   export type NavLayout = 'left' | 'top'
   export type ColorTheme = 'default' | 'fiery-ocean' | /* ... */
   // ... alle weiteren Types
   
   export interface SettingsProps {
     // Grouped by concern
     uiPrefs: {
       navLayout: NavLayout
       setNavLayout: (v: NavLayout) => void
       colorTheme: ColorTheme
       setColorTheme: (v: ColorTheme) => void
       // ...
     }
     tableConfig: {
       cols: Record<string, boolean>
       setCols: (c: Record<string, boolean>) => void
       // ...
     }
     callbacks: {
       notify: (type: 'success' | 'error' | 'info', text: string, ms?: number) => void
       bumpDataVersion: () => void
       openTagsManager?: () => void
       openSetupWizard?: () => void
     }
   }
   ```

3. **Leere Pane-Stubs** erstellen

   ```typescript
   // src/renderer/views/Settings/panes/GeneralPane.tsx
   export function GeneralPane() {
     return <div>General Settings (Coming Soon)</div>
   }
   ```

**Testen**: Keine funktionalen Änderungen → nur Struktur

---

### **Phase 2: Utility Components (Bottom-Up)**

**Ziel**: Kleinste wiederverwendbare UI-Teile extrahieren

#### Components:

1. **ThemeSelector** - Theme Dropdown mit Preview

   ```typescript
   // components/ThemeSelector.tsx
   export function ThemeSelector({ 
     value, 
     onChange 
   }: { 
     value: ColorTheme
     onChange: (v: ColorTheme) => void 
   }) {
     return (
       <div>
         <select value={value} onChange={e => onChange(e.target.value as ColorTheme)}>
           <option value="default">Standard</option>
           {/* ... */}
         </select>
         <div className="swatches">
           <span style={{ background: 'var(--accent)' }} />
           {/* ... */}
         </div>
       </div>
     )
   }
   ```

2. **DnDOrder** - Drag & Drop Spalten-Reihenfolge

   ```typescript
   // components/DnDOrder.tsx
   export function DnDOrder({ 
     order, 
     onChange,
     labelFor 
   }: { ... }) {
     // Existing drag logic
   }
   ```

3. **BackupList** - Table der Backups

4. **LocationInfo** - Display DB-Speicherort

**Testen**: Jede Component isoliert in Storybook oder separater Test-Page

---

### **Phase 3: Hooks Extraktion (Business Logic)**

**Ziel**: Zustandslogik aus UI trennen

#### Hooks:

1. **useBackupSettings**

   ```typescript
   // hooks/useBackupSettings.ts
   export function useBackupSettings() {
     const [autoMode, setAutoMode] = useState<'OFF' | 'PROMPT' | 'SILENT'>('PROMPT')
     const [intervalDays, setIntervalDays] = useState(7)
     const [backups, setBackups] = useState<BackupInfo[]>([])
     
     useEffect(() => {
       // Load from settings API
       loadBackupSettings()
     }, [])
     
     const makeBackup = async (type: 'manual' | 'auto') => {
       // ...
     }
     
     return { 
       autoMode, 
       setAutoMode, 
       intervalDays, 
       setIntervalDays, 
       backups,
       makeBackup,
       refreshBackups 
     }
   }
   ```

2. **useStorageLocation**

   ```typescript
   // hooks/useStorageLocation.ts
   export function useStorageLocation() {
     const [info, setInfo] = useState<LocationInfo | null>(null)
     const [busy, setBusy] = useState(false)
     
     const pickFolder = async () => {
       const mod = await import('../storage')
       return mod.pickFolder()
     }
     
     const migrateTo = async (root: string) => {
       // ...
     }
     
     return { info, busy, pickFolder, migrateTo, /* ... */ }
   }
   ```

3. **useSettingsSync** - localStorage ↔ Server Sync

   ```typescript
   // hooks/useSettingsSync.ts
   export function useSettingsSync<T>(
     key: string,
     defaultValue: T
   ): [T, (v: T) => Promise<void>] {
     const [value, setValue] = useState(defaultValue)
     
     useEffect(() => {
       // Load from localStorage + server
       const localVal = localStorage.getItem(key)
       if (localVal) setValue(JSON.parse(localVal))
       
       window.api?.settings?.get?.({ key }).then(res => {
         if (res?.value) setValue(res.value as T)
       })
     }, [key])
     
     const updateValue = async (newValue: T) => {
       setValue(newValue)
       localStorage.setItem(key, JSON.stringify(newValue))
       await window.api?.settings?.set?.({ key, value: newValue })
     }
     
     return [value, updateValue]
   }
   ```

**Testen**: Unit Tests für Hooks (Jest + @testing-library/react-hooks)

---

### **Phase 4: Panes Extraktion (Step by Step)**

**Ziel**: Jeden Sub-Pane einzeln migrieren

#### Reihenfolge (Einfach → Komplex):

1. **TablePane** (am einfachsten, nutzt DnDOrder)

   ```typescript
   // panes/TablePane.tsx
   import { DnDOrder } from '../components/DnDOrder'
   
   export function TablePane({ 
     cols, 
     setCols, 
     order, 
     setOrder,
     defaultCols,
     defaultOrder,
     labelForCol
   }: TablePaneProps) {
     return (
       <div className="settings-pane">
         <h2>Tabelle & Darstellung</h2>
         
         {/* Checkboxes */}
         <div>
           {Object.keys(defaultCols).map(k => (
             <label key={k}>
               <input 
                 type="checkbox" 
                 checked={cols[k]} 
                 onChange={e => setCols({ ...cols, [k]: e.target.checked })} 
               />
               {labelForCol(k)}
             </label>
           ))}
         </div>
         
         {/* Drag & Drop Order */}
         <DnDOrder 
           order={order} 
           cols={cols} 
           onChange={setOrder} 
           labelFor={labelForCol} 
         />
         
         {/* Preset Buttons */}
         <div>
           <button onClick={() => { 
             setCols(defaultCols); 
             setOrder(defaultOrder) 
           }}>
             Standard
           </button>
         </div>
       </div>
     )
   }
   ```

2. **GeneralPane** (UI-Präferenzen, nutzt ThemeSelector)

3. **OrgPane** (einfaches Formular)

4. **TagsPane** (delegiert an TagsManager Modal)

5. **YearEndPane** (Periode Lock)

6. **ImportPane** (CSV/CAMT Import)

7. **StoragePane** (komplex, nutzt useStorageLocation + useBackupSettings)

**Testen**: Nach jedem Pane:

- Settings öffnen → Pane anzeigen
- Änderungen speichern → Persistiert?
- In andere View wechseln → Änderungen übernommen?

---

### **Phase 5: Main Container**

**Ziel**: SettingsView als Router zwischen Panes

```typescript
// views/Settings/SettingsView.tsx
import { useState } from 'react'
import { SettingsNav } from './SettingsNav'
import { GeneralPane } from './panes/GeneralPane'
import { TablePane } from './panes/TablePane'
// ... andere Panes

export function SettingsView(props: SettingsProps) {
  const [active, setActive] = useState<TileKey>('general')
  
  return (
    <div className="settings-container">
      <h1>Einstellungen</h1>
      
      <SettingsNav active={active} onSelect={setActive} />
      
      <div className="settings-content">
        {active === 'general' && <GeneralPane {...props} />}
        {active === 'table' && <TablePane {...props} />}
        {active === 'storage' && <StoragePane {...props} />}
        {/* ... */}
      </div>
    </div>
  )
}
```

**SettingsNav** (Tile-Layout):

```typescript
// SettingsNav.tsx
export function SettingsNav({ 
  active, 
  onSelect 
}: { 
  active: TileKey
  onSelect: (key: TileKey) => void 
}) {
  const tiles = [
    { key: 'general', icon: '🖼️', label: 'Darstellung' },
    { key: 'table', icon: '📋', label: 'Tabelle' },
    { key: 'storage', icon: '🗄️', label: 'Speicher & Backup' },
    // ...
  ]
  
  return (
    <div className="settings-tiles">
      {tiles.map(t => (
        <button 
          key={t.key}
          className={active === t.key ? 'active' : ''}
          onClick={() => onSelect(t.key)}
        >
          <span>{t.icon}</span>
          <span>{t.label}</span>
        </button>
      ))}
    </div>
  )
}
```

---

### **Phase 6: Integration in App.tsx**

**Vorher** (in App.tsx):

```typescript
{activePage === 'Einstellungen' && (
  <SettingsView
    defaultCols={defaultCols}
    defaultOrder={defaultOrder}
    cols={cols}
    setCols={setCols}
    // ... 20+ props
  />
)}

// Inline function SettingsView (1500+ Zeilen)
```

**Nachher** (in App.tsx):

```typescript
import { SettingsView } from './views/Settings/SettingsView'

{activePage === 'Einstellungen' && (
  <SettingsView
    uiPrefs={{
      navLayout,
      setNavLayout,
      colorTheme,
      setColorTheme,
      // ...
    }}
    tableConfig={{
      cols,
      setCols,
      order,
      setOrder,
      defaultCols,
      defaultOrder,
      // ...
    }}
    callbacks={{
      notify,
      bumpDataVersion,
      openTagsManager: () => setShowTagsManager(true),
      openSetupWizard: () => setShowSetupWizard(true),
    }}
  />
)}

// Inline SettingsView ENTFERNT → -1500 Zeilen
```

---

### **Phase 7: Cleanup & Optimierung**

1. **Alte SettingsView aus App.tsx löschen**
2. **Unused imports entfernen**
3. **Props via Context vereinfachen** (optional)

   ```typescript
   // SettingsContext.tsx
   export const SettingsContext = createContext<SettingsContextType>(null!)
   
   export function SettingsProvider({ children, ...props }) {
     return (
       <SettingsContext.Provider value={props}>
         {children}
       </SettingsContext.Provider>
     )
   }
   
   // In App.tsx:
   <SettingsProvider {...settingsProps}>
     <SettingsView />
   </SettingsProvider>
   
   // In Panes:
   const { notify, bumpDataVersion } = useContext(SettingsContext)
   ```

4. **Lazy Loading** (Performance)

   ```typescript
   const GeneralPane = lazy(() => import('./panes/GeneralPane'))
   
   <Suspense fallback={<div>Lade...</div>}>
     {active === 'general' && <GeneralPane />}
   </Suspense>
   ```

---

## 🧪 Test-Strategie

### Nach jedem Schritt:

1. **Compile Check**: `npm run build` → Keine Errors
2. **Runtime Check**: App starten → Settings öffnen → Keine Console Errors
3. **Functional Check**: Änderung in Settings → Gespeichert? → In anderer View sichtbar?

### Finale Tests (vor Merge):

| Feature | Test | Expected |
|---------|------|----------|
| Theme wechseln | Default → Fiery Ocean | UI Farben ändern sich, persistiert nach Reload |
| Spalten umordnen | Drag "Gross" nach vorne | Buchungen-Tabelle zeigt neue Reihenfolge |
| Backup erstellen | "Backup jetzt" klicken | Datei im Backup-Ordner, Toast "Backup erstellt" |
| Ordner wechseln | Neuen Ordner wählen → Migrieren | DB-Datei im neuen Ordner, Settings zeigen neuen Pfad |
| Auto-Backup | Intervall 1 Tag, Mode=SILENT | Beim nächsten Start: Backup automatisch erstellt |
| DB Import | SQLite-Datei auswählen | Daten geladen, App reloadet |

---

## ⚠️ Risiken & Mitigation

| Risiko | Wahrscheinlichkeit | Impact | Mitigation |
|--------|-------------------|--------|------------|
| **State-Sync verloren** | Mittel | Hoch | `useSettingsSync` Hook vor Migration testen |
| **Backup kaputt** | Mittel | **Kritisch** | StoragePane als letztes migrieren, intensiv testen |
| **Props drilling** | Niedrig | Mittel | Context API einführen (Phase 7) |
| **IPC-Calls fehlschlagen** | Niedrig | Hoch | Error Boundaries + Fallback UI |
| **Modals nicht modal** | Niedrig | Mittel | Portal-Logik aus App.tsx übernehmen |

---

## 🔄 Rollback-Strategie

1. **Git Branch**: `refactor/settings-view`
2. **Commits granular**: Jeder Schritt = 1 Commit
3. **Tag vor Start**: `git tag pre-settings-refactor`
4. **Bei Fehler**: `git revert <commit-hash>` oder `git reset --hard <tag>`

---

## 📦 Deliverables

Nach Abschluss:

- [ ] `src/renderer/views/Settings/` Ordner mit vollständiger Implementierung
- [ ] `App.tsx` -1500 Zeilen
- [ ] 3 wiederverwendbare Hooks (`useBackupSettings`, `useStorageLocation`, `useSettingsSync`)
- [ ] 4-5 wiederverwendbare Components (`ThemeSelector`, `DnDOrder`, etc.)
- [ ] `docs/Refactor_Settings_View.md` aktualisiert mit "DONE" Status
- [ ] Alle Tests bestanden (siehe Test-Strategie)

---

## ⏱️ Zeitplan (Empfehlung)

| Phase | Aufwand | Wann |
|-------|---------|------|
| Phase 1 | 1h | Session 1 (Setup) |
| Phase 2 | 2h | Session 1-2 (Components) |
| Phase 3 | 2-3h | Session 2 (Hooks) |
| Phase 4 | 4-5h | Session 3-5 (Panes, iterativ) |
| Phase 5 | 1h | Session 6 (Integration) |
| Phase 6 | 1-2h | Session 6 (Cleanup) |
| Testing | 2-3h | Fortlaufend + Final |

**Gesamt**: ~13-17h (verteilt über 6-8 Sessions à 1-2h)

---

## 🚀 Nächste Schritte (Konkret)

### Sofort:

1. **Dieser Plan reviewen** → Feedback geben
2. **Feature Branch erstellen**:

   ```bash
   git checkout -b refactor/settings-view
   ```

3. **Phase 1 starten**:

   ```bash
   mkdir -p src/renderer/views/Settings/{panes,components,hooks}
   touch src/renderer/views/Settings/types.ts
   ```

### Vor Start jeder Session:

- Plan durchlesen (welche Phase?)
- Testkriterien klären
- Commit-Message vorbereiten

### Nach jeder Session:

- Commit + Push
- Kurze Notiz: Was funktioniert? Was offen?
- Nächste Session planen

---

## 🎯 Warum dieser Ansatz?

✅ **Sicher**: Kleine Schritte, jederzeit Rollback  
✅ **Testbar**: Nach jedem Schritt validierbar  
✅ **Lernbar**: Verständnis wächst mit jedem Pane  
✅ **Wartbar**: Klare Struktur, wiederverwendbare Teile  
✅ **Performance**: Lazy Loading möglich  

---

**Fragen? Feedback?**

- Soll ich mit **Phase 1** starten? (Struktur erstellen)
- Benötigst du ein **Code-Example** für einen bestimmten Pane?
- Sollen wir **Context API** direkt einbauen oder später?

**Let me know!** 🚀
