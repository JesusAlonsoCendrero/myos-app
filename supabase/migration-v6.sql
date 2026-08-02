-- =============================================================================
--  MyOS · Migracion v6 — Proyectos como objetivo de la semana
-- =============================================================================
--  Ejecutalo despues de las migraciones v2 a v5. Es idempotente.
--
--  Que anade: un objetivo puede apuntar a un proyecto ya registrado, en vez de
--  ser texto suelto. Asi el avance del proyecto y el del objetivo son el mismo.
-- =============================================================================

alter table public.weekly_goals add column if not exists project_id uuid
  references public.projects on delete set null;

create index if not exists weekly_goals_project_idx on public.weekly_goals (project_id);
