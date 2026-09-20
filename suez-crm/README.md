# SuezCRM

Standalone customer relationship management system for leads, companies, contacts, opportunities, activities, quotes, campaigns, segments, support tickets, workflow automation, channel conversations, lead capture, and live reports.

SuezCRM does not import code from SuezERP and does not query ERP tables. It owns its users, settings, audit log and business data in its own PostgreSQL database.

## Local development

```bash
cp .env.example .env
docker compose up -d
npm install
npm run db:seed
npm run dev
```

- Application: <http://localhost:3001>
- PostgreSQL: `localhost:5434`, database `crm`
- Demo login: `admin@suez.local` / `password123`

## Verification

```bash
npm run check
npm run build
```

`npm run check` includes database invariants and verifies that ERP domain tables are absent from the configured CRM database.

To stop only the CRM database, run `docker compose down` from this folder. Its data remains in that project's named Docker volume.

## Capture and communication connectors

- Hosted forms are managed at `/capture`; the seeded public form is `/lead/contact-us`.
- External lead sources can POST to `/api/leads/capture` with `Authorization: Bearer <CRM_CAPTURE_API_KEY>`.
- Inbound WhatsApp, SMS, social, web, or email adapters POST a normalized message to `/api/channels/<channel>` with `Authorization: Bearer <CRM_CHANNEL_WEBHOOK_SECRET>`.
- Outbound email uses the CRM SMTP account configured at `/communications/settings`.
- WhatsApp, SMS, and social interactions are inbound or manually logged only; the CRM does not send through those platforms.

These automations are deterministic rules; no AI services or models are used.
