-- Apple Health sync through an iPhone Shortcut.
-- Each profile gets a sync key (only its SHA-256 hash is stored). The shortcut sends weight, active energy and
-- workouts in, and writes logged food and water out to Health; we remember what has been sent so nothing is
-- written twice.

alter table profiles add column health_key_hash text unique;
alter table profiles add column health_synced_at timestamptz;

alter table log_entries add column health_exported_at timestamptz;
create index log_entries_health_pending_idx on log_entries (profile_id, date) where health_exported_at is null;

-- Water already written to Health, per day (water logs can be negative corrections, so we send the increase only).
create table health_water_exports (
  profile_id uuid not null references profiles (id) on delete cascade,
  date date not null,
  ml integer not null default 0,
  primary key (profile_id, date)
);

-- Active energy burned, per day, from Apple Health.
create table activity_days (
  profile_id uuid not null references profiles (id) on delete cascade,
  date date not null,
  active_kj integer not null check (active_kj between 0 and 100000),
  updated_at timestamptz not null default now(),
  primary key (profile_id, date)
);

alter table health_water_exports enable row level security;
alter table activity_days enable row level security;
do $$
declare
  r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on health_water_exports, activity_days from %I', r);
    end if;
  end loop;
end;
$$;
