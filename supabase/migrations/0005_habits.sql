-- Habits: a separate section of the app with its own tables.
-- Data flows one way: the habits section may read nutrition tables, but nothing in the nutrition side reads these.
-- Every row belongs to one profile and is removed with it.

create type habit_time as enum ('morning', 'anytime', 'evening');
create type habit_kind as enum ('build', 'break');
create type habit_schedule as enum ('daily', 'weekdays', 'per_week');
create type habit_status as enum ('done', 'skipped', 'slip');
create type habit_auto as enum ('water_goal', 'protein_target', 'all_meals', 'trained');

-- Routines chain habits together (brush teeth → wash face → skincare).
create table habit_routines (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 40),
  time_of_day habit_time not null default 'anytime',
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create index habit_routines_profile_idx on habit_routines (profile_id);

create table habits (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 60),
  icon text not null default 'check',
  color text not null default 'indigo',
  kind habit_kind not null default 'build',
  -- Yes/no habits have target 1; count habits (glasses of water) have a larger target and a unit.
  target integer not null default 1 check (target between 1 and 100),
  unit text check (unit is null or length(unit) <= 20),
  time_of_day habit_time not null default 'anytime',
  schedule habit_schedule not null default 'daily',
  -- Bit 0 = Monday … bit 6 = Sunday. Used when schedule = 'weekdays'.
  weekdays smallint not null default 127 check (weekdays between 1 and 127),
  -- Used when schedule = 'per_week'.
  per_week smallint not null default 3 check (per_week between 1 and 7),
  start_date date not null default current_date,
  end_date date check (end_date is null or end_date >= start_date),
  reminder_time time,
  auto_source habit_auto,
  routine_id uuid references habit_routines (id) on delete set null,
  routine_position integer not null default 0,
  position integer not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);
create index habits_profile_idx on habits (profile_id);

-- One row per habit per day that has something recorded. No row = nothing done (or auto-completed from nutrition).
create table habit_entries (
  habit_id uuid not null references habits (id) on delete cascade,
  profile_id uuid not null references profiles (id) on delete cascade,
  date date not null,
  count integer not null default 0 check (count between 0 and 1000),
  status habit_status not null,
  updated_at timestamptz not null default now(),
  primary key (habit_id, date)
);
create index habit_entries_profile_date_idx on habit_entries (profile_id, date);

-- An optional one-line note and mood for the day.
create table habit_days (
  profile_id uuid not null references profiles (id) on delete cascade,
  date date not null,
  note text check (note is null or length(note) <= 140),
  mood smallint check (mood is null or mood between 1 and 5),
  primary key (profile_id, date)
);

-- Vacation mode: pauses every habit and freezes streaks and scores. end_date null = still away.
create table habit_pauses (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles (id) on delete cascade,
  start_date date not null,
  end_date date check (end_date is null or end_date >= start_date)
);
create index habit_pauses_profile_idx on habit_pauses (profile_id);

create table habit_prefs (
  profile_id uuid primary key references profiles (id) on delete cascade,
  -- Evening nudge for habits still unticked. Null = off.
  nudge_time time,
  weekly_review boolean not null default true
);

-- Milestones already celebrated, so a celebration plays once.
create table habit_milestones (
  habit_id uuid not null references habits (id) on delete cascade,
  days integer not null,
  reached_on date not null,
  primary key (habit_id, days)
);

alter table habit_routines enable row level security;
alter table habits enable row level security;
alter table habit_entries enable row level security;
alter table habit_days enable row level security;
alter table habit_pauses enable row level security;
alter table habit_prefs enable row level security;
alter table habit_milestones enable row level security;
do $$
declare
  r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format(
        'revoke all on habit_routines, habits, habit_entries, habit_days, habit_pauses, habit_prefs, habit_milestones from %I',
        r
      );
    end if;
  end loop;
end;
$$;
