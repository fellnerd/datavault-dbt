# MDS Implementation Status

## Stand: Implementierung nach plan-masterDataServices.prompt.md

### ✅ Checklist: Mindestanforderungen

| # | Anforderung | Status | Details |
|---|-------------|--------|---------|
| 1 | Model erstellen | ✅ | UI: `/models`, API: `POST /api/models` |
| 2 | Entities erstellen | ✅ | UI: `/entities`, API: `POST /api/entities` |
| 3 | Attribute hinzufügen | ✅ | UI: `/attributes`, API: `POST /api/entities/[id]/attributes` |
| 4 | Deploy → dbt run | ✅ | UI: `/deploy`, API: `POST /api/dbt/run` |
| 5 | Daten versionssicher hinzufügen | ✅ | UI: `/data`, API: `POST /api/data/[entityId]` |
| 6 | DQ Rules Validierung | ✅ | UI: `/validation`, API: `GET /api/validation` |
| 7 | Commit-Workflow | ✅ | UI: `/commits`, API: `GET/POST /api/commits` |
| 8 | Views erstellen | ⚠️ | Nur Konzept - dbt generiert Views |
| 9 | Integration DV | ⚠️ | Architektur vorbereitet, kein Live-Test |

---

## Implementierte Komponenten

### Frontend (Next.js 16 + Blueprint.js 6)

| Seite | Pfad | Status | Funktionen |
|-------|------|--------|------------|
| Dashboard | `/` | ✅ | Tiles, Activity, Status |
| Login | `/login` | ✅ | Microsoft + Dev Provider |
| Models | `/models` | ✅ | Liste, Create Dialog |
| Entities | `/entities` | ✅ | Liste mit Model-Filter |
| Attributes | `/attributes` | ✅ | Attribut-Definition |
| Data Entry | `/data` | ✅ | Grid mit CRUD |
| Commits | `/commits` | ✅ | Workflow mit Status |
| History | `/history` | ✅ | Änderungsverlauf |
| Deploy | `/deploy` | ✅ | dbt Run Trigger |
| Validation | `/validation` | ✅ | DQ Issues + Rules |
| Jobs | `/jobs` | ✅ | Job Queue Übersicht |
| Users | `/settings/users` | ✅ | Benutzer-Verwaltung |
| Config | `/settings/config` | ✅ | System-Einstellungen |

### Backend (API Routes)

| Endpoint | Methods | Status | Modus |
|----------|---------|--------|-------|
| `/api/models` | GET, POST | ✅ | DB (SQL) |
| `/api/models/[id]` | GET, PUT, DELETE | ✅ | DB (SQL) |
| `/api/entities` | GET, POST | ✅ | DB (SQL) |
| `/api/entities/[id]` | GET, PUT, DELETE | ✅ | DB (SQL) |
| `/api/entities/[id]/attributes` | GET, POST | ✅ | DB (SQL) |
| `/api/data/[entityId]` | GET, POST, PUT, DELETE | ✅ | Mock |
| `/api/commits` | GET, POST | ✅ | Mock |
| `/api/commits/[commitId]` | GET, PUT | ✅ | Mock |
| `/api/validation` | GET | ✅ | Mock |
| `/api/validation/run` | POST | ✅ | Mock |
| `/api/dbt/run` | POST | ✅ | Mock (simuliert) |
| `/api/jobs` | GET | ✅ | Mock |
| `/api/jobs/[id]` | GET | ✅ | Mock |
| `/api/users` | GET, POST | ✅ | Mock |
| `/api/health` | GET | ✅ | Live |

### Infrastruktur

| Komponente | Status | Details |
|------------|--------|---------|
| Auth (NextAuth v5) | ✅ | Microsoft Entra ID + Dev Credentials |
| DB Connection (mssql) | ✅ | Azure SQL via CLI Auth |
| Job Queue (BullMQ) | ⚠️ | Code vorhanden, Mock-Modus aktiv |
| Redis | ⚠️ | Noch nicht gestartet |
| Docker | ⚠️ | Dockerfile existiert, nicht getestet |
| Logger (pino) | ✅ | Strukturiertes Logging |

---

## Aktueller Mock-Modus

Die Anwendung läuft mit Mock-Daten:
- `DB_MOCK=true` - API gibt statische Daten zurück
- `QUEUE_MOCK=true` - Jobs werden simuliert

### Mock-Daten Location
- Models/Entities: `src/app/api/models/route.ts` (echte DB-Queries)
- Data Entry: `src/app/api/data/[entityId]/route.ts`
- Commits: `src/app/api/commits/route.ts`
- Validation: `src/app/api/validation/route.ts`
- Jobs: `src/app/api/dbt/run/route.ts`

---

## Nächste Schritte (Production Ready)

### 1. Azure CLI Login
```bash
az login
```

### 2. Redis starten
```bash
docker run -d --name redis -p 6379:6379 redis:7-alpine
```

### 3. DB-Schemas erstellen
```sql
-- In Azure SQL ausführen
CREATE SCHEMA mds_meta;
CREATE SCHEMA mds_load;
CREATE SCHEMA mds_stage;
CREATE SCHEMA mds_view;
```

### 4. Tabellen erstellen
Siehe: `/masterdata/sql/schema.sql` (noch zu erstellen)

### 5. Mock deaktivieren
```env
# .env.local
DB_MOCK=false
QUEUE_MOCK=false
```

### 6. Docker Build testen
```bash
cd /home/user/projects/datavault-dbt/masterdata
docker build -t masterdata:dev .
docker run -p 3000:3000 --env-file .env.local masterdata:dev
```

### 7. Worker starten
```bash
npm run worker:dev
```

---

## Bekannte Issues

1. **Hydration Warning**: Console zeigt Hydration-Fehler (funktioniert aber)
2. **toLocaleString**: Behoben mit explizitem 'de-DE' locale
3. **Session Loading**: Behoben mit status === 'loading' check
4. **Dropdown**: Neu implementiert mit custom state-based solution

---

## Architektur-Übersicht

```
/masterdata
├── src/
│   ├── app/
│   │   ├── (app)/          # Geschützte Seiten
│   │   │   ├── models/
│   │   │   ├── entities/
│   │   │   ├── data/
│   │   │   ├── commits/
│   │   │   ├── deploy/
│   │   │   ├── validation/
│   │   │   ├── jobs/
│   │   │   └── settings/
│   │   ├── api/            # Backend API Routes
│   │   │   ├── models/
│   │   │   ├── entities/
│   │   │   ├── data/
│   │   │   ├── commits/
│   │   │   ├── dbt/
│   │   │   ├── validation/
│   │   │   ├── jobs/
│   │   │   └── users/
│   │   └── login/
│   ├── components/
│   │   └── layout/
│   │       ├── Header.tsx
│   │       └── Sidebar.tsx
│   ├── lib/
│   │   ├── auth.ts
│   │   ├── db.ts
│   │   ├── db-server.ts
│   │   ├── logger.ts
│   │   └── queue/
│   └── stores/
├── dbt/                    # Embedded dbt Projekt (geplant)
└── Dockerfile
```

---

Letzte Aktualisierung: 2025-01-22
