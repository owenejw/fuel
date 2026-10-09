-- Nutrition tracker: initial schema
-- Every user-owned table has RLS enabled with select/insert/update/delete
-- restricted to auth.uid() = user_id. Shared public-source data lives in
-- reference_foods, which has no user columns and is writable only by the
-- service role (server routes / seed script).

create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.sex as enum ('male', 'female');
create type public.activity_level as enum ('sedentary', 'light', 'moderate', 'very', 'extra');
create type public.goal_type as enum ('cut', 'maintain', 'recomp', 'bulk');
create type public.energy_unit as enum ('kj', 'kcal');
create type public.meal_slot as enum ('breakfast', 'lunch', 'dinner', 'snack', 'pre_workout', 'post_workout');
create type public.food_source as enum ('off', 'afcd', 'usda');
create type public.log_kind as enum ('reference', 'custom', 'recipe', 'quick');
create type public.workout_type as enum ('soccer', 'run', 'long_run', 'gym', 'rest');
create type public.workout_intensity as enum ('easy', 'moderate', 'hard');
create type public.workout_source as enum ('manual', 'calendar', 'healthkit');

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  name text not null default '',
  sex public.sex,
  birth_date date,
  height_cm numeric(5, 1) check (height_cm is null or height_cm between 50 and 272),
  activity_level public.activity_level not null default 'moderate',
  goal public.goal_type not null default 'maintain',
  energy_unit public.energy_unit not null default 'kj',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Invites (service role only: RLS enabled with no policies)
-- ---------------------------------------------------------------------------
create table public.invites (
  code text primary key,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  used_at timestamptz,
  -- set while an account is being created for this code; cleared on failure
  claimed_at timestamptz,
  used_by uuid references auth.users (id) on delete set null
);

-- ---------------------------------------------------------------------------
-- Reference foods (shared cache of public data; NO user columns)
-- Nutrients are per 100 g (or per 100 mL for liquids, treated as g).
-- Every nutrient is nullable: null means "no data", never zero.
-- ---------------------------------------------------------------------------
create table public.reference_foods (
  id uuid primary key default gen_random_uuid(),
  source public.food_source not null,
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
create index reference_foods_barcode_idx on public.reference_foods (barcode) where barcode is not null;
create index reference_foods_name_trgm_idx on public.reference_foods using gin (name gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- Custom foods (private)
-- ---------------------------------------------------------------------------
create table public.custom_foods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
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
  updated_at timestamptz not null default now(),
  -- lets child tables enforce same-owner references with a composite FK
  unique (id, user_id)
);
create index custom_foods_user_idx on public.custom_foods (user_id);
create index custom_foods_user_barcode_idx on public.custom_foods (user_id, barcode) where barcode is not null;
create index custom_foods_name_trgm_idx on public.custom_foods using gin (name gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- Recipes (private). ingredients: [{ kind, food_id, grams, name }]
-- ---------------------------------------------------------------------------
create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  ingredients jsonb not null default '[]'::jsonb check (jsonb_typeof(ingredients) = 'array'),
  servings numeric(6, 2) not null default 1 check (servings > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);
create index recipes_user_idx on public.recipes (user_id);

-- ---------------------------------------------------------------------------
-- Saved meals (private). items: [{ kind, food_id, grams, name }]
-- ---------------------------------------------------------------------------
create table public.meals_saved (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  items jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array'),
  created_at timestamptz not null default now()
);
create index meals_saved_user_idx on public.meals_saved (user_id);

-- ---------------------------------------------------------------------------
-- Log entries (private)
-- `nutrients` is a snapshot of the nutrient totals for the amount eaten, so
-- history is stable if a food is later edited. Keys absent = no data.
-- ---------------------------------------------------------------------------
create table public.log_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date date not null,
  time time not null default (now() at time zone 'Australia/Sydney')::time,
  slot public.meal_slot not null,
  kind public.log_kind not null,
  reference_food_id uuid references public.reference_foods (id) on delete set null,
  custom_food_id uuid,
  recipe_id uuid,
  name text not null,
  grams numeric(8, 2) check (grams is null or grams > 0),
  nutrients jsonb not null default '{}'::jsonb check (jsonb_typeof(nutrients) = 'object'),
  created_at timestamptz not null default now(),
  -- a log entry can only point at the same user's custom food / recipe
  foreign key (custom_food_id, user_id) references public.custom_foods (id, user_id) on delete set null (custom_food_id),
  foreign key (recipe_id, user_id) references public.recipes (id, user_id) on delete set null (recipe_id),
  check (kind = 'quick' or grams is not null)
);
create index log_entries_user_date_idx on public.log_entries (user_id, date);

-- ---------------------------------------------------------------------------
-- Weights, workouts, goals, water (private)
-- ---------------------------------------------------------------------------
create table public.weights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date date not null,
  kg numeric(5, 2) not null check (kg between 20 and 400),
  created_at timestamptz not null default now(),
  unique (user_id, date)
);

create table public.workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date date not null,
  start_time time,
  duration_min integer check (duration_min is null or duration_min between 0 and 1440),
  type public.workout_type not null,
  intensity public.workout_intensity not null default 'moderate',
  is_race boolean not null default false,
  title text,
  source public.workout_source not null default 'manual',
  external_id text,
  created_at timestamptz not null default now()
);
create index workouts_user_date_idx on public.workouts (user_id, date);

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
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
  unique (user_id, effective_date)
);

create table public.water_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date date not null,
  ml integer not null check (ml between -5000 and 5000),
  created_at timestamptz not null default now()
);
create index water_logs_user_date_idx on public.water_logs (user_id, date);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
create function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
create trigger custom_foods_touch before update on public.custom_foods
  for each row execute function public.touch_updated_at();
create trigger recipes_touch before update on public.recipes
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.invites enable row level security;
alter table public.reference_foods enable row level security;
alter table public.custom_foods enable row level security;
alter table public.recipes enable row level security;
alter table public.meals_saved enable row level security;
alter table public.log_entries enable row level security;
alter table public.weights enable row level security;
alter table public.workouts enable row level security;
alter table public.goals enable row level security;
alter table public.water_logs enable row level security;

-- invites: no policies → only the service role can touch it.

-- reference_foods: any signed-in user may read; nobody but the service role writes.
create policy reference_foods_select on public.reference_foods
  for select to authenticated using (true);

-- Owner-only policies for every user-owned table.
do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'custom_foods', 'recipes', 'meals_saved', 'log_entries',
    'weights', 'workouts', 'goals', 'water_logs'
  ] loop
    execute format(
      'create policy %1$s_select on public.%1$I for select to authenticated using ((select auth.uid()) = user_id)', t);
    execute format(
      'create policy %1$s_insert on public.%1$I for insert to authenticated with check ((select auth.uid()) = user_id)', t);
    execute format(
      'create policy %1$s_update on public.%1$I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t);
    execute format(
      'create policy %1$s_delete on public.%1$I for delete to authenticated using ((select auth.uid()) = user_id)', t);
  end loop;
end;
$$;

-- Anonymous visitors get nothing at all.
revoke all on all tables in schema public from anon;

-- ---------------------------------------------------------------------------
-- Search helper (security invoker: obeys RLS of the caller)
-- ---------------------------------------------------------------------------
create function public.search_reference_foods(q text, max_results integer default 25)
returns setof public.reference_foods
language sql stable security invoker set search_path = public, extensions as $$
  select r.*
  from public.reference_foods r
  where (
    select bool_and(r.name ilike '%' || w || '%' or coalesce(r.brand, '') ilike '%' || w || '%')
    from unnest(regexp_split_to_array(trim(q), '\s+')) as w
    where w <> ''
  )
  order by
    (r.source = 'afcd') desc,
    similarity(r.name, q) desc,
    length(r.name)
  limit least(greatest(max_results, 1), 50);
$$;

create function public.search_custom_foods(q text, max_results integer default 25)
returns setof public.custom_foods
language sql stable security invoker set search_path = public, extensions as $$
  select c.*
  from public.custom_foods c
  where c.user_id = (select auth.uid())
    and (
      select bool_and(c.name ilike '%' || w || '%' or coalesce(c.brand, '') ilike '%' || w || '%')
      from unnest(regexp_split_to_array(trim(q), '\s+')) as w
      where w <> ''
    )
  order by similarity(c.name, q) desc, length(c.name)
  limit least(greatest(max_results, 1), 50);
$$;

revoke execute on function public.search_reference_foods(text, integer) from anon, public;
revoke execute on function public.search_custom_foods(text, integer) from anon, public;
grant execute on function public.search_reference_foods(text, integer) to authenticated;
grant execute on function public.search_custom_foods(text, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Invite redemption (service role only)
-- Atomically claims an unused, unexpired code. A claim older than 10 minutes
-- (e.g. a crashed request) can be reclaimed.
-- ---------------------------------------------------------------------------
create function public.claim_invite(p_code text) returns boolean
language sql volatile security invoker set search_path = '' as $$
  with c as (
    update public.invites
       set claimed_at = now()
     where code = p_code
       and used_at is null
       and (expires_at is null or expires_at > now())
       and (claimed_at is null or claimed_at < now() - interval '10 minutes')
    returning 1
  )
  select exists (select 1 from c);
$$;

revoke execute on function public.claim_invite(text) from public, anon, authenticated;
grant execute on function public.claim_invite(text) to service_role;
