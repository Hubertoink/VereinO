# VereinO Docker Backend Migration Plan

> Historischer Entwurf (2025). Für den aktuellen Entwicklungsstand und die vereinbarten
> Rollen siehe [Web-/Mehrbenutzerplan](docs/WEB_MULTIUSER_PLAN.md).

## Ziel
Hybrid-Modus: Lokale SQLite-Nutzung ODER Cloud-Backend über Docker/Mittwald

## Branch: `docker`

---

## Phase 1: Architektur & Grundlagen (Week 1)

### 1.1 Projekt-Struktur erweitern
```
VereinO/
├── electron/              # Desktop App (bestehend)
├── src/                   # Frontend (bestehend)
├── shared/                # Shared Types (bestehend)
├── backend/              # NEU: Backend API
│   ├── src/
│   │   ├── server.ts
│   │   ├── config/
│   │   │   └── database.ts
│   │   ├── routes/
│   │   │   ├── auth.ts
│   │   │   ├── vouchers.ts
│   │   │   ├── members.ts
│   │   │   ├── invoices.ts
│   │   │   ├── earmarks.ts
│   │   │   ├── budgets.ts
│   │   │   ├── reports.ts
│   │   │   └── settings.ts
│   │   ├── services/
│   │   │   ├── auth.service.ts
│   │   │   └── db.service.ts
│   │   ├── middleware/
│   │   │   ├── auth.middleware.ts
│   │   │   └── error.middleware.ts
│   │   ├── repositories/
│   │   │   # Wiederverwendung aus electron/main/repositories
│   │   └── types/
│   ├── package.json
│   ├── tsconfig.json
│   └── Dockerfile
├── docker-compose.yml    # NEU: Lokale Dev-Umgebung
└── .env.example          # NEU: Umgebungsvariablen

```

### 1.2 Shared Types auslagern
**Aufgabe:** Types zwischen Electron, Frontend und Backend teilen

**Dateien:**
- `shared/types.ts` (bereits vorhanden, erweitern)
- Neue: `shared/api-types.ts` - Request/Response Schemas
- Neue: `shared/auth-types.ts` - User, Session, Tokens

**Beispiel:**
```typescript
// shared/api-types.ts
export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
}

export interface PaginatedRequest {
  limit: number
  offset: number
  sort?: 'ASC' | 'DESC'
}

export interface PaginatedResponse<T> {
  rows: T[]
  total: number
}
```

### 1.3 Config-System für Modi
**Aufgabe:** User wählt zwischen Local/Cloud

**Datei:** `electron/main/config/app-mode.ts`
```typescript
export type AppMode = 'local' | 'cloud'

export interface AppConfig {
  mode: AppMode
  cloudApiUrl?: string
  cloudToken?: string
}

export function getAppMode(): AppMode {
  const config = readAppConfig()
  return config.mode || 'local'
}

export function setAppMode(mode: AppMode, apiUrl?: string) {
  writeAppConfig({ mode, cloudApiUrl: apiUrl })
}
```

---

## Phase 2: Backend Entwicklung (Week 1-2)

### 2.1 Backend Setup
**Stack:**
- **Framework:** Fastify (schneller als Express)
- **DB:** PostgreSQL (für Cloud) + better-sqlite3 (für Migration-Scripts)
- **Auth:** JWT (jsonwebtoken)
- **Validation:** Zod
- **ORM:** Keine - direkte SQL wie in Electron

**Dependencies:**
```json
{
  "dependencies": {
    "fastify": "^4.25.0",
    "@fastify/cors": "^8.4.0",
    "@fastify/jwt": "^7.2.0",
    "pg": "^8.11.0",
    "bcrypt": "^5.1.1",
    "zod": "^3.22.0",
    "dotenv": "^16.3.0"
  }
}
```

### 2.2 Datenbank Schema (PostgreSQL)
**Aufgabe:** SQLite-Schema nach PostgreSQL portieren

**Unterschiede:**
```sql
-- SQLite
CREATE TABLE IF NOT EXISTS vouchers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- PostgreSQL
CREATE TABLE IF NOT EXISTS vouchers (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMP DEFAULT NOW()
);
```

**Migrations-Strategie:**
1. Automatisches Konvertierungsskript erstellen
2. `backend/migrations/` Ordner für PostgreSQL-Schema
3. Migration-Tool (z.B. `node-pg-migrate`)

### 2.3 Auth-System
**User-Tabelle (NEU in PostgreSQL):**
```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(100) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(50) DEFAULT 'user', -- 'admin', 'user', 'viewer'
  organization_id INTEGER,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE sessions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  token VARCHAR(500) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
```

**Auth-Endpoints:**
```typescript
POST /api/auth/register    // Neuen Org-Admin anlegen
POST /api/auth/login       // Login mit username/password
POST /api/auth/refresh     // Token erneuern
POST /api/auth/logout      // Session beenden
GET  /api/auth/me          // Aktueller User
```

**Offline-Modus:**
- Kein Auth nötig bei `mode: 'local'`
- Electron überspringt Login-Screen

### 2.4 API-Routes
**Aufgabe:** Electron-Repositories als API-Endpoints exponieren

**Beispiel - Vouchers:**
```typescript
// backend/src/routes/vouchers.ts
import { FastifyPluginAsync } from 'fastify'
import { voucherService } from '../services/voucher.service'

const vouchersRoutes: FastifyPluginAsync = async (app) => {
  // List vouchers with filters
  app.get('/vouchers', {
    preHandler: [app.authenticate],
    schema: {
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'number' },
          offset: { type: 'number' },
          from: { type: 'string' },
          to: { type: 'string' },
          sphere: { type: 'string' },
          type: { type: 'string' }
        }
      }
    },
    handler: async (req, reply) => {
      const orgId = req.user.organization_id
      const result = await voucherService.list(orgId, req.query)
      return { success: true, data: result }
    }
  })

  // Create voucher
  app.post('/vouchers', {
    preHandler: [app.authenticate],
    handler: async (req, reply) => {
      const orgId = req.user.organization_id
      const result = await voucherService.create(orgId, req.body)
      return { success: true, data: result }
    }
  })
}

export default vouchersRoutes
```

**Alle Endpoints (Mapping von IPC):**
```
POST   /api/auth/login
GET    /api/vouchers
POST   /api/vouchers
PUT    /api/vouchers/:id
DELETE /api/vouchers/:id
GET    /api/members
POST   /api/members
PUT    /api/members/:id
DELETE /api/members/:id
GET    /api/invoices
POST   /api/invoices
... (alle bestehenden IPC-Calls)
```

### 2.5 Multi-Tenancy (Organisation-Isolation)
**Problem:** Mehrere Vereine auf einem Backend

**Lösung:**
- Jede Tabelle bekommt `organization_id`
- Queries filtern automatisch nach `req.user.organization_id`
- Middleware prüft Zugriffsberechtigung

```sql
ALTER TABLE vouchers ADD COLUMN organization_id INTEGER REFERENCES organizations(id);
CREATE INDEX idx_vouchers_org ON vouchers(organization_id);
```

---

## Phase 3: Electron Anpassungen (Week 2)

### 3.1 Adapter-Pattern für DB-Zugriff
**Aufgabe:** Repositories arbeiten gegen Interface, nicht direkte DB

**Neues Interface:**
```typescript
// electron/main/adapters/data-adapter.interface.ts
export interface IDataAdapter {
  vouchers: {
    list(params: any): Promise<{ rows: any[], total: number }>
    get(id: number): Promise<any>
    create(data: any): Promise<any>
    update(id: number, data: any): Promise<any>
    delete(id: number): Promise<void>
  }
  members: { /* ... */ }
  // ... alle anderen Repositories
}
```

**Implementierungen:**
```typescript
// electron/main/adapters/local-adapter.ts
export class LocalAdapter implements IDataAdapter {
  vouchers = {
    list: (params) => voucherRepository.list(params),
    create: (data) => voucherRepository.create(data),
    // ... direkte SQLite-Calls wie bisher
  }
}

// electron/main/adapters/cloud-adapter.ts
export class CloudAdapter implements IDataAdapter {
  private apiUrl: string
  private token: string

  vouchers = {
    list: async (params) => {
      const res = await fetch(`${this.apiUrl}/api/vouchers?${new URLSearchParams(params)}`, {
        headers: { 'Authorization': `Bearer ${this.token}` }
      })
      return res.json()
    },
    // ... REST API Calls
  }
}
```

**Adapter-Factory:**
```typescript
// electron/main/adapters/adapter-factory.ts
let currentAdapter: IDataAdapter

export function initializeAdapter() {
  const config = getAppConfig()
  
  if (config.mode === 'cloud') {
    currentAdapter = new CloudAdapter(config.cloudApiUrl!, config.cloudToken!)
  } else {
    currentAdapter = new LocalAdapter()
  }
}

export function getAdapter(): IDataAdapter {
  if (!currentAdapter) initializeAdapter()
  return currentAdapter
}
```

### 3.2 IPC-Handler anpassen
**Aufgabe:** IPC nutzt Adapter statt direkte DB

**Vorher:**
```typescript
ipcMain.handle('vouchers:list', async (event, params) => {
  return voucherRepository.list(params)
})
```

**Nachher:**
```typescript
ipcMain.handle('vouchers:list', async (event, params) => {
  const adapter = getAdapter()
  return adapter.vouchers.list(params)
})
```

### 3.3 Login-Screen (Cloud-Modus)
**Neue Datei:** `src/renderer/views/Login/LoginView.tsx`

```typescript
export function LoginView({ onLoginSuccess }: { onLoginSuccess: () => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  
  async function handleLogin() {
    const result = await window.api.auth.login({ username, password })
    if (result.success) {
      onLoginSuccess()
    }
  }
  
  return (
    <div className="login-container">
      <h1>VereinO Cloud Login</h1>
      <input value={username} onChange={e => setUsername(e.target.value)} />
      <input type="password" value={password} onChange={e => setPassword(e.target.value)} />
      <button onClick={handleLogin}>Anmelden</button>
      <button onClick={() => window.api.config.setMode('local')}>Offline nutzen</button>
    </div>
  )
}
```

**App.tsx anpassen:**
```typescript
function App() {
  const [mode, setMode] = useState<'local' | 'cloud'>('local')
  const [authenticated, setAuthenticated] = useState(false)
  
  useEffect(() => {
    window.api.config.getMode().then(setMode)
  }, [])
  
  if (mode === 'cloud' && !authenticated) {
    return <LoginView onLoginSuccess={() => setAuthenticated(true)} />
  }
  
  return <AppInner /> // Normale App
}
```

### 3.4 Settings: Mode-Switcher
**Aufgabe:** User kann zwischen Local/Cloud wechseln

**In Settings/GeneralPane.tsx:**
```typescript
<div className="field">
  <label>Datenbank-Modus</label>
  <select value={mode} onChange={e => handleModeChange(e.target.value)}>
    <option value="local">Lokal (SQLite)</option>
    <option value="cloud">Cloud (Mittwald)</option>
  </select>
</div>

{mode === 'cloud' && (
  <div className="field">
    <label>Cloud API URL</label>
    <input value={cloudUrl} onChange={e => setCloudUrl(e.target.value)} />
  </div>
)}
```

---

## Phase 4: Docker Setup (Week 2)

### 4.1 Backend Dockerfile
```dockerfile
# backend/Dockerfile
FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --production

COPY --from=builder /app/dist ./dist

EXPOSE 3000
CMD ["node", "dist/server.js"]
```

### 4.2 docker-compose.yml (Entwicklung)
```yaml
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: vereino
      POSTGRES_USER: vereino
      POSTGRES_PASSWORD: ${DB_PASSWORD:-dev_password}
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./backend/migrations:/docker-entrypoint-initdb.d
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U vereino"]
      interval: 5s
      timeout: 5s
      retries: 5

  backend:
    build: ./backend
    ports:
      - "3000:3000"
    environment:
      NODE_ENV: development
      DATABASE_URL: postgresql://vereino:${DB_PASSWORD:-dev_password}@postgres:5432/vereino
      JWT_SECRET: ${JWT_SECRET:-dev_secret_change_in_production}
      CORS_ORIGIN: "*"
    depends_on:
      postgres:
        condition: service_healthy
    volumes:
      - ./backend/src:/app/src
      - ./backend/uploads:/app/uploads
    command: npm run dev

volumes:
  postgres_data:
```

### 4.3 Produktion (Mittwald)
```yaml
# docker-compose.prod.yml
version: '3.8'

services:
  backend:
    image: ghcr.io/hubertoink/vereino-backend:latest
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      NODE_ENV: production
      DATABASE_URL: ${DATABASE_URL}
      JWT_SECRET: ${JWT_SECRET}
      CORS_ORIGIN: https://app.vereino.de
    volumes:
      - ./uploads:/app/uploads
      - ./backups:/app/backups
```

### 4.4 .env.example
```bash
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/vereino
DB_PASSWORD=your_secure_password

# Auth
JWT_SECRET=your_jwt_secret_min_32_chars
JWT_EXPIRY=7d

# API
PORT=3000
CORS_ORIGIN=*

# App
NODE_ENV=development
```

---

## Phase 5: Testing & Migration (Week 3)

### 5.1 Daten-Migration SQLite → PostgreSQL
**Script:** `backend/scripts/migrate-from-sqlite.ts`

```typescript
import Database from 'better-sqlite3'
import { Pool } from 'pg'

async function migrateSQLiteToPostgres(sqlitePath: string, pgPool: Pool, orgId: number) {
  const sqlite = new Database(sqlitePath)
  
  // Vouchers
  const vouchers = sqlite.prepare('SELECT * FROM vouchers').all()
  for (const v of vouchers) {
    await pgPool.query(
      `INSERT INTO vouchers (organization_id, voucher_no, date, type, ...) 
       VALUES ($1, $2, $3, $4, ...)`,
      [orgId, v.voucher_no, v.date, v.type, ...]
    )
  }
  
  // Members, Invoices, etc.
  // ...
  
  sqlite.close()
}
```

**CLI-Tool:**
```bash
npm run migrate:upload -- --sqlite ./local.db --org "Mein Verein"
```

### 5.2 Sync-Funktion (Optional)
**Für später:** Bidirektionale Sync zwischen Local + Cloud

```typescript
// Conflict Resolution Strategy
interface SyncConflict {
  localVersion: any
  cloudVersion: any
  resolveWith: 'local' | 'cloud' | 'merge'
}
```

---

## Implementierungs-Reihenfolge

### Sprint 1 (Week 1) ✅ ABGESCHLOSSEN
- [x] Branch `docker` erstellen ✅
- [x] Ordnerstruktur anlegen (`backend/`, Shared Types)
- [x] `shared/api-types.ts` definieren
- [x] Config-System für Modi (`app-mode.ts`)
- [x] Backend Grundgerüst (Fastify + PostgreSQL)
- [x] Auth-System (Users-Tabelle, JWT-Middleware)
- [x] Erste Route: `/api/auth/login`
- [x] Auto-Migrationen beim Docker-Start
- [x] PostgreSQL Schema vollständig portiert

### Sprint 2 (Week 2) ✅ ABGESCHLOSSEN
- [x] Adapter-Pattern implementieren (`LocalAdapter`, `CloudAdapter`)
- [x] IPC-Handler auf Adapter umstellen
- [x] Backend: Auth-Routes vollständig
- [x] Login-Modal im Frontend (CloudLoginModal)
- [x] Settings: Mode-Switcher (Cloud/Lokal)
- [x] CSP konfiguriert für localhost:3000
- [x] Docker Compose Setup vollständig

### Sprint 3 (Week 2-3)
- [ ] Alle verbleibenden Routes (Invoices, Budgets, Earmarks, Reports)
- [ ] File-Upload für Anhänge (Backend)
- [ ] Dockerfile + docker-compose.yml
- [ ] Migrations-Script SQLite → PostgreSQL
- [ ] Lokales Testing mit Docker

### Sprint 4 (Week 3)
- [ ] Mittwald-Deployment testen
- [ ] Nginx-Config für HTTPS
- [ ] Performance-Testing
- [ ] Sicherheits-Audit
- [ ] Dokumentation aktualisieren

---

## Breaking Changes & Backwards-Compatibility

**Wichtig:** Lokaler Modus muss identisch funktionieren!

**Strategie:**
1. `LocalAdapter` nutzt exakt die bisherigen Repositories
2. Keine Änderungen am SQLite-Schema
3. Cloud-Modus ist komplett optional
4. Migration ist opt-in, nicht erzwungen

---

## ✅ Aktueller Status (21.11.2025)

### Fertiggestellt
- ✅ Backend-API mit Fastify + PostgreSQL läuft
- ✅ Docker Compose Setup (Auto-Migrationen)
- ✅ Auth-System (Register/Login mit JWT)
- ✅ Adapter-Pattern (LocalAdapter, CloudAdapter)
- ✅ Frontend: Cloud-Login Modal
- ✅ Settings: Mode-Switcher
- ✅ CSP konfiguriert für Electron + Backend

### Nächste Schritte

**Sprint 3 (Diese Woche):**
- [ ] Backend: Vouchers-Routes implementieren
- [ ] Backend: Members-Routes implementieren
- [ ] Backend: Budgets/Earmarks-Routes
- [ ] Backend: Reports-Routes
- [ ] File-Upload für Anhänge
- [ ] Vollständige IPC → REST Migration

**Sprint 4 (Nächste Woche):**
- [ ] Production Deployment (Mittwald)
- [ ] SSL/HTTPS Setup
- [ ] Backup-Strategy
- [ ] Performance-Testing
- [ ] Sicherheits-Audit

**Backlog:**
- [ ] Bidirektionale Sync (Local ↔ Cloud)
- [ ] Offline-Modus mit Queue
- [ ] Conflict Resolution
