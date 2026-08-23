-- =============================================================================
--  MyOS · Migracion v11 — Calendario de publicaciones
-- =============================================================================
--  Ejecutalo despues de la v10. Es idempotente.
--
--  Que anade: la fecha en la que quieres publicar cada idea del banco. Con eso
--  el apartado Calendario puede pintar el mes y colocar ahi tus videos y tus
--  posts de LinkedIn.
--
--  publish_date es solo la intencion: la idea sigue viva en su frente del banco
--  hasta que la des por hecha.
-- =============================================================================

alter table public.ideas add column if not exists publish_date date;

create index if not exists ideas_publish_date_idx
  on public.ideas (user_id, publish_date)
  where publish_date is not null;
