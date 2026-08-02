-- =============================================================================
--  MyOS · Migracion v5 — Fuera el estado "Pausado"
-- =============================================================================
--  Ejecutalo despues de las migraciones v2, v3 y v4. Es idempotente.
-- =============================================================================

-- Lo que estuviera pausado vuelve a planificado: nada se pierde.
update public.projects set status = 'planificado' where status = 'pausado';

alter table public.projects drop constraint if exists projects_status_check;
alter table public.projects
  add constraint projects_status_check
  check (status in ('idea', 'planificado', 'activo', 'completado'));
