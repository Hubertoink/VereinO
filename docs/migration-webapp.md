# VereinO – Migration zu WebApp (Postgres + Docker)

Dieses Dokument skizziert die Phasen und Architekturentscheidungen für die Umstellung von der Electron/SQLite-App auf eine Web-App mit Postgres, API-Server und späterem Web-Frontend.

## Zielarchitektur (kurz)
- API: Node.js (Fastify) + Prisma + Postgres
- Auth: JWT (später Refresh), RBAC (ADMIN/CASHIER/VIEWER)
- Storage: S3/MinIO (Anhänge) – Phase 2
- Realtime: SSE/WebSocket – Phase 2
- Jobs: BullMQ + Redis – Phase 2
- Frontend: Next.js – Phase 2

## Phasen
1. API/DB-Basis (dieser Commit):
   - docker-compose mit Postgres + API
   - Prisma Schema: User, Voucher, AuditLog (initial)
   - Beispielrouten: GET/POST /v1/vouchers
2. Auth & RBAC
3. Dateien/Anhänge (MinIO), Exporte/Importe als Jobs
4. Frontend-Port (Next.js) & Realtime-Events
5. Migrationstools SQLite→Postgres, Files→S3
6. CI/CD, Monitoring, Backups

## Lokale Entwicklung
- docker-compose up --build
- API: http://localhost:3001/health

## TODOs
- Prisma Migrations laufen lassen (im Container)
- Reports/Invoices/Budgets/Bindings Endpoints portieren
- Security-Hardening (TLS, CORS-Policy, Rate Limiting)
