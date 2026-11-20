-- Klara schema (SPEC.md §4). No auth for the hackathon: the app talks to
-- Postgres only from the server with the service-role key.
create extension if not exists "pgcrypto";

create table company (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  logo_url text,
  address text not null default ''
);

create table project (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references company(id) on delete cascade,
  name text not null,
  address text not null default '',
  lat double precision,
  lng double precision,
  contract_type text not null check (contract_type in ('VOB_B','BGB')),
  contract_no text,
  contract_date date,
  settings jsonb not null default '{}'::jsonb
);

create table app_user (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role text not null check (role in ('polier','bauleiter','buero','gf')),
  language text not null default 'de',
  email text
);

create table team (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references project(id) on delete cascade,
  name text not null,
  lead_user_id uuid references app_user(id)
);

create table contact (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references project(id) on delete cascade,
  name text not null,
  organisation text not null default '',
  role text not null check (role in ('bauherr','architekt','nu','intern')),
  email text,
  has_authority boolean not null default false,
  address text
);

create table trade (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references project(id) on delete cascade,
  name text not null,
  contracted_by text not null check (contracted_by in ('client','us')),
  contact_id uuid references contact(id),
  team_id uuid references team(id)
);

create table schedule_item (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references project(id) on delete cascade,
  trade_id uuid references trade(id),
  activity text not null,
  area text,
  start_date date,
  end_date date,
  planned_qty numeric,
  unit text,
  planned_per_day numeric,
  depends_on uuid[] not null default '{}'
);

create table progress_entry (
  id uuid primary key default gen_random_uuid(),
  schedule_item_id uuid not null references schedule_item(id) on delete cascade,
  date date not null,
  actual_qty numeric not null,
  note text
);

create table conversation (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references team(id),
  user_id uuid references app_user(id),
  kind text not null check (kind in ('call','chat','meeting')),
  language text,
  status text not null default 'open',
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  state jsonb not null default '{}'::jsonb
);

create table turn (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversation(id) on delete cascade,
  role text not null check (role in ('user','klara')),
  text_original text not null,
  text_de text,
  language text,
  audio_url text,
  created_at timestamptz not null default now()
);

create table "case" (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references project(id) on delete cascade,
  team_id uuid references team(id),
  conversation_id uuid references conversation(id),
  doc_type text not null,
  status text not null default 'entwurf'
    check (status in ('entwurf','unvollstaendig','bereit','validiert','versendet','beantwortet','abgeschlossen')),
  sphere text,
  facts jsonb not null default '{}'::jsonb,
  missing_fields text[] not null default '{}',
  checks jsonb not null default '[]'::jsonb,
  deadline_at timestamptz,
  deadline_rule text,
  parent_case_id uuid references "case"(id),
  reference text not null unique,
  created_by uuid references app_user(id),
  questions_asked int not null default 0,
  flags text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table document_version (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references "case"(id) on delete cascade,
  version int not null,
  body jsonb,
  body_md text,
  pdf_url text,
  docx_url text,
  sha256 text,
  addressee_contact_id uuid references contact(id),
  tone text,
  created_at timestamptz not null default now(),
  validated_by uuid references app_user(id),
  validated_at timestamptz,
  sent_at timestamptz,
  delivery_status text,
  immutable boolean not null default false,
  unique (case_id, version)
);

-- Sent documents are immutable (SPEC hard rule).
create or replace function forbid_immutable_update() returns trigger as $$
begin
  if old.immutable then
    if new.body is distinct from old.body or new.body_md is distinct from old.body_md
       or new.sha256 is distinct from old.sha256 or new.pdf_url is distinct from old.pdf_url
       or new.docx_url is distinct from old.docx_url then
      raise exception 'document_version % is immutable', old.id;
    end if;
  end if;
  return new;
end $$ language plpgsql;

create trigger document_version_immutable
  before update on document_version
  for each row execute function forbid_immutable_update();

create table evidence (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references "case"(id) on delete cascade,
  kind text not null check (kind in ('photo','weather','transcript','diary','email','meeting')),
  ref text,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table email_out (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references "case"(id) on delete cascade,
  document_version_id uuid references document_version(id),
  "to" text[] not null default '{}',
  cc text[] not null default '{}',
  subject text not null,
  body text not null,
  message_id text,
  sent_at timestamptz,
  status text not null default 'entwurf'
);

create table email_in (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references project(id) on delete cascade,
  case_id uuid references "case"(id),
  from_addr text not null,
  subject text not null default '',
  body_text text not null default '',
  in_reply_to text,
  message_id text,
  received_at timestamptz not null default now(),
  classification jsonb,
  raw jsonb
);

create table daily_report (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references team(id) on delete cascade,
  date date not null,
  data jsonb not null default '{}'::jsonb,
  status text not null default 'entwurf',
  missing_fields text[] not null default '{}'
);

create table meeting (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references project(id) on delete cascade,
  type text not null,
  audio_url text,
  transcript jsonb,
  protocol jsonb,
  created_at timestamptz not null default now()
);

create table event (
  id uuid primary key default gen_random_uuid(),
  case_id uuid references "case"(id) on delete cascade,
  project_id uuid not null references project(id) on delete cascade,
  kind text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index on "case"(project_id, created_at desc);
create index on event(project_id, created_at desc);
create index on turn(conversation_id, created_at);

-- Admin live updates (SPEC §3): the browser subscribes to inserts on event.
alter publication supabase_realtime add table event;
alter table event enable row level security;
create policy "event read for realtime" on event for select using (true);

-- Storage bucket for PDFs, DOCX, audio and photos.
insert into storage.buckets (id, name, public) values ('klara', 'klara', false)
  on conflict (id) do nothing;

-- Every other table is server-only: RLS on, no policies (service role bypasses RLS).
do $$
declare t text;
begin
  foreach t in array array['company','project','app_user','team','contact','trade','schedule_item',
    'progress_entry','conversation','turn','case','document_version','evidence','email_out',
    'email_in','daily_report','meeting']
  loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;
