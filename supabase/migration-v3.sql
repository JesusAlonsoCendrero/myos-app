-- =============================================================================
--  MyOS · Migracion v3 — Gymbros
-- =============================================================================
--  Ejecutalo despues de schema.sql y migration-v2.sql. Es idempotente.
--
--  Que anade: la gente con la que entrenas. Al empezar una rutina eliges quien
--  viene, y cada serie queda registrada a nombre de quien la hizo.
-- =============================================================================

create table if not exists public.buddies (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users on delete cascade,
  name       text not null,
  emoji      text not null default '💪',
  color      text,
  notes      text,
  created_at timestamptz not null default now()
);

create index if not exists buddies_user_idx on public.buddies (user_id, name);

-- De quien es esta serie. NULL = tuya.
alter table public.workout_sets add column if not exists buddy_id uuid
  references public.buddies on delete cascade;

create index if not exists workout_sets_buddy_idx on public.workout_sets (workout_id, buddy_id);

alter table public.buddies enable row level security;
drop policy if exists "own_rows" on public.buddies;
create policy "own_rows" on public.buddies
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Si llegaste a crear la tabla de medidas de una version anterior, sobra.
drop table if exists public.buddy_measurements cascade;
