-- =============================================================================
--  MyOS · Migracion v13 — Facturas de autonomo
-- =============================================================================
--  Ejecutalo despues de la v12. Es idempotente.
--
--  Que anade:
--   · fiscal_profile: tus datos de emisor (NIF, direccion, IBAN, retencion e IVA
--     por defecto). Una sola fila por usuario.
--   · clients: las empresas a las que facturas.
--   · invoices: las facturas emitidas. Guardan una copia de los datos del
--     cliente y del emisor tal y como estaban al emitirla, para que cambiar una
--     direccion mañana no altere una factura ya enviada. Los importes se guardan
--     calculados para poder sumar trimestres sin rehacer cuentas.
--   · expenses: los gastos deducibles (cuota de autonomos, software, gestoria…)
--     para el modelo 130 y el IVA soportado del 303.
-- =============================================================================

-- ---------------------------------------------------------------- Emisor ------
create table if not exists public.fiscal_profile (
  user_id       uuid primary key references auth.users (id) on delete cascade,
  name          text not null default '',
  tagline       text,
  nif           text not null default '',
  address       text,
  email         text,
  phone         text,
  iban          text,
  iva_rate      numeric(5, 2) not null default 0,
  iva_exempt    boolean not null default true,
  iva_note      text,
  irpf_rate     numeric(5, 2) not null default 7,
  irpf_note     text,
  payment_days  int not null default 30,
  updated_at    timestamptz not null default now()
);

-- -------------------------------------------------------------- Clientes ------
create table if not exists public.clients (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  name        text not null,
  nif         text,
  address     text,
  email       text,
  notes       text,
  created_at  timestamptz not null default now()
);
create index if not exists clients_user_idx on public.clients (user_id);

-- -------------------------------------------------------------- Facturas ------
create table if not exists public.invoices (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  number          text not null,
  status          text not null default 'emitida'
                  check (status in ('borrador', 'emitida', 'cobrada')),
  issue_date      date not null default current_date,
  service_date    date,
  due_date        date,
  paid_date       date,

  client_id       uuid references public.clients (id) on delete set null,
  client_name     text not null default '',
  client_nif      text,
  client_address  text,

  -- Copia del emisor en el momento de emitir.
  issuer          jsonb not null default '{}'::jsonb,

  -- [{ concept, detail, qty, unit, price }]
  lines           jsonb not null default '[]'::jsonb,

  iva_rate        numeric(5, 2) not null default 0,
  iva_exempt      boolean not null default false,
  iva_note        text,
  irpf_rate       numeric(5, 2) not null default 0,
  irpf_note       text,

  base            numeric(12, 2) not null default 0,
  iva_amount      numeric(12, 2) not null default 0,
  irpf_amount     numeric(12, 2) not null default 0,
  total           numeric(12, 2) not null default 0,

  notes           text,
  created_at      timestamptz not null default now()
);
create index if not exists invoices_user_date_idx on public.invoices (user_id, issue_date);
create unique index if not exists invoices_user_number_uq on public.invoices (user_id, number);

-- ---------------------------------------------------------------- Gastos ------
create table if not exists public.expenses (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  date         date not null default current_date,
  supplier     text not null default '',
  supplier_nif text,
  concept      text not null default '',
  category     text not null default 'otros',
  base         numeric(12, 2) not null default 0,
  iva_rate     numeric(5, 2) not null default 0,
  iva_amount   numeric(12, 2) not null default 0,
  -- Si el IVA de este gasto se puede deducir en el 303.
  iva_deductible boolean not null default true,
  total        numeric(12, 2) not null default 0,
  notes        text,
  created_at   timestamptz not null default now()
);
create index if not exists expenses_user_date_idx on public.expenses (user_id, date);

-- ------------------------------------------------------------------- RLS ------
alter table public.fiscal_profile enable row level security;
alter table public.clients        enable row level security;
alter table public.invoices       enable row level security;
alter table public.expenses       enable row level security;

do $$
declare t text;
begin
  foreach t in array array['fiscal_profile', 'clients', 'invoices', 'expenses']
  loop
    execute format('drop policy if exists "own_rows" on public.%I', t);
    execute format(
      'create policy "own_rows" on public.%I
         for all
         using (auth.uid() = user_id)
         with check (auth.uid() = user_id)', t);
  end loop;
end $$;
