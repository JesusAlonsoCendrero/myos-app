-- =============================================================================
--  MyOS · Migracion v4 — Proyectos en Mi dia
-- =============================================================================
--  Ejecutalo despues de schema.sql, migration-v2.sql y migration-v3.sql.
--  Es idempotente.
--
--  Que anade: poder poner un proyecto entero en Mi dia, no solo tareas suyas.
-- =============================================================================

alter table public.projects add column if not exists my_day_date date;

create index if not exists projects_my_day_idx on public.projects (user_id, my_day_date);
