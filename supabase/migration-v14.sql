-- =============================================================================
--  MyOS · Migracion v14 — PDF adjunto a cada factura
-- =============================================================================
--  Ejecutalo despues de la v13. Es idempotente.
--
--  Que anade:
--   · invoice_files: el PDF de una factura (el que enviaste, o una factura que
--     hiciste fuera de MyOS). Uno por factura. Va en su propia tabla para que
--     el listado de facturas no arrastre los bytes.
-- =============================================================================

create table if not exists public.invoice_files (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  invoice_id  uuid not null unique references public.invoices (id) on delete cascade,
  name        text not null,
  mime        text not null default 'application/pdf',
  size        int not null default 0,
  content     bytea not null,
  created_at  timestamptz not null default now()
);
create index if not exists invoice_files_user_idx on public.invoice_files (user_id);

alter table public.invoice_files enable row level security;
drop policy if exists "own_rows" on public.invoice_files;
create policy "own_rows" on public.invoice_files
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
