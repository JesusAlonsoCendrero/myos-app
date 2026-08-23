-- =============================================================================
--  MyOS · Migracion v12 — Documento dentro de cada proyecto e idea
-- =============================================================================
--  Ejecutalo despues de la v11. Es idempotente.
--
--  Que anade:
--   · projects.document e ideas.document: un texto largo y libre para escribir
--     lo que sea del proyecto (el planteamiento, las ideas, lo que aprendiste).
--     Es distinto del lienzo: el lienzo son tarjetas sueltas, esto es un
--     documento seguido.
--   · las tarjetas del lienzo pueden colgar tambien de una idea del banco.
-- =============================================================================

alter table public.projects add column if not exists document text;
alter table public.ideas add column if not exists document text;

alter table public.canvas_blocks drop constraint if exists canvas_blocks_parent_type_check;
alter table public.canvas_blocks
  add constraint canvas_blocks_parent_type_check
  check (parent_type in ('goal', 'trip', 'project', 'sprint', 'idea'));
