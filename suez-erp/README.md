# SuezERP

Standalone enterprise resource planning system for people, internal communications, finance, projects, procurement, inventory, assets, email and workflow.

SuezERP does not import code from SuezCRM and does not query CRM tables. It owns its users, settings, audit log and business data in its own PostgreSQL database.

## Local development

```bash
cp .env.example .env
docker compose up -d
npm install
npm run db:seed
npm run dev
```

- Application: <http://localhost:3000>
- PostgreSQL: `localhost:5433`, database `erp`
- Demo login: `admin@suez.local` / `password123`

## Verification

```bash
npm run check
npm run build
```

`npm run check` includes database invariants and verifies that CRM domain tables are absent from the configured ERP database.

To stop only the ERP database, run `docker compose down` from this folder. Its data remains in that project's named Docker volume.
