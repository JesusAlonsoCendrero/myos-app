-- =============================================================================
--  BRUJULA - Esquema completo de base de datos
-- =============================================================================
--  Como usarlo:
--    1. Entra en https://supabase.com/dashboard -> tu proyecto -> SQL Editor
--    2. Pega TODO este archivo y pulsa "Run"
--    3. Listo. Es idempotente: puedes volver a ejecutarlo sin romper nada.
--
--  Seguridad: cada tabla tiene Row Level Security. Un usuario solo ve y edita
--  sus propias filas. Las tablas hijas heredan el permiso de su tabla padre.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. CATEGORIAS DE TAREAS
--    Viajes, Post LinkedIn, Videos YouTube, Estudio, Investigacion, ...
-- -----------------------------------------------------------------------------
create table if not exists public.task_categories (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade,
  name        text not null,
  color       text not null default '#0D9488',
  icon        text not null default 'tag',
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  unique (user_id, name)
);

-- -----------------------------------------------------------------------------
-- 2. TAREAS  (estilo Microsoft To Do: "Mi dia" + backlog de ideas)
--    is_backlog = true  -> es una idea aparcada, no aparece en el dia a dia
--    my_day_date        -> el dia en que la marcaste para "Mi dia"
-- -----------------------------------------------------------------------------
create table if not exists public.tasks (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users on delete cascade,
  title         text not null,
  notes         text,
  category_id   uuid references public.task_categories on delete set null,
  status        text not null default 'todo' check (status in ('todo', 'doing', 'done')),
  priority      smallint not null default 1 check (priority between 0 and 2),
  due_date      date,
  my_day_date   date,
  is_backlog    boolean not null default false,
  is_important  boolean not null default false,
  completed_at  timestamptz,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now()
);

create index if not exists tasks_user_due_idx     on public.tasks (user_id, due_date);
create index if not exists tasks_user_myday_idx   on public.tasks (user_id, my_day_date);
create index if not exists tasks_user_backlog_idx on public.tasks (user_id, is_backlog);

-- -----------------------------------------------------------------------------
-- 3. OBJETIVOS SEMANALES  (se "reinician" porque cada uno vive en su semana)
--    week_start = lunes de la semana, en formato date
-- -----------------------------------------------------------------------------
create table if not exists public.weekly_goals (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade,
  week_start  date not null,
  title       text not null,
  detail      text,
  area        text not null default 'personal'
              check (area in ('negocio', 'gimnasio', 'estudio', 'personal', 'viajes')),
  target      numeric not null default 1 check (target > 0),
  progress    numeric not null default 0 check (progress >= 0),
  unit        text,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists weekly_goals_user_week_idx on public.weekly_goals (user_id, week_start);

-- -----------------------------------------------------------------------------
-- 4. GIMNASIO: rutinas plantilla
-- -----------------------------------------------------------------------------
create table if not exists public.routines (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade,
  name        text not null,
  description text,
  created_at  timestamptz not null default now()
);

create table if not exists public.routine_exercises (
  id            uuid primary key default gen_random_uuid(),
  routine_id    uuid not null references public.routines on delete cascade,
  name          text not null,
  muscle_group  text,
  target_sets   smallint not null default 3,
  target_reps   text not null default '10',
  target_weight numeric,
  sort_order    integer not null default 0
);

create index if not exists routine_exercises_routine_idx on public.routine_exercises (routine_id);

-- -----------------------------------------------------------------------------
-- 5. GIMNASIO: sesiones reales (una fila = un dia de asistencia) y series
-- -----------------------------------------------------------------------------
create table if not exists public.workouts (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users on delete cascade,
  date         date not null,
  routine_id   uuid references public.routines on delete set null,
  title        text,
  kind         text not null default 'fuerza'
               check (kind in ('fuerza', 'cardio', 'movilidad', 'otro')),
  duration_min integer,
  energy       smallint check (energy between 1 and 5),
  notes        text,
  created_at   timestamptz not null default now()
);

create index if not exists workouts_user_date_idx on public.workouts (user_id, date desc);

create table if not exists public.workout_sets (
  id          uuid primary key default gen_random_uuid(),
  workout_id  uuid not null references public.workouts on delete cascade,
  exercise    text not null,
  set_number  smallint not null default 1,
  reps        smallint,
  weight_kg   numeric,
  rpe         numeric,
  sort_order  integer not null default 0
);

create index if not exists workout_sets_workout_idx  on public.workout_sets (workout_id);
create index if not exists workout_sets_exercise_idx on public.workout_sets (exercise);

-- -----------------------------------------------------------------------------
-- 6. PROYECTOS (ideas de negocio y proyectos en marcha)
-- -----------------------------------------------------------------------------
create table if not exists public.projects (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade,
  name        text not null,
  description text,
  status      text not null default 'idea'
              check (status in ('idea', 'planificado', 'activo', 'pausado', 'completado')),
  area        text not null default 'negocio'
              check (area in ('negocio', 'personal', 'formacion', 'contenido')),
  priority    smallint not null default 1 check (priority between 0 and 2),
  progress    smallint not null default 0 check (progress between 0 and 100),
  impact      smallint not null default 3 check (impact between 1 and 5),
  effort      smallint not null default 3 check (effort between 1 and 5),
  tags        text[] not null default '{}',
  target_date date,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- 7. VIAJES (ideas sueltas + viajes ya planeados) y su checklist
-- -----------------------------------------------------------------------------
create table if not exists public.trips (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade,
  destination text not null,
  country     text,
  status      text not null default 'idea'
              check (status in ('idea', 'planificando', 'reservado', 'completado')),
  start_date  date,
  end_date    date,
  budget      numeric,
  spent       numeric,
  companions  text,
  notes       text,
  rating      smallint check (rating between 1 and 5),
  created_at  timestamptz not null default now()
);

create index if not exists trips_user_status_idx on public.trips (user_id, status);

create table if not exists public.trip_items (
  id         uuid primary key default gen_random_uuid(),
  trip_id    uuid not null references public.trips on delete cascade,
  label      text not null,
  kind       text not null default 'checklist'
             check (kind in ('checklist', 'lugar', 'reserva')),
  done       boolean not null default false,
  sort_order integer not null default 0
);

create index if not exists trip_items_trip_idx on public.trip_items (trip_id);

-- =============================================================================
--  ROW LEVEL SECURITY
-- =============================================================================

alter table public.task_categories  enable row level security;
alter table public.tasks            enable row level security;
alter table public.weekly_goals     enable row level security;
alter table public.routines         enable row level security;
alter table public.routine_exercises enable row level security;
alter table public.workouts         enable row level security;
alter table public.workout_sets     enable row level security;
alter table public.projects         enable row level security;
alter table public.trips            enable row level security;
alter table public.trip_items       enable row level security;

-- Tablas con user_id: politica directa.
do $$
declare t text;
begin
  foreach t in array array[
    'task_categories', 'tasks', 'weekly_goals', 'routines',
    'workouts', 'projects', 'trips'
  ]
  loop
    execute format('drop policy if exists "own_rows" on public.%I', t);
    execute format(
      'create policy "own_rows" on public.%I
         for all
         using (auth.uid() = user_id)
         with check (auth.uid() = user_id)', t);
  end loop;
end $$;

-- Tablas hijas: heredan el permiso comprobando el padre.
drop policy if exists "own_rows" on public.routine_exercises;
create policy "own_rows" on public.routine_exercises
  for all
  using (exists (
    select 1 from public.routines r
    where r.id = routine_exercises.routine_id and r.user_id = auth.uid()))
  with check (exists (
    select 1 from public.routines r
    where r.id = routine_exercises.routine_id and r.user_id = auth.uid()));

drop policy if exists "own_rows" on public.workout_sets;
create policy "own_rows" on public.workout_sets
  for all
  using (exists (
    select 1 from public.workouts w
    where w.id = workout_sets.workout_id and w.user_id = auth.uid()))
  with check (exists (
    select 1 from public.workouts w
    where w.id = workout_sets.workout_id and w.user_id = auth.uid()));

drop policy if exists "own_rows" on public.trip_items;
create policy "own_rows" on public.trip_items
  for all
  using (exists (
    select 1 from public.trips t
    where t.id = trip_items.trip_id and t.user_id = auth.uid()))
  with check (exists (
    select 1 from public.trips t
    where t.id = trip_items.trip_id and t.user_id = auth.uid()));

-- =============================================================================
--  SEMILLA: categorias de tareas por defecto al crear la cuenta
-- =============================================================================

create or replace function public.seed_default_categories()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.task_categories (user_id, name, color, icon, sort_order)
  values
    (new.id, 'Consultoria',    '#0D9488', 'briefcase',   0),
    (new.id, 'Post LinkedIn',  '#0E7CC4', 'linkedin',    1),
    (new.id, 'Video YouTube',  '#DB2777', 'youtube',     2),
    (new.id, 'Estudio',        '#8B2FD6', 'graduation',  3),
    (new.id, 'Investigacion',  '#A16207', 'search',      4),
    (new.id, 'Viajes',         '#B45309', 'plane',       5),
    (new.id, 'Gimnasio',       '#657C12', 'dumbbell',    6),
    (new.id, 'Personal',       '#0F766E', 'home',        7)
  on conflict (user_id, name) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created_seed_categories on auth.users;
create trigger on_auth_user_created_seed_categories
  after insert on auth.users
  for each row execute function public.seed_default_categories();

-- Si tu usuario ya existia antes de ejecutar esto, siembra tus categorias a mano:
--   select public.seed_categories_for_me();
create or replace function public.seed_categories_for_me()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.task_categories (user_id, name, color, icon, sort_order)
  values
    (auth.uid(), 'Consultoria',   '#0D9488', 'briefcase',  0),
    (auth.uid(), 'Post LinkedIn', '#0E7CC4', 'linkedin',   1),
    (auth.uid(), 'Video YouTube', '#DB2777', 'youtube',    2),
    (auth.uid(), 'Estudio',       '#8B2FD6', 'graduation', 3),
    (auth.uid(), 'Investigacion', '#A16207', 'search',     4),
    (auth.uid(), 'Viajes',        '#B45309', 'plane',      5),
    (auth.uid(), 'Gimnasio',      '#657C12', 'dumbbell',   6),
    (auth.uid(), 'Personal',      '#0F766E', 'home',       7)
  on conflict (user_id, name) do nothing;
end $$;

grant execute on function public.seed_categories_for_me() to authenticated;
