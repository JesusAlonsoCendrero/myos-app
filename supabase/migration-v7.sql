-- =============================================================================
--  MyOS · Migracion v7 — Banco de ideas
-- =============================================================================
--  Ejecutalo despues de las migraciones v2 a v6. Es idempotente.
--
--  Que anade: un almacen permanente de cosas que quieres hacer, con los mismos
--  cuatro frentes que los objetivos. Un video vive aqui aunque no toque esta
--  semana, puede apuntar a un proyecto, y cuando le llegue el turno se lleva a
--  los objetivos semanales.
-- =============================================================================

create table if not exists public.ideas (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users on delete cascade,
  title      text not null,
  notes      text,
  group_key  text not null default 'youtube'
             check (group_key in ('proyectos', 'youtube', 'linkedin', 'estudio')),
  tech       text,
  project_id uuid references public.projects on delete set null,
  status     text not null default 'idea'
             check (status in ('idea', 'en_curso', 'hecha')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  done_at    timestamptz
);

create index if not exists ideas_user_group_idx on public.ideas (user_id, group_key, status);
create index if not exists ideas_project_idx    on public.ideas (project_id);

-- De que idea del banco salio este objetivo, para cerrarla al cumplirlo.
alter table public.weekly_goals add column if not exists idea_id uuid
  references public.ideas on delete set null;

create index if not exists weekly_goals_idea_idx on public.weekly_goals (idea_id);

alter table public.ideas enable row level security;
drop policy if exists "own_rows" on public.ideas;
create policy "own_rows" on public.ideas
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
