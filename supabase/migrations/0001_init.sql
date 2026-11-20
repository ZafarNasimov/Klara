-- Klara data model (SPEC.md §4) plus the agent's working columns.
-- Run once in the Supabase SQL editor (or `supabase db push`), then `npm run seed`.

create extension if not exists pgcrypto;

create table company (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  logo_url text,
  address text not null default ''
);

create table app_user (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role text not null check (role in ('polier','bauleiter','buero','gf')),
  language text not null default 'de',
  email text
);

create table project (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references company(id) on delete cascade,
  name text not null,
  address text not null default '',
  lat double precision not null,
  lng double precision not null,
  contract_type text not null check (contract_type in ('VOB_B','BGB')),
  contract_no text not null,
  contract_date date not null,
  settings jsonb not null default '{}'::jsonb   -- fiktive_abnahme_excluded, holiday_region, demo_clock_offset_ms, vad, hourly_rates …
);

create table contact (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references project(id) on delete cascade,
  name text not null,
  organisation text not null,
  role text not null check (role in ('bauherr','architekt','nu','intern')),
  email text not null,
  has_authority boolean not null default false,
  address text
);

create table team (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references project(id) on delete cascade,
  name text not null,
  lead_user_id uuid references app_user(id) on delete set null
);

create table trade (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references project(id) on delete cascade,
  name text not null,
  contracted_by text not null check (contracted_by in ('client','us')),
  contact_id uuid references contact(id) on delete set null,
  team_id uuid references team(id) on delete set null
);

create table schedule_item (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references project(id) on delete cascade,
  trade_id uuid not null references trade(id) on delete cascade,
  activity text not null,
  area text not null,
  start_date date not null,
  end_date date not null,
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
  team_id uuid not null references team(id) on delete cascade,
  user_id uuid not null references app_user(id) on delete cascade,
  kind text not null check (kind in ('call','chat','meeting')),
  language text,
  status text not null default 'open' check (status in ('open','closed')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  state jsonb not null default '{"pending_case_ids": []}'::jsonb
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
  team_id uuid references team(id) on delete set null,
  conversation_id uuid references conversation(id) on delete set null,
  doc_type text not null,
  status text not null default 'entwurf'
    check (status in ('entwurf','unvollstaendig','bereit','validiert','versendet','beantwortet','abgeschlossen')),
  sphere text check (sphere in ('client','own_sub','own_team','weather','unclear')),
  facts jsonb not null default '{}'::jsonb,
  missing_fields text[] not null default '{}',
  checks jsonb not null default '[]'::jsonb,
  deadline_at timestamptz,
  deadline_rule text,
  parent_case_id uuid references "case"(id) on delete set null,
  reference text not null unique,            -- e.g. KL-2026-0042
  created_by uuid references app_user(id) on delete set null,
  asked_fields text[] not null default '{}',
  declined_fields text[] not null default '{}',
  flags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index case_project_idx on "case"(project_id, created_at desc);

create table document_version (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references "case"(id) on delete cascade,
  version int not null,
  body jsonb not null,
  body_md text not null,
  pdf_url text,
  docx_url text,
  sha256 text,
  addressee_contact_id uuid references contact(id) on delete set null,
  tone text,
  created_at timestamptz not null default now(),
  validated_by uuid references app_user(id) on delete set null,
  validated_at timestamptz,
  sent_at timestamptz,
  delivery_status text,
  immutable boolean not null default false,
  unique (case_id, version)
);

-- Sent documents are immutable (SPEC hard rule). The update that sends a
-- version sets immutable = true; every later update is rejected, except the
-- delivery status reported by the mail provider.
create or replace function document_version_guard() returns trigger as $$
begin
  if old.immutable then
    if (new.body, new.body_md, new.sha256, new.version, new.case_id, new.sent_at, new.validated_at, new.validated_by)
       is distinct from
       (old.body, old.body_md, old.sha256, old.version, old.case_id, old.sent_at, old.validated_at, old.validated_by)
       or new.immutable = false then
      raise exception 'document_version % is immutable (already sent)', old.id;
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger document_version_immutable
  before update on document_version
  for each row execute function document_version_guard();
-- Deletes happen only through "Demo zurücksetzen", which wipes the whole demo.

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
  document_version_id uuid references document_version(id) on delete set null,
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
  case_id uuid references "case"(id) on delete set null,
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
  missing_fields text[] not null default '{}',
  unique (team_id, date)
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

-- Timeline / audit log. Also the realtime signal for the admin panel.
create table event (
  id uuid primary key default gen_random_uuid(),
  case_id uuid references "case"(id) on delete cascade,
  project_id uuid not null references project(id) on delete cascade,
  kind text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index event_project_idx on event(project_id, created_at desc);
create index event_case_idx on event(case_id, created_at);

-- Row level security: the server uses the service role key (bypasses RLS).
-- The browser only listens to new `event` rows through Supabase Realtime.
alter table company enable row level security;
alter table app_user enable row level security;
alter table project enable row level security;
alter table contact enable row level security;
alter table team enable row level security;
alter table trade enable row level security;
alter table schedule_item enable row level security;
alter table progress_entry enable row level security;
alter table conversation enable row level security;
alter table turn enable row level security;
alter table "case" enable row level security;
alter table document_version enable row level security;
alter table evidence enable row level security;
alter table email_out enable row level security;
alter table email_in enable row level security;
alter table daily_report enable row level security;
alter table meeting enable row level security;
alter table event enable row level security;

create policy "realtime listeners read events" on event for select to anon, authenticated using (true);

alter publication supabase_realtime add table event;

-- Storage for audio, PDFs and photos.
insert into storage.buckets (id, name, public) values ('klara', 'klara', false)
  on conflict (id) do nothing;
