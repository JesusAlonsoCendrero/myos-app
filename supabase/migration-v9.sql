-- =============================================================================
--  MyOS · Migracion v9 — Sprints
-- =============================================================================
--  Ejecutalo despues de las migraciones v2 a v8. Es idempotente.
--
--  Que anade: bloques de tiempo con fecha de inicio y fin donde metes tareas,
--  proyectos e ideas para saber que toca hacer en ese periodo.
-- =============================================================================

create table if not exists public.sprints (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users on delete cascade,
  name       text not null,
  -- El proposito del sprint en una frase: que quieres haber logrado al cerrarlo.
  goal       text,
  start_date date not null,
  end_date   date not null,
  status     text not null default 'planificado'
             check (status in ('planificado', 'activo', 'cerrado')),
  emoji      text not null default 'Sprint',
  color      text,
  notes      text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  closed_at  timestamptz,
  -- La vuelta no puede ser antes que la ida.
  constraint sprints_fechas_check check (end_date >= start_date)
);

create index if not exists sprints_user_idx  on public.sprints (user_id, start_date desc);
create index if not exists sprints_estado_idx on public.sprints (user_id, status);

-- Que cuelga de cada sprint. Todo opcional: un sprint puede tener solo tareas.
alter table public.tasks    add column if not exists sprint_id uuid references public.sprints on delete set null;
alter table public.projects add column if not exists sprint_id uuid references public.sprints on delete set null;
alter table public.ideas    add column if not exists sprint_id uuid references public.sprints on delete set null;

create index if not exists tasks_sprint_idx    on public.tasks (sprint_id);
create index if not exists projects_sprint_idx on public.projects (sprint_id);
create index if not exists ideas_sprint_idx    on public.ideas (sprint_id);

alter table public.sprints enable row level security;
drop policy if exists "own_rows" on public.sprints;
create policy "own_rows" on public.sprints
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
