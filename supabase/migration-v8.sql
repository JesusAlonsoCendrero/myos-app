-- =============================================================================
--  MyOS · Migracion v8 — Vídeos por ver
-- =============================================================================
--  Ejecutalo despues de las migraciones v2 a v7. Es idempotente.
--
--  Que anade: un quinto frente en el banco para guardar videos de YouTube que
--  quieres ver, con su miniatura. Ojo: el frente "youtube" es para los videos
--  que quieres GRABAR; este es para los que quieres VER.
-- =============================================================================

alter table public.ideas add column if not exists url text;
alter table public.ideas add column if not exists image_url text;
alter table public.ideas add column if not exists author text;

alter table public.ideas drop constraint if exists ideas_group_key_check;
alter table public.ideas
  add constraint ideas_group_key_check
  check (group_key in ('proyectos', 'youtube', 'linkedin', 'estudio', 'ver'));
