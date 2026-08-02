-- =============================================================================
--  MyOS · Migracion v2
-- =============================================================================
--  Ejecuta este archivo ENTERO en el SQL Editor de Supabase, despues de
--  schema.sql. Es idempotente: puedes lanzarlo las veces que quieras.
--
--  Que cambia respecto a la v1:
--    · Objetivos      -> grupos fijos + tecnologia; fuera area, meta y unidad
--    · Tareas         -> fuera categorias; se enlazan a un objetivo o proyecto
--    · Proyectos      -> fuera impacto y esfuerzo; etiquetas -> tecnologias
--    · Viajes         -> 3 estados, imagen de portada y coordenadas del mapa
--    · Nuevo          -> canvas_blocks (lienzos) y exercises (catalogo de gym)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. OBJETIVOS SEMANALES
-- -----------------------------------------------------------------------------
alter table public.weekly_goals add column if not exists group_key text;
alter table public.weekly_goals add column if not exists tech text;
alter table public.weekly_goals add column if not exists done boolean not null default false;

-- Traduce lo que hubiera de la v1 antes de imponer el nuevo formato.
-- Solo si "area" sigue existiendo: al relanzar esto ya se habra borrado.
do $$ begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public'
                and table_name = 'weekly_goals'
                and column_name = 'area') then
    execute $q$
      update public.weekly_goals
         set group_key = coalesce(group_key,
               case area
                 when 'negocio' then 'proyectos'
                 when 'estudio' then 'estudio'
                 else 'proyectos'
               end)
       where group_key is null
    $q$;
  else
    update public.weekly_goals set group_key = 'proyectos' where group_key is null;
  end if;
end $$;

alter table public.weekly_goals alter column group_key set default 'proyectos';
alter table public.weekly_goals alter column group_key set not null;

do $$ begin
  alter table public.weekly_goals
    add constraint weekly_goals_group_key_check
    check (group_key in ('proyectos', 'youtube', 'linkedin', 'estudio'));
exception when duplicate_object then null; end $$;

-- Fuera lo que ya no se usa. El avance se calcula desde las tareas asociadas.
alter table public.weekly_goals drop column if exists area;
alter table public.weekly_goals drop column if exists target;
alter table public.weekly_goals drop column if exists progress;
alter table public.weekly_goals drop column if exists unit;

create index if not exists weekly_goals_group_idx
  on public.weekly_goals (user_id, week_start, group_key);

-- -----------------------------------------------------------------------------
-- 2. TAREAS
--    Ya no hay categorias: cada tarea cuelga de un objetivo o de un proyecto.
-- -----------------------------------------------------------------------------
alter table public.tasks add column if not exists goal_id uuid
  references public.weekly_goals on delete set null;
alter table public.tasks add column if not exists project_id uuid
  references public.projects on delete set null;

alter table public.tasks drop column if exists category_id;
drop table if exists public.task_categories cascade;

create index if not exists tasks_goal_idx    on public.tasks (goal_id);
create index if not exists tasks_project_idx on public.tasks (project_id);
create index if not exists tasks_sort_idx    on public.tasks (user_id, sort_order);

-- La semilla de categorias de la v1 ya no aplica.
drop trigger if exists on_auth_user_created_seed_categories on auth.users;
drop function if exists public.seed_default_categories();
drop function if exists public.seed_categories_for_me();

-- -----------------------------------------------------------------------------
-- 3. PROYECTOS
-- -----------------------------------------------------------------------------
alter table public.projects drop column if exists impact;
alter table public.projects drop column if exists effort;
alter table public.projects add column if not exists technologies text[] not null default '{}';

-- Lo que hubiera en tags pasa a technologies y la columna vieja desaparece.
do $$ begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'projects' and column_name = 'tags') then
    update public.projects set technologies = tags where technologies = '{}' and tags <> '{}';
    alter table public.projects drop column tags;
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 4. VIAJES
--    Solo tres estados, imagen de portada y coordenadas para el mapa.
-- -----------------------------------------------------------------------------
alter table public.trips add column if not exists image_url text;
alter table public.trips add column if not exists lat numeric;
alter table public.trips add column if not exists lon numeric;

update public.trips set status = 'planificado' where status in ('planificando', 'completado');

do $$ begin
  alter table public.trips drop constraint if exists trips_status_check;
  alter table public.trips
    add constraint trips_status_check
    check (status in ('idea', 'planificado', 'reservado'));
end $$;

alter table public.trips drop column if exists rating;

-- -----------------------------------------------------------------------------
-- 5. LIENZOS
--    Tarjetas libres colgadas de un objetivo o de un viaje: guiones, ideas de
--    miniaturas, datos de vuelos, enlaces... Una sola tabla para los dos casos.
-- -----------------------------------------------------------------------------
create table if not exists public.canvas_blocks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade,
  parent_type text not null check (parent_type in ('goal', 'trip', 'project')),
  parent_id   uuid not null,
  kind        text not null default 'nota'
              check (kind in ('nota', 'guion', 'idea', 'enlace', 'lista', 'reserva')),
  title       text,
  content     text,
  checklist   jsonb not null default '[]'::jsonb,
  color       text,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists canvas_blocks_parent_idx
  on public.canvas_blocks (user_id, parent_type, parent_id, sort_order);

alter table public.canvas_blocks enable row level security;
drop policy if exists "own_rows" on public.canvas_blocks;
create policy "own_rows" on public.canvas_blocks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- 6. CATALOGO DE EJERCICIOS
--    Se rellena una sola vez con  npm run import-exercises  (WorkoutX).
--    Es comun a todos los usuarios: se lee, no se escribe desde la app.
-- -----------------------------------------------------------------------------
create table if not exists public.exercises (
  id                 text primary key,
  name               text not null,
  body_part          text,
  target             text,
  equipment          text,
  gif_url            text,
  -- Ruta dentro del bucket "exercise-gifs". Se rellena al sincronizar los GIF:
  -- el original de WorkoutX exige la clave de API, asi que se copia aqui una
  -- vez y el navegador lo lee de tu propio Supabase.
  gif_path           text,
  popularity_rank    integer,
  instructions       text[] not null default '{}',
  difficulty         text,
  calories_per_min   numeric,
  secondary_muscles  text[] not null default '{}',
  source             text not null default 'workoutx',
  updated_at         timestamptz not null default now()
);

create index if not exists exercises_name_idx      on public.exercises (lower(name));
create index if not exists exercises_body_part_idx on public.exercises (body_part);
create index if not exists exercises_target_idx    on public.exercises (target);

alter table public.exercises enable row level security;

-- Cualquier usuario autenticado puede consultarlo; nadie lo edita desde la app
-- (el importador entra con la secret key y se salta RLS).
drop policy if exists "read_all" on public.exercises;
create policy "read_all" on public.exercises for select to authenticated using (true);

-- -----------------------------------------------------------------------------
-- 7. GIMNASIO: enlazar rutinas y series con el catalogo, y modo entreno
-- -----------------------------------------------------------------------------
alter table public.routine_exercises add column if not exists exercise_id text
  references public.exercises on delete set null;
alter table public.routine_exercises add column if not exists rest_seconds integer not null default 90;
alter table public.routine_exercises add column if not exists notes text;

alter table public.routines add column if not exists color text;
alter table public.routines add column if not exists emoji text;

alter table public.workouts add column if not exists started_at timestamptz;
alter table public.workouts add column if not exists finished_at timestamptz;

alter table public.workout_sets add column if not exists done boolean not null default false;
alter table public.workout_sets add column if not exists exercise_id text
  references public.exercises on delete set null;

-- -----------------------------------------------------------------------------
-- 8. ALMACENAMIENTO PARA LAS IMAGENES DE VIAJES
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('trip-images', 'trip-images', true)
on conflict (id) do nothing;

-- Copia local de los GIF de ejercicios (los originales exigen clave de API).
insert into storage.buckets (id, name, public)
values ('exercise-gifs', 'exercise-gifs', true)
on conflict (id) do nothing;

drop policy if exists "exercise_gifs_read" on storage.objects;
create policy "exercise_gifs_read" on storage.objects
  for select using (bucket_id = 'exercise-gifs');

drop policy if exists "trip_images_read" on storage.objects;
create policy "trip_images_read" on storage.objects
  for select using (bucket_id = 'trip-images');

drop policy if exists "trip_images_write" on storage.objects;
create policy "trip_images_write" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'trip-images' and owner = auth.uid());

drop policy if exists "trip_images_delete" on storage.objects;
create policy "trip_images_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'trip-images' and owner = auth.uid());
