-- Fuel: household nutrition tracker schema.
--
-- There is no sign-in: each device picks a profile (Jez, Levi, Owen…) and the
-- app server talks to Postgres directly. Every table has RLS enabled with NO
-- policies and no grants for the Supabase API roles, so the public Supabase
-- REST/anon key can read or write nothing. Only the app's server connection
-- (the database owner via DATABASE_URL) has access.

create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type sex as enum ('male', 'female');
create type activity_level as enum ('sedentary', 'light', 'moderate', 'very', 'extra');
create type goal_type as enum ('cut', 'maintain', 'recomp', 'bulk');
create type energy_unit as enum ('kj', 'kcal');
create type meal_slot as enum ('breakfast', 'lunch', 'dinner', 'snack', 'pre_workout', 'post_workout');
create type food_source as enum ('off', 'afcd', 'usda');
create type log_kind as enum ('reference', 'custom', 'recipe', 'quick');
create type workout_type as enum ('soccer', 'run', 'long_run', 'gym', 'rest');
create type workout_intensity as enum ('easy', 'moderate', 'hard');
create type workout_source as enum ('manual', 'calendar', 'healthkit');
create type day_type as enum ('training', 'rest');

-- ---------------------------------------------------------------------------
-- Profiles (one per person in the household)
-- ---------------------------------------------------------------------------
create table profiles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(trim(name)) between 1 and 40),
  sex sex,
  birth_date date,
  height_cm numeric(5, 1) check (height_cm is null or height_cm between 50 and 272),
  activity_level activity_level not null default 'moderate',
  goal goal_type not null default 'maintain',
  energy_unit energy_unit not null default 'kj',
  training_days_per_week integer not null default 4 check (training_days_per_week between 0 and 7),
  ai_enabled boolean not null default false,
  calendar_ics_url text,
  calendar_keywords text not null default 'soccer, training, run, long run, gym',
  calendar_synced_at timestamptz,
  remind_log_time time,
  remind_workouts boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into profiles (name) values ('Jez'), ('Levi'), ('Owen');

-- ---------------------------------------------------------------------------
-- Reference foods: cache of public data (Open Food Facts, AFCD, USDA).
-- Nutrients per 100 g (or 100 mL). Null = no data, never zero.
-- ---------------------------------------------------------------------------
create table reference_foods (
  id uuid primary key default gen_random_uuid(),
  source food_source not null,
  source_id text not null,
  barcode text,
  name text not null,
  brand text,
  serve_size_g numeric(8, 2),
  serve_label text,
  energy_kj numeric(10, 2),
  protein_g numeric(10, 3),
  fat_g numeric(10, 3),
  sat_fat_g numeric(10, 3),
  carbs_g numeric(10, 3),
  sugars_g numeric(10, 3),
  fibre_g numeric(10, 3),
  sodium_mg numeric(10, 3),
  potassium_mg numeric(10, 3),
  calcium_mg numeric(10, 3),
  iron_mg numeric(10, 3),
  magnesium_mg numeric(10, 3),
  zinc_mg numeric(10, 3),
  vit_a_ug numeric(10, 3),
  vit_c_mg numeric(10, 3),
  vit_d_ug numeric(10, 3),
  vit_e_mg numeric(10, 3),
  vit_b12_ug numeric(10, 3),
  folate_ug numeric(10, 3),
  water_ml numeric(10, 3),
  fetched_at timestamptz not null default now(),
  unique (source, source_id)
);
create index reference_foods_barcode_idx on reference_foods (barcode) where barcode is not null;
create index reference_foods_name_trgm_idx on reference_foods using gin (name gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- Custom foods (created by a profile, searchable by the whole household)
-- ---------------------------------------------------------------------------
create table custom_foods (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles (id) on delete set null,
  barcode text,
  name text not null,
  brand text,
  serve_size_g numeric(8, 2),
  serve_label text,
  energy_kj numeric(10, 2),
  protein_g numeric(10, 3),
  fat_g numeric(10, 3),
  sat_fat_g numeric(10, 3),
  carbs_g numeric(10, 3),
  sugars_g numeric(10, 3),
  fibre_g numeric(10, 3),
  sodium_mg numeric(10, 3),
  potassium_mg numeric(10, 3),
  calcium_mg numeric(10, 3),
  iron_mg numeric(10, 3),
  magnesium_mg numeric(10, 3),
  zinc_mg numeric(10, 3),
  vit_a_ug numeric(10, 3),
  vit_c_mg numeric(10, 3),
  vit_d_ug numeric(10, 3),
  vit_e_mg numeric(10, 3),
  vit_b12_ug numeric(10, 3),
  folate_ug numeric(10, 3),
  water_ml numeric(10, 3),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index custom_foods_barcode_idx on custom_foods (barcode) where barcode is not null;
create index custom_foods_name_trgm_idx on custom_foods using gin (name gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- Recipes (household-wide). ingredients: [{ kind, food_id, name, grams, nutrients }]
-- `nutrients` is the total for the whole recipe; per serve = total / servings.
-- ---------------------------------------------------------------------------
create table recipes (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles (id) on delete set null,
  name text not null,
  ingredients jsonb not null default '[]'::jsonb check (jsonb_typeof(ingredients) = 'array'),
  servings numeric(6, 2) not null default 1 check (servings > 0),
  total_grams numeric(9, 1) not null check (total_grams > 0),
  nutrients jsonb not null default '{}'::jsonb check (jsonb_typeof(nutrients) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index recipes_name_trgm_idx on recipes using gin (name gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- Saved meals (per profile). items: [{ kind, food_id, name, grams, nutrients }]
-- ---------------------------------------------------------------------------
create table meals_saved (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles (id) on delete cascade,
  name text not null,
  items jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array'),
  created_at timestamptz not null default now()
);
create index meals_saved_profile_idx on meals_saved (profile_id);

-- ---------------------------------------------------------------------------
-- Log entries. `nutrients` is a snapshot of the totals for the amount eaten,
-- so history is stable if a food is edited later. Absent keys = no data.
-- ---------------------------------------------------------------------------
create table log_entries (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles (id) on delete cascade,
  date date not null,
  time time not null default localtime,
  slot meal_slot not null,
  kind log_kind not null,
  reference_food_id uuid references reference_foods (id) on delete set null,
  custom_food_id uuid references custom_foods (id) on delete set null,
  recipe_id uuid references recipes (id) on delete set null,
  name text not null,
  grams numeric(8, 2) check (grams is null or grams > 0),
  nutrients jsonb not null default '{}'::jsonb check (jsonb_typeof(nutrients) = 'object'),
  created_at timestamptz not null default now(),
  check (kind = 'quick' or grams is not null)
);
create index log_entries_profile_date_idx on log_entries (profile_id, date);

-- ---------------------------------------------------------------------------
-- Weights, workouts, goals, day types, water
-- ---------------------------------------------------------------------------
create table weights (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles (id) on delete cascade,
  date date not null,
  kg numeric(5, 2) not null check (kg between 20 and 400),
  created_at timestamptz not null default now(),
  unique (profile_id, date)
);

create table workouts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles (id) on delete cascade,
  date date not null,
  start_time time,
  duration_min integer check (duration_min is null or duration_min between 0 and 1440),
  type workout_type not null,
  intensity workout_intensity not null default 'moderate',
  is_race boolean not null default false,
  completed boolean not null default false,
  title text,
  source workout_source not null default 'manual',
  external_id text,
  created_at timestamptz not null default now(),
  unique (profile_id, external_id)
);
create index workouts_profile_date_idx on workouts (profile_id, date);

create table goals (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles (id) on delete cascade,
  effective_date date not null,
  training_kj numeric(8, 0) not null check (training_kj > 0),
  training_protein_g numeric(6, 1) not null check (training_protein_g >= 0),
  training_carbs_g numeric(6, 1) not null check (training_carbs_g >= 0),
  training_fat_g numeric(6, 1) not null check (training_fat_g >= 0),
  training_fibre_g numeric(6, 1) not null check (training_fibre_g >= 0),
  rest_kj numeric(8, 0) not null check (rest_kj > 0),
  rest_protein_g numeric(6, 1) not null check (rest_protein_g >= 0),
  rest_carbs_g numeric(6, 1) not null check (rest_carbs_g >= 0),
  rest_fat_g numeric(6, 1) not null check (rest_fat_g >= 0),
  rest_fibre_g numeric(6, 1) not null check (rest_fibre_g >= 0),
  created_at timestamptz not null default now(),
  unique (profile_id, effective_date)
);

-- Manual override of the automatic training/rest day classification.
create table day_types (
  profile_id uuid not null references profiles (id) on delete cascade,
  date date not null,
  type day_type not null,
  primary key (profile_id, date)
);

create table water_logs (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles (id) on delete cascade,
  date date not null,
  ml integer not null check (ml between -5000 and 5000),
  created_at timestamptz not null default now()
);
create index water_logs_profile_date_idx on water_logs (profile_id, date);

create table grocery_items (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles (id) on delete cascade,
  name text not null,
  reason text,
  checked boolean not null default false,
  created_at timestamptz not null default now(),
  unique (profile_id, name)
);

create table push_subscriptions (
  endpoint text primary key,
  profile_id uuid not null references profiles (id) on delete cascade,
  keys jsonb not null,
  created_at timestamptz not null default now()
);

-- Dedupe so a reminder is sent at most once per profile per kind per day/workout.
create table reminders_sent (
  profile_id uuid not null references profiles (id) on delete cascade,
  key text not null,
  sent_at timestamptz not null default now(),
  primary key (profile_id, key)
);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
create function touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch before update on profiles for each row execute function touch_updated_at();
create trigger custom_foods_touch before update on custom_foods for each row execute function touch_updated_at();
create trigger recipes_touch before update on recipes for each row execute function touch_updated_at();

-- ---------------------------------------------------------------------------
-- Lock out the Supabase API roles entirely (when they exist).
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
  r text;
begin
  for t in select tablename from pg_tables where schemaname = current_schema() loop
    execute format('alter table %I enable row level security', t);
  end loop;
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on all tables in schema %I from %I', current_schema(), r);
      execute format('revoke all on all functions in schema %I from %I', current_schema(), r);
      execute format('alter default privileges in schema %I revoke all on tables from %I', current_schema(), r);
      execute format('alter default privileges in schema %I revoke all on functions from %I', current_schema(), r);
    end if;
  end loop;
end;
$$;
