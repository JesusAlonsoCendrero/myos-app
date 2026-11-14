-- v15: subtareas dentro de cada tarea, como lista ordenada [{id, text, done}].
alter table public.tasks add column if not exists subtasks jsonb not null default '[]'::jsonb;
