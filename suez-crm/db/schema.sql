-- Tables both systems need. Applied to BOTH databases.
--
-- ERP and CRM are independent products with their own database, so each carries
-- its own copy of these: its own employees, its own settings, its own audit
-- trail. A person who uses both has an account in each. That is the cost of
-- being able to sell either one on its own.

create table if not exists departments (
  id          serial primary key,
  name        text not null unique,
  code        text,
  head_id     integer,
  created_at  timestamptz not null default now()
);

create table if not exists users (
  id             serial primary key,
  staff_no       text unique,
  full_name      text not null,
  email          text not null,
  password_hash  text not null,
  role           text not null default 'staff' check (role in ('admin','hr','manager','staff')),
  job_title      text,
  department_id  integer references departments(id) on delete set null,
  manager_id     integer references users(id) on delete set null,
  phone          text,
  avatar_url     text,
  signature      text,                    -- data: URL (drawn or uploaded)
  password_change_required boolean not null default false,
  status         text not null default 'active' check (status in ('active','suspended')),
  last_login_at  timestamptz,
  created_at     timestamptz not null default now()
);
alter table users add column if not exists password_change_required boolean not null default false;
create unique index if not exists users_email_key on users (lower(email));

alter table departments
  drop constraint if exists departments_head_fk,
  add constraint departments_head_fk foreign key (head_id) references users(id) on delete set null;

-- ---------------------------------------------------------------- attachments
-- Bytes live in Supabase Storage (`storage_path`). `data` is the base64 fallback
-- used when SUPABASE_URL is not configured, and holds rows written before it was.
create table if not exists attachments (
  id           serial primary key,
  name         text not null,
  mime         text not null default 'application/octet-stream',
  size_bytes   integer not null default 0,
  storage_path text,
  data         text,
  uploaded_by  integer references users(id) on delete set null,
  created_at   timestamptz not null default now()
);

-- Upgrade path for databases created before object storage was wired in.
alter table attachments add column if not exists storage_path text;
alter table attachments alter column data drop not null;
alter table attachments
  drop constraint if exists attachments_body_ck,
  add constraint attachments_body_ck check (storage_path is not null or data is not null);
create index if not exists attachments_path_idx on attachments (storage_path);

-- ------------------------------------------------------ notifications, misc
create table if not exists notifications (
  id         serial primary key,
  user_id    integer not null references users(id) on delete cascade,
  title      text not null,
  body       text,
  href       text,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on notifications (user_id, read_at, created_at desc);

create table if not exists settings (
  key        text primary key,
  value      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists audit_log (
  id         serial primary key,
  user_id    integer references users(id) on delete set null,
  action     text not null,
  entity     text,
  entity_id  text,
  meta       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
-- SuezCRM — the sales portal's own tables. Idempotent: safe to re-run.
create table if not exists crm_companies (
  id         serial primary key,
  name       text not null,
  industry   text,
  website    text,
  email      text,
  phone      text,
  address    text,
  size       text,
  status     text not null default 'lead' check (status in ('lead','prospect','customer','churned')),
  owner_id   integer references users(id) on delete set null,
  notes      text,
  created_at timestamptz not null default now()
);

create table if not exists crm_contacts (
  id         serial primary key,
  company_id integer references crm_companies(id) on delete set null,
  full_name  text not null,
  job_title  text,
  email      text,
  phone      text,
  is_primary boolean not null default false,
  owner_id   integer references users(id) on delete set null,
  notes      text,
  created_at timestamptz not null default now()
);

create table if not exists crm_deals (
  id            serial primary key,
  title         text not null,
  company_id    integer references crm_companies(id) on delete set null,
  contact_id    integer references crm_contacts(id) on delete set null,
  value         numeric(14,2) not null default 0,
  currency      text not null default 'NGN',
  stage         text not null default 'qualification' check (stage in ('qualification','proposal','negotiation','won','lost')),
  probability   integer not null default 20,
  owner_id      integer references users(id) on delete set null,
  expected_close date,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists crm_activities (
  id           serial primary key,
  kind         text not null default 'task' check (kind in ('call','email','meeting','task','note')),
  subject      text not null,
  notes        text,
  due_at       timestamptz,
  completed_at timestamptz,
  company_id   integer references crm_companies(id) on delete cascade,
  contact_id   integer references crm_contacts(id) on delete cascade,
  deal_id      integer references crm_deals(id) on delete cascade,
  owner_id     integer references users(id) on delete set null,
  created_at   timestamptz not null default now()
);

-- Custom pipelines, so sales can rename stages without a migration.
create table if not exists crm_pipelines (
  id         serial primary key,
  name       text not null unique,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists crm_stages (
  id          serial primary key,
  pipeline_id integer not null references crm_pipelines(id) on delete cascade,
  name        text not null,
  position    integer not null default 0,
  probability integer not null default 20 check (probability between 0 and 100),
  is_won      boolean not null default false,
  is_lost     boolean not null default false
);
create index if not exists crm_stages_pipeline_idx on crm_stages (pipeline_id, position);

-- ------------------------------------------------------------------- leads
-- Unqualified interest. Converting a lead creates a company + contact + deal.
create table if not exists crm_leads (
  id           serial primary key,
  full_name    text not null,
  company_name text,
  job_title    text,
  email        text,
  phone        text,
  source       text not null default 'other' check (source in ('website','referral','event','cold_call','campaign','linkedin','other')),
  status       text not null default 'new' check (status in ('new','contacted','qualified','unqualified','converted')),
  -- 0..100, recomputed by lib/scoring.ts whenever the lead changes.
  score        integer not null default 0 check (score between 0 and 100),
  industry     text,
  estimated_value numeric(14,2) not null default 0,
  currency     text not null default 'NGN',
  owner_id     integer references users(id) on delete set null,
  notes        text,
  converted_company_id integer references crm_companies(id) on delete set null,
  converted_contact_id integer references crm_contacts(id) on delete set null,
  converted_deal_id    integer references crm_deals(id) on delete set null,
  converted_at timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists crm_leads_status_idx on crm_leads (status, score desc);

-- ------------------------------------------------------------------ quotes
create sequence if not exists crm_ref_seq;

create table if not exists crm_quotes (
  id          serial primary key,
  ref         text not null unique,
  title       text not null,
  company_id  integer references crm_companies(id) on delete set null,
  contact_id  integer references crm_contacts(id) on delete set null,
  deal_id     integer references crm_deals(id) on delete set null,
  issue_date  date not null default current_date,
  valid_until date,
  currency    text not null default 'NGN',
  subtotal    numeric(14,2) not null default 0,
  discount    numeric(14,2) not null default 0,
  tax_rate    numeric(5,2) not null default 7.5,
  tax_amount  numeric(14,2) not null default 0,
  total       numeric(14,2) not null default 0,
  status      text not null default 'draft' check (status in ('draft','sent','accepted','declined','expired')),
  terms       text,
  owner_id    integer references users(id) on delete set null,
  created_at  timestamptz not null default now()
);

create table if not exists crm_quote_lines (
  id          serial primary key,
  quote_id    integer not null references crm_quotes(id) on delete cascade,
  description text not null,
  quantity    numeric(12,2) not null default 1,
  unit_price  numeric(14,2) not null default 0,
  line_total  numeric(14,2) not null default 0
);

-- ---------------------------------------------------------- support tickets
create table if not exists crm_tickets (
  id          serial primary key,
  ref         text not null unique,
  subject     text not null,
  body        text,
  company_id  integer references crm_companies(id) on delete set null,
  contact_id  integer references crm_contacts(id) on delete set null,
  priority    text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  status      text not null default 'open' check (status in ('open','in_progress','waiting_customer','resolved','closed')),
  channel     text not null default 'email' check (channel in ('email','phone','portal','meeting')),
  assignee_id integer references users(id) on delete set null,
  -- Agreed response deadline; overdue is computed against this.
  due_at      timestamptz,
  resolved_at timestamptz,
  created_by  integer references users(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists crm_tickets_status_idx on crm_tickets (status, priority, created_at desc);

create table if not exists crm_ticket_replies (
  id         serial primary key,
  ticket_id  integer not null references crm_tickets(id) on delete cascade,
  author_id  integer references users(id) on delete set null,
  body       text not null,
  internal   boolean not null default false,
  attachment_id integer references attachments(id) on delete set null,
  created_at timestamptz not null default now()
);

-- --------------------------------------------------------------- campaigns
create table if not exists crm_campaigns (
  id          serial primary key,
  name        text not null,
  channel     text not null default 'email' check (channel in ('email','event','social','webinar','print','other')),
  status      text not null default 'draft' check (status in ('draft','scheduled','running','completed','cancelled')),
  start_date  date,
  end_date    date,
  budget      numeric(14,2) not null default 0,
  currency    text not null default 'NGN',
  subject     text,
  body        text,
  owner_id    integer references users(id) on delete set null,
  sent_count  integer not null default 0,
  created_at  timestamptz not null default now()
);

create table if not exists crm_campaign_recipients (
  id          serial primary key,
  campaign_id integer not null references crm_campaigns(id) on delete cascade,
  contact_id  integer references crm_contacts(id) on delete set null,
  email       text not null,
  sent_at     timestamptz,
  opened_at   timestamptz,
  clicked_at  timestamptz,
  bounced     boolean not null default false,
  unique (campaign_id, email)
);

-- ----------------------------------------------------------------- segments
-- A saved filter over companies or contacts, stored as JSON rules.
create table if not exists crm_segments (
  id         serial primary key,
  name       text not null unique,
  entity     text not null default 'company' check (entity in ('company','contact','lead')),
  rules      jsonb not null default '[]'::jsonb,
  owner_id   integer references users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- --------------------------------------------------- notes on the base tables
alter table crm_deals    add column if not exists pipeline_id integer references crm_pipelines(id) on delete set null;
alter table crm_deals    add column if not exists stage_id    integer references crm_stages(id) on delete set null;
alter table crm_deals    add column if not exists source      text;
alter table crm_deals    add column if not exists lost_reason text;
alter table crm_companies add column if not exists segment    text;
alter table crm_companies add column if not exists health     text default 'good' check (health in ('good','at_risk','critical'));
alter table crm_companies add column if not exists annual_value numeric(14,2) not null default 0;
alter table crm_contacts add column if not exists last_contacted_at timestamptz;
alter table crm_contacts add column if not exists opted_out boolean not null default false;

-- Seed the default pipeline to mirror the stages already in crm_deals' CHECK.
insert into crm_pipelines (name, is_default)
select 'Standard', true
where not exists (select 1 from crm_pipelines);

insert into crm_stages (pipeline_id, name, position, probability, is_won, is_lost)
select p.id, s.name, s.pos, s.prob, s.won, s.lost
  from crm_pipelines p
  cross join (values
    ('Qualification', 1, 20, false, false),
    ('Proposal',      2, 45, false, false),
    ('Negotiation',   3, 70, false, false),
    ('Won',           4, 100, true, false),
    ('Lost',          5, 0,  false, true)
  ) as s(name, pos, prob, won, lost)
 where p.is_default and not exists (select 1 from crm_stages where pipeline_id = p.id);

-- ===========================================================================
-- Post-review corrections. Additive and idempotent.
-- ===========================================================================

-- Import ---------------------------------------------------------------------
-- The import page and lib/actions/import.ts both use this table; it was never
-- created here, so /import returned a 500 for every user who could reach it and
-- the whole "Import from Excel" feature was unreachable.
create table if not exists import_jobs (
  id          serial primary key,
  dataset     text not null,
  filename    text not null,
  total_rows  integer not null default 0,
  imported    integer not null default 0,
  skipped     integer not null default 0,
  errors      jsonb not null default '[]'::jsonb,
  mapping     jsonb not null default '{}'::jsonb,
  status      text not null default 'pending' check (status in ('pending','done','failed')),
  user_id     integer references users(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists import_jobs_idx on import_jobs (dataset, created_at desc);

-- ------------------------------------------------------------------- finance
-- Finance is CRM-owned. These start empty: ERP finance records are not copied
-- when an organisation moves from the staff portal to the standalone CRM.
create table if not exists crm_finance_invoices (
  id serial primary key, ref text not null unique,
  company_id integer references crm_companies(id) on delete set null,
  issue_date date not null default current_date, due_date date,
  currency text not null default 'NGN', subtotal numeric(14,2) not null default 0,
  tax_rate numeric(5,2) not null default 7.5, tax_amount numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0, amount_paid numeric(14,2) not null default 0,
  status text not null default 'draft' check (status in ('draft','sent','part_paid','paid','void')),
  notes text, created_by integer references users(id) on delete set null, created_at timestamptz not null default now()
);
create index if not exists crm_finance_invoices_status_idx on crm_finance_invoices (status, due_date);
create table if not exists crm_finance_payments (
  id serial primary key, invoice_id integer not null references crm_finance_invoices(id) on delete cascade,
  amount numeric(14,2) not null check (amount > 0), paid_on date not null default current_date,
  method text not null default 'transfer', reference text, recorded_by integer references users(id) on delete set null,
  created_at timestamptz not null default now()
);
create table if not exists crm_finance_expenses (
  id serial primary key, ref text not null unique, user_id integer not null references users(id) on delete cascade,
  category text not null default 'other', description text not null, amount numeric(14,2) not null check (amount > 0),
  currency text not null default 'NGN', spent_on date not null default current_date,
  status text not null default 'pending' check (status in ('pending','approved','rejected','reimbursed')),
  approver_id integer references users(id) on delete set null, decision_note text, created_at timestamptz not null default now()
);
create index if not exists crm_finance_expenses_status_idx on crm_finance_expenses (status, created_at desc);
create table if not exists crm_finance_budgets (
  id serial primary key, name text not null, fiscal_year integer not null, category text not null default 'operating',
  allocated numeric(14,2) not null default 0 check (allocated >= 0), currency text not null default 'NGN',
  notes text, created_by integer references users(id) on delete set null, created_at timestamptz not null default now()
);

-- Tickets --------------------------------------------------------------------
-- A response target has to stop when somebody responds. Without this the SLA
-- clock ran on after the team had replied and the ticket still turned red.
alter table crm_tickets add column if not exists first_response_at timestamptz;

create unique index if not exists crm_contacts_company_email_idx
  on crm_contacts (company_id, lower(email)) where email is not null;

-- One primary contact per account, not several.
with ranked as (
  select id, company_id, row_number() over (partition by company_id order by is_primary desc, id) as rn
    from crm_contacts
)
update crm_contacts c set is_primary = (r.rn = 1) from ranked r where r.id = c.id;

create unique index if not exists crm_contacts_one_primary_idx
  on crm_contacts (company_id) where is_primary;

-- Document references --------------------------------------------------------
-- Quotes and tickets shared one counter, so the first ticket raised came out as
-- TKT/2026/0003 because two quotes had taken 0001 and 0002.
create sequence if not exists qte_ref_seq;
create sequence if not exists tkt_ref_seq;

-- Start each new counter past the highest number that prefix has already used,
-- so the split does not reissue a reference that is already on a document.
select setval('qte_ref_seq',
  greatest(1, coalesce((select max(split_part(ref, '/', 3)::int) from crm_quotes  where ref ~ '^QTE/\d+/\d+$'), 0)), true);
select setval('tkt_ref_seq',
  greatest(1, coalesce((select max(split_part(ref, '/', 3)::int) from crm_tickets where ref ~ '^TKT/\d+/\d+$'), 0)), true);

-- ===========================================================================
-- Roles as data.
--
-- The capability list itself lives in lib/capabilities.ts, because the code is
-- what checks it. Which capabilities a role holds is data, and editable under
-- Data -> Roles & access. `users.role` points at roles.key.
-- ===========================================================================
create table if not exists roles (
  key         text primary key,
  name        text not null,
  description text,
  /** Built-in roles cannot be deleted or renamed; their capabilities can still be changed. */
  is_builtin  boolean not null default false,
  /** When the built-in capability grant was applied, so it is never re-applied. */
  seeded_at   timestamptz,
  created_at  timestamptz not null default now()
);
alter table roles add column if not exists seeded_at timestamptz;

create table if not exists role_permissions (
  role_key   text not null references roles(key) on delete cascade,
  capability text not null,
  primary key (role_key, capability)
);

insert into roles (key, name, description, is_builtin) values
  ('admin',   'Administrator',   'Full reach over the CRM and its configuration.', true),
  ('hr',      'Human Resources', 'Administers people and can see the whole picture.', true),
  ('manager', 'Sales Manager',   'Runs a sales team: works across their reps'' records and reassigns work.', true),
  ('staff',   'Sales',           'Works their own accounts, opportunities, quotes and tickets.', true)
on conflict (key) do nothing;

-- Point users at the roles table instead of a hardcoded check constraint, so a
-- new role becomes usable without a migration.
alter table users drop constraint if exists users_role_check;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'users_role_fkey') then
    alter table users add constraint users_role_fkey
      foreign key (role) references roles(key) on update cascade;
  end if;
end $$;

-- Reports and the dashboard used to be unscoped for everybody, so a rep could
-- read the whole company's pipeline and a table ranking colleagues by won
-- value. `report.view` is now their own numbers and `report.view_all` widens
-- it; grant the wider one to the roles that already had that reach. Guarded on
-- seeded_at so a deliberate revocation is not undone on the next migrate.
insert into role_permissions (role_key, capability)
select r.key, 'report.view_all' from roles r
 where r.key in ('admin','hr','manager') and r.seeded_at is not null
on conflict do nothing;

-- report.view_all became report.view_owners: the totals on Reports and the
-- dashboard are company-wide again, matching the shared pipeline board, and the
-- capability now gates only the performance-by-owner table that ranks reps
-- against each other. Carry existing grants across.
insert into role_permissions (role_key, capability)
select role_key, 'report.view_owners' from role_permissions where capability = 'report.view_all'
on conflict do nothing;

-- ===========================================================================
-- Quote editing and revision history
--
-- Quotes used to be write-once: createQuote, setQuoteStatus, deleteQuote, and
-- nothing that could change one. A typo in a draft meant deleting it and
-- re-keying every line, and an accepted quote could be neither edited nor
-- deleted — setQuoteStatus told you to "raise a revised quote instead", which
-- was a thing the system had no way to do.
--
-- A quote is an external priced document, so what "edit" means depends on how
-- far it has travelled:
--   draft                      -> corrected in place; nobody has seen it
--   sent                       -> a new version of the same quote; the customer
--                                 holds the previous one, so it is frozen first
--   accepted/declined/expired  -> closed. A revision is a NEW quote with its own
--                                 reference, linked back to the one it replaces,
--                                 because the old reference is on a commitment.
-- ===========================================================================

alter table crm_quotes add column if not exists terms_html    text;
alter table crm_quotes add column if not exists version       int not null default 1;
alter table crm_quotes add column if not exists updated_at    timestamptz;
alter table crm_quotes add column if not exists updated_by    int references users(id) on delete set null;
-- The quote this one was raised to replace, and when the old one was replaced.
alter table crm_quotes add column if not exists supersedes_id int references crm_quotes(id) on delete set null;
alter table crm_quotes add column if not exists superseded_at timestamptz;

create index if not exists crm_quotes_supersedes_idx on crm_quotes (supersedes_id);

-- An immutable copy of each version of a quote as it was sent.
--
-- Lines are stored as JSON rather than rows: a version is a photograph, never
-- something to join against or edit, and keeping them relational would invite
-- exactly the in-place update this table exists to prevent.
create table if not exists crm_quote_versions (
  id            serial primary key,
  quote_id      int not null references crm_quotes(id) on delete cascade,
  version       int not null,
  title         text not null,
  terms         text,
  terms_html    text,
  currency      text not null default 'NGN',
  issue_date    date,
  valid_until   date,
  subtotal      numeric(14,2) not null default 0,
  discount      numeric(14,2) not null default 0,
  tax_rate      numeric(5,2)  not null default 0,
  tax_amount    numeric(14,2) not null default 0,
  total         numeric(14,2) not null default 0,
  lines         jsonb not null default '[]'::jsonb,
  -- What changed and why, shown in the revision history.
  note          text,
  superseded_at timestamptz,
  created_by    int references users(id) on delete set null,
  created_at    timestamptz not null default now(),
  unique (quote_id, version)
);

create index if not exists crm_quote_versions_quote_idx on crm_quote_versions (quote_id, version desc);

-- Backfill: every quote that has left draft becomes version 1, so the first
-- revision of an existing quote has something to supersede.
insert into crm_quote_versions (quote_id, version, title, terms, terms_html, currency, issue_date, valid_until,
                                subtotal, discount, tax_rate, tax_amount, total, lines, created_by, created_at)
select q.id, 1, q.title, q.terms, q.terms_html, q.currency, q.issue_date, q.valid_until,
       q.subtotal, q.discount, q.tax_rate, q.tax_amount, q.total,
       coalesce((select json_agg(json_build_object(
                          'description', l.description, 'quantity', l.quantity,
                          'unit_price', l.unit_price, 'line_total', l.line_total) order by l.id)
                   from crm_quote_lines l where l.quote_id = q.id), '[]'::json)::jsonb,
       q.owner_id, q.created_at
  from crm_quotes q
 where q.status <> 'draft'
   and not exists (select 1 from crm_quote_versions v where v.quote_id = q.id and v.version = 1);

-- ==========================================================================
-- Non-AI growth capabilities: capture, communications, workflow automation,
-- and configurable KPIs. All data remains in the standalone CRM database.
-- ==========================================================================

-- Leads may arrive through a form or a channel connector, not only manual entry.
alter table crm_leads drop constraint if exists crm_leads_source_check;
alter table crm_leads add constraint crm_leads_source_check check (
  source in ('website','web_form','referral','event','cold_call','campaign','linkedin','email','whatsapp','sms','social','other')
);

create table if not exists crm_saved_kpis (
  id           serial primary key,
  name         text not null,
  entity       text not null check (entity in ('leads','deals','tickets','activities')),
  metric       text not null check (metric in ('count','sum_value','weighted_value','average_value')),
  filter_field text,
  filter_value text,
  owner_id     integer references users(id) on delete set null,
  created_by   integer references users(id) on delete set null,
  created_at   timestamptz not null default now()
);



-- Add the new administration capabilities once. The marker prevents a later
-- deliberate role revocation being silently undone by another migration.
do $$
begin
  if not exists (select 1 from settings where key = 'migration.non_ai_crm_capabilities') then
    insert into role_permissions (role_key, capability)
    select r.key, c.capability
      from roles r
      cross join (values ('capture.manage'),('automation.manage'),('channels.manage'),('report.manage')) c(capability)
     where r.key = 'admin'
    on conflict do nothing;
    insert into role_permissions (role_key, capability)
    select r.key, c.capability
      from roles r
      cross join (values ('capture.manage'),('automation.manage'),('report.manage')) c(capability)
     where r.key = 'manager'
    on conflict do nothing;
    insert into settings (key, value) values ('migration.non_ai_crm_capabilities', '{"applied":true}'::jsonb);
  end if;
end $$;

-- ===========================================================================
-- Customer deposit accounts
--
-- A customer pays a sum up front — ₦500,000,000 — and then asks for goods
-- against it until the money is gone. That is not a deal, not a quote and not
-- an invoice: it is a fund the customer owns and the company draws down, and
-- the only question anyone ever asks of it is "how much is left".
--
-- So it is a ledger. `crm_deposit_entries` is append-only and signed: money in
-- is positive, goods supplied and refunds are negative, and the balance is
-- their sum. Nothing stores a running balance, because a stored balance and a
-- ledger that disagree is the one failure this must not have.
-- ===========================================================================
create sequence if not exists crm_deposit_ref_seq;
create sequence if not exists crm_drawdown_ref_seq;

create table if not exists crm_deposits (
  id          serial primary key,
  ref         text not null unique default 'DEP-' || to_char(now(),'YYYY') || '-' || lpad(nextval('crm_deposit_ref_seq')::text, 4, '0'),
  company_id  integer not null references crm_companies(id) on delete cascade,
  name        text not null,
  currency    text not null default 'NGN',
  /** Closed by hand when the relationship ends; 'exhausted' is derived, not stored. */
  status      text not null default 'active' check (status in ('active','closed')),
  opened_on   date not null default current_date,
  /** Warn the owner when the balance falls below this share of what was funded. */
  low_balance_ratio numeric(4,3) not null default 0.100
                    check (low_balance_ratio >= 0 and low_balance_ratio <= 1),
  owner_id    integer references users(id) on delete set null,
  notes       text,
  created_by  integer references users(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists crm_deposits_company_idx on crm_deposits (company_id, status);

create table if not exists crm_deposit_entries (
  id          bigserial primary key,
  deposit_id  integer not null references crm_deposits(id) on delete cascade,
  ref         text not null unique default 'DRW-' || to_char(now(),'YYYY') || '-' || lpad(nextval('crm_drawdown_ref_seq')::text, 4, '0'),
  kind        text not null check (kind in ('funding','drawdown','refund','adjustment')),
  /**
   * Signed, in the deposit's currency. The forms take a positive number and
   * the action applies the sign, so nobody has to remember which way round a
   * drawdown goes — but what is stored is a real ledger amount that sums.
   */
  amount      numeric(16,2) not null,
  occurred_on date not null default current_date,
  description text not null default '',
  /** Their purchase order or waybill number, so the two records can be tied up. */
  reference   text,
  attachment_id integer references attachments(id) on delete set null,
  recorded_by integer references users(id) on delete set null,
  created_at  timestamptz not null default now(),
  check (
    (kind = 'funding'   and amount > 0) or
    (kind = 'drawdown'  and amount < 0) or
    (kind = 'refund'    and amount < 0) or
    (kind = 'adjustment' and amount <> 0)
  )
);
create index if not exists crm_deposit_entries_idx on crm_deposit_entries (deposit_id, occurred_on desc, id desc);

-- What was supplied on a drawdown: the light units, how many, and at what price.
-- A drawdown's amount is the sum of these when there are any, which the action
-- enforces; an entry may still be a single figure with no breakdown.
create table if not exists crm_deposit_items (
  id          bigserial primary key,
  entry_id    bigint not null references crm_deposit_entries(id) on delete cascade,
  description text not null,
  quantity    numeric(12,2) not null default 1 check (quantity > 0),
  unit_price  numeric(16,2) not null default 0 check (unit_price >= 0),
  line_total  numeric(16,2) not null default 0
);
create index if not exists crm_deposit_items_entry_idx on crm_deposit_items (entry_id);

-- The balance of every account, as one place for every screen to read it from.
create or replace view crm_deposit_balances as
  select d.id as deposit_id,
         coalesce(sum(e.amount) filter (where e.amount > 0), 0) as funded,
         coalesce(-sum(e.amount) filter (where e.amount < 0), 0) as drawn,
         coalesce(sum(e.amount), 0) as balance,
         count(e.id) filter (where e.kind = 'drawdown')::int as drawdowns,
         max(e.occurred_on) as last_movement_on
    from crm_deposits d
    left join crm_deposit_entries e on e.deposit_id = d.id
   group by d.id;

-- ===========================================================================
-- Notifications grew the fields the inbox needs to offer a quick action
-- ===========================================================================
alter table notifications add column if not exists kind text not null default 'general';
alter table notifications add column if not exists entity text;
alter table notifications add column if not exists entity_id text;
alter table notifications add column if not exists action_label text;
/** When the matching email went out, so nothing has to guess whether it did. */
alter table notifications add column if not exists emailed_at timestamptz;
