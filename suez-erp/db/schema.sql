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
-- SuezERP — the staff portal's own tables. Idempotent: safe to re-run.
-- ponytail: text + CHECK instead of pg enums, so adding a status is one ALTER.

-- ------------------------------------------------------------------ customers
-- The ERP's own record of who it invoices and delivers projects for.
--
-- It deliberately does not reach into the CRM's companies: the two systems ship
-- separately and a customer may buy the ERP without the CRM at all. Where both
-- are deployed, the CRM's accounts are brought across through Data Import
-- rather than a join across databases.
create table if not exists customers (
  id         serial primary key,
  name       text not null,
  industry   text,
  email      text,
  phone      text,
  address    text,
  tax_id     text,
  notes      text,
  status     text not null default 'active' check (status in ('active','dormant','closed')),
  created_at timestamptz not null default now()
);
create unique index if not exists customers_name_key on customers (lower(name));
create sequence if not exists doc_ref_seq;

create table if not exists memos (
  id            serial primary key,
  ref           text not null unique default 'DOC-' || to_char(now(),'YYYY') || '-' || lpad(nextval('doc_ref_seq')::text, 4, '0'),
  kind          text not null default 'memo' check (kind in ('memo','circular','policy','announcement')),
  title         text not null,
  body          text not null default '',
  author_id     integer not null references users(id) on delete cascade,
  priority      text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  audience      text not null default 'all' check (audience in ('all','department','selected')),
  department_id integer references departments(id) on delete set null,
  requires_ack  boolean not null default false,
  status        text not null default 'draft' check (status in ('draft','published','archived')),
  attachment_id integer references attachments(id) on delete set null,
  author_signature_ref    text,
  author_signature_sha256 text,
  author_signature_placement jsonb not null default '{"x":4,"y":18}'::jsonb,
  published_at  timestamptz,
  created_at    timestamptz not null default now()
);

-- Captured at publication, for the same reason as memo_recipients: the author may
-- change their stored signature afterwards, and a published document must not.
alter table memos add column if not exists author_signature_ref    text;
alter table memos add column if not exists author_signature_sha256 text;
-- The author chooses this while the document is still a draft.  It is kept
-- beside the immutable signature snapshot so the printed/published preview
-- retains the position the author actually chose.
alter table memos add column if not exists author_signature_placement jsonb not null default '{"x":4,"y":18}'::jsonb;

-- The signature columns are a snapshot taken at the moment of signing: an immutable
-- copy of the image plus its hash. Changing or deleting the signature on the user
-- row afterwards cannot alter what was signed.
create table if not exists memo_recipients (
  memo_id          integer not null references memos(id) on delete cascade,
  user_id          integer not null references users(id) on delete cascade,
  read_at          timestamptz,
  acknowledged_at  timestamptz,
  signature_ref    text,
  signature_sha256 text,
  signed_ip        text,
  signed_agent     text,
  signed_with_password boolean not null default false,
  primary key (memo_id, user_id)
);

-- Upgrade path for databases created before acknowledgements were snapshotted.
alter table memo_recipients add column if not exists signature_ref    text;
alter table memo_recipients add column if not exists signature_sha256 text;
alter table memo_recipients add column if not exists signed_ip        text;
alter table memo_recipients add column if not exists signed_agent     text;
-- Recorded per signature, not read from current policy: the policy can be changed
-- later, and a register must describe what actually happened at the time.
alter table memo_recipients add column if not exists signed_with_password boolean not null default false;

-- --------------------------------------------------------------- leave module
create table if not exists leave_types (
  id            serial primary key,
  name          text not null unique,
  default_days  integer not null default 0,
  color         text not null default '#6366f1',
  paid          boolean not null default true
);

create sequence if not exists leave_ref_seq;

create table if not exists leave_requests (
  id            serial primary key,
  ref           text not null unique default 'LV-' || to_char(now(),'YYYY') || '-' || lpad(nextval('leave_ref_seq')::text, 4, '0'),
  user_id       integer not null references users(id) on delete cascade,
  leave_type_id integer not null references leave_types(id),
  start_date    date not null,
  end_date      date not null,
  days          numeric(5,1) not null,
  reason        text,
  handover_to   integer references users(id) on delete set null,
  status        text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  approver_id   integer references users(id) on delete set null,
  decision_note text,
  decided_at    timestamptz,
  attachment_id integer references attachments(id) on delete set null,
  created_at    timestamptz not null default now(),
  check (end_date >= start_date)
);

create table if not exists leave_balances (
  user_id       integer not null references users(id) on delete cascade,
  leave_type_id integer not null references leave_types(id) on delete cascade,
  year          integer not null,
  entitled      numeric(5,1) not null default 0,
  used          numeric(5,1) not null default 0,
  primary key (user_id, leave_type_id, year)
);

-- ------------------------------------------------------- workflow / requests
create sequence if not exists req_ref_seq;

create table if not exists workflow_requests (
  id            serial primary key,
  ref           text not null unique default 'REQ-' || to_char(now(),'YYYY') || '-' || lpad(nextval('req_ref_seq')::text, 4, '0'),
  title         text not null,
  description   text,
  category      text not null default 'document' check (category in ('document','approval','it_support','procurement','finance','hr','facility','other')),
  requester_id  integer not null references users(id) on delete cascade,
  assignee_id   integer not null references users(id) on delete cascade,
  priority      text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  due_date      date,
  status        text not null default 'pending' check (status in ('pending','in_progress','awaiting_info','completed','rejected','cancelled')),
  completed_at  timestamptz,
  created_at    timestamptz not null default now()
);

create table if not exists workflow_comments (
  id            serial primary key,
  request_id    integer not null references workflow_requests(id) on delete cascade,
  user_id       integer not null references users(id) on delete cascade,
  body          text not null default '',
  attachment_id integer references attachments(id) on delete set null,
  created_at    timestamptz not null default now()
);

-- Requests may carry several categories and a deliberate approval trail. The
-- final approver is the only step allowed to sign off; earlier steps approve
-- in order and leave an auditable trail for the requester.
create table if not exists workflow_request_categories (
  request_id integer not null references workflow_requests(id) on delete cascade,
  category text not null,
  primary key (request_id, category)
);
create table if not exists workflow_request_approval_steps (
  id serial primary key, request_id integer not null references workflow_requests(id) on delete cascade,
  step integer not null, user_id integer not null references users(id) on delete restrict,
  is_final boolean not null default false, status text not null default 'pending' check (status in ('pending','approved','rejected','skipped')),
  note text, decided_at timestamptz,
  signature_ref text, signature_sha256 text,
  signature_placement jsonb not null default '{"x":4,"y":18}'::jsonb,
  signed_ip text, signed_agent text,
  unique (request_id, step), unique (request_id, user_id)
);
create unique index if not exists workflow_request_one_final_idx on workflow_request_approval_steps (request_id) where is_final;
alter table workflow_request_approval_steps add column if not exists signature_ref text;
alter table workflow_request_approval_steps add column if not exists signature_sha256 text;
alter table workflow_request_approval_steps add column if not exists signature_placement jsonb not null default '{"x":4,"y":18}'::jsonb;
alter table workflow_request_approval_steps add column if not exists signed_ip text;
alter table workflow_request_approval_steps add column if not exists signed_agent text;

-- ------------------------------------------------------- internal messaging
create table if not exists conversations (
  id         serial primary key,
  subject    text,
  is_group   boolean not null default false,
  created_by integer references users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists conversation_members (
  conversation_id integer not null references conversations(id) on delete cascade,
  user_id         integer not null references users(id) on delete cascade,
  last_read_at    timestamptz,
  primary key (conversation_id, user_id)
);

create table if not exists messages (
  id              serial primary key,
  conversation_id integer not null references conversations(id) on delete cascade,
  sender_id       integer not null references users(id) on delete cascade,
  body            text not null default '',
  attachment_id   integer references attachments(id) on delete set null,
  created_at      timestamptz not null default now()
);
create index if not exists messages_convo_idx on messages (conversation_id, created_at desc);

-- ------------------------------------------------------------ announcements
-- Lighter than a memo: no acknowledgement, no register, pinned to the dashboard.
create table if not exists announcements (
  id          serial primary key,
  title       text not null,
  body        text not null,
  category    text not null default 'general' check (category in ('general','policy','event','it','hr','safety')),
  priority    text not null default 'normal' check (priority in ('low','normal','high')),
  pinned      boolean not null default false,
  audience    text not null default 'all' check (audience in ('all','department')),
  department_id integer references departments(id) on delete cascade,
  publish_at  timestamptz not null default now(),
  expires_at  timestamptz,
  author_id   integer references users(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists announcements_live_idx on announcements (pinned desc, publish_at desc);

-- --------------------------------------------------------------- timesheets
create table if not exists timesheets (
  id           serial primary key,
  user_id      integer not null references users(id) on delete cascade,
  week_start   date not null,                      -- always a Monday
  status       text not null default 'draft' check (status in ('draft','submitted','approved','rejected')),
  submitted_at timestamptz,
  decided_at   timestamptz,
  approver_id  integer references users(id) on delete set null,
  note         text,
  created_at   timestamptz not null default now(),
  unique (user_id, week_start)
);

create table if not exists timesheet_entries (
  id            serial primary key,
  timesheet_id  integer not null references timesheets(id) on delete cascade,
  work_date     date not null,
  hours         numeric(5,2) not null default 0 check (hours >= 0 and hours <= 24),
  project_id    integer,
  task          text,
  billable      boolean not null default false,
  created_at    timestamptz not null default now()
);
create index if not exists timesheet_entries_ts_idx on timesheet_entries (timesheet_id, work_date);

-- --------------------------------------------------------------- appraisals
create table if not exists appraisal_cycles (
  id         serial primary key,
  name       text not null,
  period_start date not null,
  period_end   date not null,
  status     text not null default 'open' check (status in ('open','closed')),
  created_at timestamptz not null default now()
);

create table if not exists appraisals (
  id           serial primary key,
  cycle_id     integer not null references appraisal_cycles(id) on delete cascade,
  user_id      integer not null references users(id) on delete cascade,
  reviewer_id  integer references users(id) on delete set null,
  self_review  text,
  reviewer_review text,
  -- 1..5, set independently by the employee and the reviewer.
  self_score     integer check (self_score between 1 and 5),
  reviewer_score integer check (reviewer_score between 1 and 5),
  status       text not null default 'pending' check (status in ('pending','self_done','reviewed','acknowledged')),
  created_at   timestamptz not null default now(),
  unique (cycle_id, user_id)
);

create table if not exists appraisal_goals (
  id           serial primary key,
  appraisal_id integer not null references appraisals(id) on delete cascade,
  title        text not null,
  weight       integer not null default 20 check (weight between 0 and 100),
  progress     integer not null default 0 check (progress between 0 and 100),
  notes        text
);

-- ------------------------------------------------------------------ projects
create table if not exists projects (
  id          serial primary key,
  code        text unique,
  name        text not null,
  customer_id integer references customers(id) on delete set null,
  manager_id  integer references users(id) on delete set null,
  department_id integer references departments(id) on delete set null,
  status      text not null default 'planning' check (status in ('planning','active','on_hold','completed','cancelled')),
  start_date  date,
  end_date    date,
  budget      numeric(14,2) not null default 0,
  currency    text not null default 'NGN',
  description text,
  created_at  timestamptz not null default now()
);

create table if not exists project_members (
  project_id integer not null references projects(id) on delete cascade,
  user_id    integer not null references users(id) on delete cascade,
  role       text not null default 'member',
  primary key (project_id, user_id)
);

create table if not exists project_tasks (
  id          serial primary key,
  project_id  integer not null references projects(id) on delete cascade,
  title       text not null,
  assignee_id integer references users(id) on delete set null,
  status      text not null default 'todo' check (status in ('todo','in_progress','blocked','done')),
  priority    text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  due_date    date,
  estimate_hours numeric(6,2),
  description text,
  created_at  timestamptz not null default now()
);
create index if not exists project_tasks_proj_idx on project_tasks (project_id, status);

alter table timesheet_entries
  drop constraint if exists timesheet_entries_project_fk,
  add constraint timesheet_entries_project_fk foreign key (project_id) references projects(id) on delete set null;

-- ------------------------------------------------------------------- finance
create sequence if not exists finance_ref_seq;

create table if not exists invoices (
  id          serial primary key,
  ref         text not null unique,
  kind        text not null default 'sales' check (kind in ('sales','purchase')),
  customer_id integer references customers(id) on delete set null,
  vendor_id   integer,
  project_id  integer references projects(id) on delete set null,
  issue_date  date not null default current_date,
  due_date    date,
  currency    text not null default 'NGN',
  subtotal    numeric(14,2) not null default 0,
  tax_rate    numeric(5,2) not null default 7.5,
  tax_amount  numeric(14,2) not null default 0,
  total       numeric(14,2) not null default 0,
  amount_paid numeric(14,2) not null default 0,
  status      text not null default 'draft' check (status in ('draft','sent','part_paid','paid','overdue','void')),
  notes       text,
  created_by  integer references users(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists invoices_status_idx on invoices (status, due_date);

create table if not exists invoice_lines (
  id          serial primary key,
  invoice_id  integer not null references invoices(id) on delete cascade,
  description text not null,
  quantity    numeric(12,2) not null default 1,
  unit_price  numeric(14,2) not null default 0,
  line_total  numeric(14,2) not null default 0
);

create table if not exists payments (
  id         serial primary key,
  invoice_id integer not null references invoices(id) on delete cascade,
  amount     numeric(14,2) not null,
  paid_on    date not null default current_date,
  method     text not null default 'transfer' check (method in ('transfer','cash','cheque','card','other')),
  reference  text,
  recorded_by integer references users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists expenses (
  id          serial primary key,
  ref         text not null unique,
  user_id     integer not null references users(id) on delete cascade,
  project_id  integer references projects(id) on delete set null,
  category    text not null default 'other' check (category in ('travel','meals','accommodation','fuel','supplies','training','other')),
  description text not null,
  amount      numeric(14,2) not null default 0,
  currency    text not null default 'NGN',
  spent_on    date not null default current_date,
  receipt_id  integer references attachments(id) on delete set null,
  status      text not null default 'pending' check (status in ('pending','approved','rejected','reimbursed')),
  approver_id integer references users(id) on delete set null,
  decided_at  timestamptz,
  decision_note text,
  created_at  timestamptz not null default now()
);
create index if not exists expenses_status_idx on expenses (status, created_at desc);

create table if not exists budgets (
  id            serial primary key,
  department_id integer references departments(id) on delete cascade,
  project_id    integer references projects(id) on delete cascade,
  fiscal_year   integer not null,
  category      text not null default 'operating',
  allocated     numeric(14,2) not null default 0,
  currency      text not null default 'NGN',
  notes         text,
  created_at    timestamptz not null default now()
);

-- --------------------------------------------------------------- procurement
create table if not exists vendors (
  id         serial primary key,
  name       text not null,
  category   text,
  email      text,
  phone      text,
  address    text,
  tax_id     text,
  bank_details text,
  rating     integer check (rating between 1 and 5),
  status     text not null default 'active' check (status in ('active','suspended','blacklisted')),
  notes      text,
  created_at timestamptz not null default now()
);

alter table invoices
  drop constraint if exists invoices_vendor_fk,
  add constraint invoices_vendor_fk foreign key (vendor_id) references vendors(id) on delete set null;

create table if not exists purchase_requisitions (
  id            serial primary key,
  ref           text not null unique,
  title         text not null,
  requester_id  integer not null references users(id) on delete cascade,
  department_id integer references departments(id) on delete set null,
  project_id    integer references projects(id) on delete set null,
  justification text,
  needed_by     date,
  estimated_cost numeric(14,2) not null default 0,
  currency      text not null default 'NGN',
  status        text not null default 'pending' check (status in ('draft','pending','approved','rejected','ordered')),
  approver_id   integer references users(id) on delete set null,
  decided_at    timestamptz,
  decision_note text,
  created_at    timestamptz not null default now()
);

create table if not exists purchase_orders (
  id             serial primary key,
  ref            text not null unique,
  requisition_id integer references purchase_requisitions(id) on delete set null,
  vendor_id      integer references vendors(id) on delete set null,
  order_date     date not null default current_date,
  expected_date  date,
  currency       text not null default 'NGN',
  subtotal       numeric(14,2) not null default 0,
  tax_amount     numeric(14,2) not null default 0,
  total          numeric(14,2) not null default 0,
  status         text not null default 'draft' check (status in ('draft','sent','part_received','received','cancelled')),
  notes          text,
  created_by     integer references users(id) on delete set null,
  created_at     timestamptz not null default now()
);

create table if not exists purchase_order_lines (
  id          serial primary key,
  po_id       integer not null references purchase_orders(id) on delete cascade,
  item_id     integer,
  description text not null,
  quantity    numeric(12,2) not null default 1,
  received_qty numeric(12,2) not null default 0,
  unit_price  numeric(14,2) not null default 0,
  line_total  numeric(14,2) not null default 0
);

-- ----------------------------------------------------------------- inventory
create table if not exists warehouses (
  id       serial primary key,
  name     text not null unique,
  location text,
  manager_id integer references users(id) on delete set null
);

create table if not exists inventory_items (
  id           serial primary key,
  sku          text not null unique,
  name         text not null,
  category     text,
  unit         text not null default 'each',
  reorder_level numeric(12,2) not null default 0,
  unit_cost    numeric(14,2) not null default 0,
  currency     text not null default 'NGN',
  warehouse_id integer references warehouses(id) on delete set null,
  -- Denormalised running total; every change goes through stock_movements.
  quantity     numeric(12,2) not null default 0,
  status       text not null default 'active' check (status in ('active','discontinued')),
  created_at   timestamptz not null default now()
);

alter table purchase_order_lines
  drop constraint if exists po_lines_item_fk,
  add constraint po_lines_item_fk foreign key (item_id) references inventory_items(id) on delete set null;

create table if not exists stock_movements (
  id         serial primary key,
  item_id    integer not null references inventory_items(id) on delete cascade,
  kind       text not null check (kind in ('in','out','adjust')),
  quantity   numeric(12,2) not null,
  reason     text,
  reference  text,
  po_id      integer references purchase_orders(id) on delete set null,
  moved_by   integer references users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists stock_movements_item_idx on stock_movements (item_id, created_at desc);

-- -------------------------------------------------------------------- assets
create table if not exists assets (
  id            serial primary key,
  tag           text not null unique,
  name          text not null,
  category      text not null default 'it' check (category in ('it','furniture','vehicle','machinery','building','other')),
  serial_no     text,
  purchase_date date,
  purchase_cost numeric(14,2) not null default 0,
  currency      text not null default 'NGN',
  useful_life_years integer not null default 5,
  vendor_id     integer references vendors(id) on delete set null,
  location      text,
  status        text not null default 'in_store' check (status in ('in_store','assigned','maintenance','retired','disposed')),
  notes         text,
  created_at    timestamptz not null default now()
);

create table if not exists asset_assignments (
  id          serial primary key,
  asset_id    integer not null references assets(id) on delete cascade,
  user_id     integer references users(id) on delete set null,
  assigned_on date not null default current_date,
  returned_on date,
  condition   text,
  note        text
);
create index if not exists asset_assignments_asset_idx on asset_assignments (asset_id, returned_on);

-- --------------------------------------------------------------- data import
-- One row per uploaded spreadsheet, so an import can be reviewed and traced.
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
-- SuezERP — per-user email accounts (IMAP read, SMTP send). Idempotent.
-- This is distinct from the org-wide transactional SMTP in `settings`:
-- that one sends notifications as the company, these are staff mailboxes.

create table if not exists mail_accounts (
  id           serial primary key,
  user_id      integer not null references users(id) on delete cascade,
  display_name text,
  email        text not null,
  imap_host    text not null,
  imap_port    integer not null default 993,
  imap_secure  boolean not null default true,
  imap_user    text not null,
  -- ponytail: encrypted with SESSION_SECRET via lib/secretbox.ts, never plaintext.
  imap_pass    text not null,
  smtp_host    text not null,
  smtp_port    integer not null default 587,
  smtp_secure  boolean not null default false,
  smtp_user    text not null,
  smtp_pass    text not null,
  signature    text,
  last_sync_at timestamptz,
  last_error   text,
  status       text not null default 'active' check (status in ('active','error','disabled')),
  created_at   timestamptz not null default now(),
  unique (user_id, email)
);

-- The provider's live IMAP folder catalogue. `path` is deliberately stored
-- verbatim: Gmail, Microsoft and custom servers use different names and
-- delimiters for Sent/Drafts/Junk and may expose arbitrary nested folders.
create table if not exists mail_folders (
  account_id   integer not null references mail_accounts(id) on delete cascade,
  path         text not null,
  name         text not null,
  delimiter    text,
  special_use  text,
  selectable   boolean not null default true,
  subscribed   boolean not null default true,
  discovered_at timestamptz not null default now(),
  primary key (account_id, path)
);
create index if not exists mail_folders_special_idx on mail_folders (account_id, special_use);

create table if not exists mail_messages (
  id          serial primary key,
  account_id  integer not null references mail_accounts(id) on delete cascade,
  folder      text not null default 'INBOX',
  uid         bigint not null,
  message_id  text,
  in_reply_to text,
  from_name   text,
  from_email  text,
  to_emails   text,
  cc_emails   text,
  subject     text,
  snippet     text,
  body_text   text,
  body_html   text,
  seen        boolean not null default false,
  flagged     boolean not null default false,
  answered    boolean not null default false,
  has_attachments boolean not null default false,
  size_bytes  integer not null default 0,
  sent_at     timestamptz,
  synced_at   timestamptz not null default now(),
  unique (account_id, folder, uid)
);
create index if not exists mail_messages_box_idx on mail_messages (account_id, folder, sent_at desc);
create index if not exists mail_messages_unread_idx on mail_messages (account_id, folder, seen);

create table if not exists mail_attachments (
  id         serial primary key,
  message_id integer not null references mail_messages(id) on delete cascade,
  filename   text not null,
  mime       text not null default 'application/octet-stream',
  size_bytes integer not null default 0,
  attachment_id integer references attachments(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Outbound copies, so a sent message is visible even before the next IMAP sync.
create table if not exists mail_outbox (
  id         serial primary key,
  account_id integer not null references mail_accounts(id) on delete cascade,
  to_emails  text not null,
  cc_emails  text,
  bcc_emails text,
  subject    text,
  body_html  text,
  body_text  text,
  status     text not null default 'queued' check (status in ('queued','sent','failed')),
  error      text,
  sent_at    timestamptz,
  created_at timestamptz not null default now()
);

-- ===========================================================================
-- Post-review corrections. Everything below is additive and idempotent, so it
-- applies cleanly to an existing database as well as a fresh one.
-- ===========================================================================

-- Roles ---------------------------------------------------------------------
-- 'admin' and 'hr' used to be the only approving roles, which put purchase
-- requisitions, purchase orders and sales invoices on the Head of HR's desk and
-- left the actual Financial Analyst unable to touch any of it. Two subject
-- roles, plus a department-head flag, so authority follows the job.
alter table users drop constraint if exists users_role_check;
alter table users add constraint users_role_check
  check (role in ('admin','hr','manager','staff','finance','procurement'));

-- Leave ---------------------------------------------------------------------
-- `paid` says the days are paid; it does not say they are a balance you can
-- draw down. Maternity is paid and 90 days, and summing it into a headline
-- "paid leave remaining" produced 155 days of nonsense.
alter table leave_types add column if not exists accrues boolean not null default false;
update leave_types set accrues = true where lower(name) in ('annual leave','casual leave');

-- Expenses ------------------------------------------------------------------
-- Second approval above the threshold, and a receipt requirement, so the
-- company's own "above NGN 250,000 needs dual approval" circular is enforceable.
alter table expenses add column if not exists second_approver_id integer references users(id) on delete set null;
alter table expenses add column if not exists second_decided_at timestamptz;
alter table expenses drop constraint if exists expenses_status_check;
alter table expenses add constraint expenses_status_check
  check (status in ('pending','awaiting_second','approved','rejected','reimbursed'));

-- Invoices ------------------------------------------------------------------
-- Ties a purchase invoice to the order it settles, for a three-way match.
alter table invoices add column if not exists po_id integer references purchase_orders(id) on delete set null;

-- Purchase orders -----------------------------------------------------------
alter table purchase_orders drop constraint if exists purchase_orders_status_check;
alter table purchase_orders add constraint purchase_orders_status_check
  check (status in ('draft','sent','part_received','received','cancelled','closed'));
alter table purchase_order_lines add column if not exists received_qty numeric(14,2) not null default 0;

-- Document references -------------------------------------------------------
-- One shared counter meant the first sales invoice was numbered 0015, with gaps
-- wherever an expense or a PO had taken a number. Each series gets its own.
create sequence if not exists inv_ref_seq;
create sequence if not exists pinv_ref_seq;
create sequence if not exists exp_ref_seq;
create sequence if not exists pr_ref_seq;
create sequence if not exists po_ref_seq;

-- Login throttling ----------------------------------------------------------
-- Failed attempts were never recorded anywhere, so a credential-stuffing run
-- left no trace and nothing slowed it down.
create table if not exists login_attempts (
  id         serial primary key,
  email      text not null,
  ip         text,
  ok         boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists login_attempts_idx on login_attempts (lower(email), created_at desc);
create index if not exists login_attempts_ip_idx on login_attempts (ip, created_at desc);

-- ===========================================================================
-- Roles as data.
--
-- The capability list itself lives in lib/capabilities.ts, because the code is
-- what checks it. Which capabilities a role holds is data, and editable under
-- Administration -> Roles. `users.role` points at roles.key.
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

-- `create table if not exists` skips an existing table, so new columns need saying twice.
alter table roles add column if not exists seeded_at timestamptz;

create table if not exists role_permissions (
  role_key   text not null references roles(key) on delete cascade,
  capability text not null,
  primary key (role_key, capability)
);

-- The six roles the system shipped with. Capabilities are seeded from
-- BUILTIN_ROLES on first run by db/migrate.mjs, so behaviour is unchanged.
insert into roles (key, name, description, is_builtin) values
  ('admin',       'Administrator',   'Full reach over people, money, operations and configuration.', true),
  ('hr',          'Human Resources', 'People administration, company communications and the audit trail.', true),
  ('manager',     'Manager',         'Runs a team. Approves their own reports and writes to their department.', true),
  ('finance',     'Finance',         'Invoices, payments, expense claims and budgets.', true),
  ('procurement', 'Procurement',     'Suppliers, purchase orders, stock and the asset register.', true),
  ('staff',       'Staff',           'Everyday access: their own leave, timesheets, expenses and requests.', true)
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

-- ===========================================================================
-- Document review, editing and revision history
--
-- Documents used to be write-once: composed in a textarea, and after that only
-- publishable or archivable. There was no way to correct a typo in a draft.
--
-- Editing a *published* document is a different act from editing a draft,
-- because recipients sign published documents and those signatures are meant to
-- prove what they agreed to. So a published document is never rewritten in
-- place: the issued text is frozen into memo_versions, the version number goes
-- up, and every signature records which version it was given against.
-- ===========================================================================

-- The formatted body. `body` stays the plain-text rendition and keeps feeding
-- search, the list previews and the CSV export; only this column carries markup.
alter table memos add column if not exists body_html  text;
alter table memos add column if not exists version    int not null default 1;
alter table memos add column if not exists updated_at timestamptz;
alter table memos add column if not exists updated_by int references users(id) on delete set null;

-- An immutable copy of each version as it was issued. Written at publication and
-- again whenever a published document is revised, never updated afterwards.
create table if not exists memo_versions (
  id            serial primary key,
  memo_id       int not null references memos(id) on delete cascade,
  version       int not null,
  title         text not null,
  body          text not null,
  body_html     text,
  -- Hash of the plain-text body, so a signature can be tied to exact wording.
  body_sha256   text not null,
  -- What changed and why, shown in the revision history.
  note          text,
  published_at  timestamptz,
  superseded_at timestamptz,
  created_by    int references users(id) on delete set null,
  created_at    timestamptz not null default now(),
  unique (memo_id, version)
);

create index if not exists memo_versions_memo_idx on memo_versions (memo_id, version desc);

-- Every signature ever given, append-only.
--
-- memo_recipients holds the *current* delivery state and is cleared when a
-- revision asks for fresh acknowledgement. This table is never cleared, so
-- "who signed version 1, and what did version 1 say" stays answerable after
-- the document moves on.
create table if not exists memo_signatures (
  id                   serial primary key,
  memo_id              int not null references memos(id) on delete cascade,
  user_id              int not null references users(id) on delete cascade,
  version              int not null,
  body_sha256          text not null,
  signature_ref        text,
  signature_sha256     text,
  signed_ip            text,
  signed_agent         text,
  signed_with_password boolean not null default false,
  signed_at            timestamptz not null default now()
);

create index if not exists memo_signatures_memo_idx on memo_signatures (memo_id, version);
create index if not exists memo_signatures_user_idx on memo_signatures (user_id);

-- Which version the recipient's current acknowledgement was given against, so
-- the register can mark a signature stale after a revision.
alter table memo_recipients add column if not exists acknowledged_version int;
alter table memo_recipients add column if not exists ack_body_sha256 text;

-- Backfill: existing published documents become version 1, and the signatures
-- already collected are copied into the append-only log so no evidence is lost
-- the first time one of them is revised.
insert into memo_versions (memo_id, version, title, body, body_html, body_sha256, published_at, created_by, created_at)
select m.id, 1, m.title, m.body, m.body_html, encode(sha256(convert_to(m.body, 'UTF8')), 'hex'),
       m.published_at, m.author_id, m.created_at
  from memos m
 where m.status <> 'draft'
   and not exists (select 1 from memo_versions v where v.memo_id = m.id and v.version = 1);

update memo_recipients mr
   set acknowledged_version = 1,
       ack_body_sha256 = encode(sha256(convert_to(m.body, 'UTF8')), 'hex')
  from memos m
 where m.id = mr.memo_id
   and mr.acknowledged_at is not null
   and mr.acknowledged_version is null;

insert into memo_signatures (memo_id, user_id, version, body_sha256, signature_ref, signature_sha256,
                             signed_ip, signed_agent, signed_with_password, signed_at)
select mr.memo_id, mr.user_id, coalesce(mr.acknowledged_version, 1),
       coalesce(mr.ack_body_sha256, encode(sha256(convert_to(m.body, 'UTF8')), 'hex')),
       mr.signature_ref, mr.signature_sha256, mr.signed_ip, mr.signed_agent,
       mr.signed_with_password, mr.acknowledged_at
  from memo_recipients mr
  join memos m on m.id = mr.memo_id
 where mr.acknowledged_at is not null
   and not exists (
     select 1 from memo_signatures s
      where s.memo_id = mr.memo_id and s.user_id = mr.user_id
        and s.version = coalesce(mr.acknowledged_version, 1));

-- ===========================================================================
-- Attendance
--
-- Timesheets answer "what did you spend the week on"; attendance answers "were
-- you here, and from when until when". They are different questions asked by
-- different people — a project manager reads the first, HR and payroll read the
-- second — so this is its own record rather than a column on the timesheet.
--
-- A day can hold several sessions, because people leave the building for lunch
-- and for site visits and come back. `minutes` is written once on clock-out so
-- the register and the CSV never have to recompute it.
-- ===========================================================================
create table if not exists attendance_entries (
  id             serial primary key,
  user_id        integer not null references users(id) on delete cascade,
  work_date      date not null,
  clocked_in_at  timestamptz not null default now(),
  clocked_out_at timestamptz,
  minutes        integer,
  in_note        text,
  out_note       text,
  in_ip          text,
  out_ip         text,
  created_at     timestamptz not null default now(),
  check (clocked_out_at is null or clocked_out_at >= clocked_in_at)
);
create index if not exists attendance_user_idx on attendance_entries (user_id, work_date desc);
create index if not exists attendance_date_idx on attendance_entries (work_date desc);

-- One open session per person, enforced by the database rather than by a check
-- in the action: two quick taps on Clock in must not open two sessions.
create unique index if not exists attendance_open_idx
  on attendance_entries (user_id) where clocked_out_at is null;

-- ===========================================================================
-- Periodic reports
--
-- The Monday meeting produces a report that has to reach HR, and so does the
-- month. Both were carried by email and by hand, which is exactly what this
-- replaces: the submission, the file, and the answer to "who has not sent
-- theirs in yet" all live in one place.
-- ===========================================================================
create sequence if not exists report_ref_seq;

create table if not exists staff_reports (
  id            serial primary key,
  ref           text not null unique default 'RPT-' || to_char(now(),'YYYY') || '-' || lpad(nextval('report_ref_seq')::text, 4, '0'),
  kind          text not null default 'weekly' check (kind in ('weekly','monthly')),
  -- The period being reported on. `period_start` is a Monday for a weekly
  -- report and the 1st for a monthly one, which is what makes the unique
  -- constraint below mean "one report per person per period".
  period_start  date not null,
  period_end    date not null,
  title         text not null,
  summary       text not null default '',
  body_html     text,
  user_id       integer not null references users(id) on delete cascade,
  department_id integer references departments(id) on delete set null,
  status        text not null default 'submitted'
                check (status in ('draft','submitted','acknowledged','returned')),
  submitted_at  timestamptz,
  reviewed_by   integer references users(id) on delete set null,
  reviewed_at   timestamptz,
  review_note   text,
  created_at    timestamptz not null default now(),
  unique (user_id, kind, period_start),
  check (period_end >= period_start)
);
create index if not exists staff_reports_period_idx on staff_reports (kind, period_start desc);
create index if not exists staff_reports_user_idx on staff_reports (user_id, period_start desc);

-- A report is usually a slide deck plus a supporting document, so the files are
-- a list rather than a single `attachment_id`.
create table if not exists report_files (
  id            serial primary key,
  report_id     integer not null references staff_reports(id) on delete cascade,
  attachment_id integer not null references attachments(id) on delete cascade,
  created_at    timestamptz not null default now(),
  unique (report_id, attachment_id)
);

-- Which reminders have already gone out. Without this the reminder job would
-- mail the same person every time it ran.
create table if not exists report_reminders (
  kind         text not null,
  period_start date not null,
  user_id      integer not null references users(id) on delete cascade,
  sent_at      timestamptz not null default now(),
  primary key (kind, period_start, user_id)
);

-- ===========================================================================
-- Document annotation
--
-- A comment pinned to a passage, not to the document as a whole, so a reviewer
-- can say "this clause" and be understood.
--
-- The anchor is the quoted text plus which occurrence of it was selected,
-- rather than a character offset. Offsets survive nothing — one edit anywhere
-- above shifts every anchor below it — whereas a quote either still appears in
-- the text or visibly does not, and the reader can be told which.
-- ===========================================================================
create table if not exists memo_annotations (
  id          serial primary key,
  memo_id     integer not null references memos(id) on delete cascade,
  version     integer not null default 1,
  user_id     integer not null references users(id) on delete cascade,
  quote       text not null default '',
  occurrence  integer not null default 1,
  body        text not null,
  resolved_at timestamptz,
  resolved_by integer references users(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists memo_annotations_memo_idx on memo_annotations (memo_id, version, created_at);

-- ===========================================================================
-- Document routing
--
-- Sending a document to a named person — or to whoever holds a level of access,
-- such as a head of department — with an instruction saying what to do with it.
-- The recipient approves or rejects, signs if asked to, and the outcome goes
-- back to the sender.
--
-- This is deliberately not a workflow_request with a document attached: a
-- request is a task with a conversation, and a routed document is a decision
-- with a signature that has to stand up afterwards. The signature is snapshot
-- and hashed here for the same reason it is on memo_signatures.
-- ===========================================================================
create sequence if not exists route_ref_seq;

create table if not exists document_routes (
  id               serial primary key,
  ref              text not null unique default 'RTE-' || to_char(now(),'YYYY') || '-' || lpad(nextval('route_ref_seq')::text, 4, '0'),
  memo_id          integer not null references memos(id) on delete cascade,
  version          integer not null default 1,
  sender_id        integer not null references users(id) on delete cascade,
  recipient_id     integer not null references users(id) on delete cascade,
  /** What the sender is asking for. */
  ask              text not null default 'approve_sign'
                   check (ask in ('review','approve','sign','approve_sign')),
  instructions     text,
  due_date         date,
  status           text not null default 'pending'
                   check (status in ('pending','approved','rejected','cancelled')),
  decision_note    text,
  decided_at       timestamptz,
  -- Snapshot of the signature given, and of the wording it was given against.
  signature_ref    text,
  signature_sha256 text,
  signature_placement jsonb not null default '{"x":4,"y":18}'::jsonb,
  body_sha256      text,
  signed_ip        text,
  signed_agent     text,
  /** When the sender opened the outcome, so the inbox can stop chasing them. */
  seen_at          timestamptz,
  created_at       timestamptz not null default now()
);
alter table document_routes add column if not exists signature_placement jsonb not null default '{"x":4,"y":18}'::jsonb;
create index if not exists document_routes_recipient_idx on document_routes (recipient_id, status, created_at desc);
create index if not exists document_routes_sender_idx on document_routes (sender_id, created_at desc);
create index if not exists document_routes_memo_idx on document_routes (memo_id, created_at desc);

-- ===========================================================================
-- Service desk: department queues
--
-- Support walked to the IT desk because a request had to be aimed at a person
-- and they did not know which person. A request can now be raised against a
-- department instead, and whoever is free claims it.
-- ===========================================================================
alter table workflow_requests alter column assignee_id drop not null;
alter table workflow_requests add column if not exists department_id integer references departments(id) on delete set null;
alter table workflow_requests add column if not exists claimed_at timestamptz;
alter table workflow_requests add column if not exists decided_by integer references users(id) on delete set null;
alter table workflow_requests add column if not exists resolution text;
/** Who the work is ultimately for — the customer the support desk is holding on the line. */
alter table workflow_requests add column if not exists on_behalf_of text;

-- A request must be aimed somewhere: at a person, at a department, or at both.
alter table workflow_requests
  drop constraint if exists workflow_requests_target_ck,
  add constraint workflow_requests_target_ck
    check (assignee_id is not null or department_id is not null);

create index if not exists workflow_requests_queue_idx
  on workflow_requests (department_id, status) where assignee_id is null;

-- ===========================================================================
-- Inbox
--
-- Notifications grew the fields the inbox needs to offer something other than
-- a link: what kind of thing happened, what it was about, and a file to hand
-- straight over without making the reader open the page first.
-- ===========================================================================
alter table notifications add column if not exists kind text not null default 'general';
alter table notifications add column if not exists entity text;
alter table notifications add column if not exists entity_id text;
alter table notifications add column if not exists attachment_id integer references attachments(id) on delete set null;
alter table notifications add column if not exists action_label text;
/** When the matching email went out, so a resend can tell what was already sent. */
alter table notifications add column if not exists emailed_at timestamptz;
