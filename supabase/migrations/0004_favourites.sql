-- Starred foods per profile (shown first when logging).
create table favourite_foods (
  profile_id uuid not null references profiles (id) on delete cascade,
  kind log_kind not null check (kind <> 'quick'),
  food_id uuid not null,
  name text not null,
  created_at timestamptz not null default now(),
  primary key (profile_id, kind, food_id)
);

alter table favourite_foods enable row level security;
do $$
declare
  r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on favourite_foods from %I', r);
    end if;
  end loop;
end;
$$;
