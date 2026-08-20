-- =============================================================================
--  MyOS · Migracion v10 — Lienzo dentro de los sprints
-- =============================================================================
--  Ejecutalo despues de la v9. Es idempotente.
--
--  Que anade: que las tarjetas de notas puedan colgar tambien de un sprint,
--  no solo de objetivos, viajes y proyectos.
-- =============================================================================

alter table public.canvas_blocks drop constraint if exists canvas_blocks_parent_type_check;
alter table public.canvas_blocks
  add constraint canvas_blocks_parent_type_check
  check (parent_type in ('goal', 'trip', 'project', 'sprint'));
