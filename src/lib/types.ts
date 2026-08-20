// Tipos que reflejan supabase/schema.sql + supabase/migration-v2.sql.
// Si tocas el SQL, toca esto también.

export type TaskStatus = 'todo' | 'doing' | 'done'
export type GoalGroup = 'proyectos' | 'youtube' | 'linkedin' | 'estudio'
export type ProjectStatus = 'idea' | 'planificado' | 'activo' | 'completado'
export type ProjectArea = 'negocio' | 'personal' | 'formacion' | 'contenido'
export type TripStatus = 'idea' | 'planificado' | 'reservado'
export type WorkoutKind = 'fuerza' | 'cardio' | 'movilidad' | 'otro'
export type CanvasParent = 'goal' | 'trip' | 'project' | 'sprint'
export type CanvasKind = 'nota' | 'guion' | 'idea' | 'enlace' | 'lista' | 'reserva'

/* -------------------------------------------------------------------------- */
/*  Objetivos                                                                  */
/* -------------------------------------------------------------------------- */

export interface WeeklyGoal {
  id: string
  user_id: string
  week_start: string
  title: string
  detail: string | null
  group_key: GoalGroup
  tech: string | null
  done: boolean
  /** Si apunta a un proyecto registrado, su avance manda sobre el del objetivo. */
  project_id: string | null
  /** De qué idea del banco salió, para cerrarla al cumplir el objetivo. */
  idea_id: string | null
  sort_order: number
  created_at: string
}

export type SprintStatus = 'planificado' | 'activo' | 'cerrado'

/**
 * Un bloque de tiempo con fecha de inicio y fin. Dentro metes tareas, proyectos
 * e ideas para saber qué toca en ese periodo.
 */
export interface Sprint {
  id: string
  user_id: string
  name: string
  /** Qué quieres haber logrado al cerrarlo, en una frase. */
  goal: string | null
  start_date: string
  end_date: string
  status: SprintStatus
  emoji: string
  color: string | null
  notes: string | null
  sort_order: number
  created_at: string
  closed_at: string | null
}

export const SPRINT_STATUS_LABEL: Record<SprintStatus, string> = {
  planificado: 'Planificado',
  activo: 'Activo',
  cerrado: 'Cerrado',
}

export const SPRINT_EMOJIS = ['🏁', '🚀', '⚡', '🎯', '🔥', '📦', '🛠️', '🧭'] as const

/* -------------------------------------------------------------------------- */
/*  Objetivos                                                                  */
/* -------------------------------------------------------------------------- */

export type IdeaStatus = 'idea' | 'en_curso' | 'hecha'

/**
 * Los frentes del banco. Son los cuatro de Objetivos más "ver", que es la lista
 * de vídeos que quieres ver — no confundir con "youtube", que son los que
 * quieres grabar. "ver" no se puede llevar a los objetivos semanales.
 */
export type BankGroup = GoalGroup | 'ver'

/**
 * Una cosa que quieres hacer, viva aunque no toque esta semana. Cuando le llega
 * el turno se lleva a los objetivos y queda enlazada.
 */
export interface Idea {
  id: string
  user_id: string
  title: string
  notes: string | null
  group_key: BankGroup
  tech: string | null
  project_id: string | null
  status: IdeaStatus
  /** Solo en el frente "ver": el enlace del vídeo. */
  url: string | null
  /** Miniatura del vídeo. */
  image_url: string | null
  /** Canal o autor. */
  author: string | null
  /** Sprint en el que se va a abordar, si lo hay. */
  sprint_id: string | null
  sort_order: number
  created_at: string
  done_at: string | null
}

export const IDEA_STATUS_LABEL: Record<IdeaStatus, string> = {
  idea: 'Pendiente',
  en_curso: 'En marcha',
  hecha: 'Hecha',
}

export const IDEA_STATUS_EMOJI: Record<IdeaStatus, string> = {
  idea: '💭',
  en_curso: '🔧',
  hecha: '✅',
}

/** Las cuatro secciones fijas de Objetivos. */
export const GOAL_GROUPS: Array<{ key: GoalGroup; label: string; short: string; emoji: string }> = [
  { key: 'proyectos', label: 'Proyectos', short: 'Proyectos', emoji: '🚀' },
  { key: 'youtube', label: 'Vídeos de YouTube', short: 'YouTube', emoji: '🎬' },
  { key: 'linkedin', label: 'Posts de LinkedIn', short: 'LinkedIn', emoji: '💼' },
  { key: 'estudio', label: 'Estudio', short: 'Estudio', emoji: '📚' },
]

export const GOAL_GROUP_LABEL = Object.fromEntries(
  GOAL_GROUPS.map((g) => [g.key, g.label]),
) as Record<GoalGroup, string>

/** Los frentes del banco: los de Objetivos más la lista de vídeos por ver. */
export const BANK_GROUPS: Array<{
  key: BankGroup
  label: string
  short: string
  emoji: string
}> = [...GOAL_GROUPS, { key: 'ver', label: 'Vídeos por ver', short: 'Por ver', emoji: '📺' }]

/** Las tecnologías de Power Platform con las que trabajas. */
export const TECHNOLOGIES = [
  'Power Apps',
  'Power Automate',
  'Power BI',
  'Power Pages',
  'Copilot Studio',
  'Dynamics 365 Sales',
  'Business Central',
] as const

export type Technology = (typeof TECHNOLOGIES)[number]

/** Un color estable por tecnología, para que se reconozcan de un vistazo. */
export const TECH_COLOR: Record<string, string> = {
  'Power Apps': '#8B2FD6',
  'Power Automate': '#0E7CC4',
  'Power BI': '#A16207',
  'Power Pages': '#0D9488',
  'Copilot Studio': '#DB2777',
  'Dynamics 365 Sales': '#B45309',
  'Business Central': '#657C12',
}

/* -------------------------------------------------------------------------- */
/*  Tareas                                                                     */
/* -------------------------------------------------------------------------- */

export interface Task {
  id: string
  user_id: string
  title: string
  notes: string | null
  /** Cuelga de un objetivo de la semana… */
  goal_id: string | null
  /** Y opcionalmente vive dentro de un sprint. */
  sprint_id: string | null
  /** …o de un proyecto. Nunca de los dos a la vez. */
  project_id: string | null
  status: TaskStatus
  priority: number // 0 baja · 1 normal · 2 alta
  due_date: string | null
  my_day_date: string | null
  is_backlog: boolean
  is_important: boolean
  completed_at: string | null
  sort_order: number
  created_at: string
}

export const PRIORITY_LABEL: Record<number, string> = {
  0: 'Baja',
  1: 'Normal',
  2: 'Alta',
}

/* -------------------------------------------------------------------------- */
/*  Lienzos                                                                    */
/* -------------------------------------------------------------------------- */

export interface ChecklistItem {
  text: string
  done: boolean
}

export interface CanvasBlock {
  id: string
  user_id: string
  parent_type: CanvasParent
  parent_id: string
  kind: CanvasKind
  title: string | null
  content: string | null
  checklist: ChecklistItem[]
  color: string | null
  sort_order: number
  created_at: string
  updated_at: string
}

export const CANVAS_KINDS: Array<{ key: CanvasKind; label: string; emoji: string }> = [
  { key: 'nota', label: 'Nota', emoji: '📝' },
  { key: 'guion', label: 'Guion', emoji: '🎤' },
  { key: 'idea', label: 'Idea', emoji: '💡' },
  { key: 'enlace', label: 'Enlace', emoji: '🔗' },
  { key: 'lista', label: 'Lista', emoji: '✅' },
  { key: 'reserva', label: 'Reserva', emoji: '🎫' },
]

/* -------------------------------------------------------------------------- */
/*  Gimnasio                                                                   */
/* -------------------------------------------------------------------------- */

export interface Exercise {
  id: string
  name: string
  body_part: string | null
  target: string | null
  equipment: string | null
  gif_url: string | null
  /** Ruta en el bucket exercise-gifs. Si está, es la que se muestra. */
  gif_path: string | null
  popularity_rank: number | null
  instructions: string[]
  difficulty: string | null
  calories_per_min: number | null
  secondary_muscles: string[]
}

export interface Routine {
  id: string
  user_id: string
  name: string
  description: string | null
  color: string | null
  emoji: string | null
  created_at: string
}

export interface RoutineExercise {
  id: string
  routine_id: string
  exercise_id: string | null
  name: string
  muscle_group: string | null
  target_sets: number
  target_reps: string
  target_weight: number | null
  rest_seconds: number
  notes: string | null
  sort_order: number
}

export interface Workout {
  id: string
  user_id: string
  date: string
  routine_id: string | null
  title: string | null
  kind: WorkoutKind
  duration_min: number | null
  energy: number | null
  notes: string | null
  started_at: string | null
  finished_at: string | null
  created_at: string
}

export interface WorkoutSet {
  id: string
  workout_id: string
  /** De quién es la serie. null = tuya. */
  buddy_id: string | null
  exercise_id: string | null
  exercise: string
  set_number: number
  reps: number | null
  weight_kg: number | null
  rpe: number | null
  done: boolean
  sort_order: number
}

/** Alguien con quien entrenas. Sus series se guardan en la misma sesión. */
export interface Buddy {
  id: string
  user_id: string
  name: string
  emoji: string
  color: string | null
  notes: string | null
  created_at: string
}

export const BUDDY_EMOJIS = ['💪', '🏋️', '🔥', '🦍', '🐺', '🚀', '⚡', '🥷', '🧗', '🏃'] as const

export const WORKOUT_KIND_LABEL: Record<WorkoutKind, string> = {
  fuerza: 'Fuerza',
  cardio: 'Cardio',
  movilidad: 'Movilidad',
  otro: 'Otro',
}

/* -------------------------------------------------------------------------- */
/*  Proyectos                                                                  */
/* -------------------------------------------------------------------------- */

export interface Project {
  id: string
  user_id: string
  name: string
  description: string | null
  status: ProjectStatus
  area: ProjectArea
  priority: number
  progress: number
  technologies: string[]
  target_date: string | null
  /** Si es hoy, el proyecto aparece fijado arriba en Mi día. */
  my_day_date: string | null
  /** Sprint en el que se está trabajando, si lo hay. */
  sprint_id: string | null
  created_at: string
  updated_at: string
}

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  idea: 'Idea',
  planificado: 'Planificado',
  activo: 'Activo',
  completado: 'Completado',
}

export const PROJECT_STATUS_EMOJI: Record<ProjectStatus, string> = {
  idea: '💭',
  planificado: '🗓️',
  activo: '🚀',
  completado: '✅',
}

export const PROJECT_AREA_LABEL: Record<ProjectArea, string> = {
  negocio: 'Negocio',
  personal: 'Personal',
  formacion: 'Formación',
  contenido: 'Contenido',
}

/* -------------------------------------------------------------------------- */
/*  Viajes                                                                     */
/* -------------------------------------------------------------------------- */

export interface Trip {
  id: string
  user_id: string
  destination: string
  country: string | null
  status: TripStatus
  start_date: string | null
  end_date: string | null
  budget: number | null
  spent: number | null
  companions: string | null
  notes: string | null
  image_url: string | null
  lat: number | null
  lon: number | null
  created_at: string
}

export interface TripItem {
  id: string
  trip_id: string
  label: string
  kind: 'checklist' | 'lugar' | 'reserva'
  done: boolean
  sort_order: number
}

export const TRIP_STATUS_LABEL: Record<TripStatus, string> = {
  idea: 'Idea',
  planificado: 'Planificado',
  reservado: 'Reservado',
}

export const TRIP_STATUS_EMOJI: Record<TripStatus, string> = {
  idea: '💭',
  planificado: '🗓️',
  reservado: '✈️',
}
