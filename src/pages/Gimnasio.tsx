import { useMemo, useState } from 'react'
import {
  CalendarCheck,
  Dumbbell,
  Flame,
  Pencil,
  Play,
  Plus,
  Trash2,
  Zap,
} from 'lucide-react'
import {
  Badge,
  Button,
  Card,
  cx,
  Drawer,
  EmptyState,
  ErrorNote,
  Field,
  IconButton,
  Input,
  Modal,
  SectionTitle,
  Segmented,
  Select,
  Spinner,
  Textarea,
  useConfirm,
  useToast,
} from '@/components/ui'
import AnimatedNumber from '@/components/AnimatedNumber'
import AttendanceCalendar from '@/components/AttendanceCalendar'
import Gymbros from '@/components/Gymbros'
import ExercisePicker, { ExerciseGif } from '@/components/ExercisePicker'
import WorkoutPlayer from '@/components/WorkoutPlayer'
import { useCollection } from '@/hooks/useCollection'
import { db, friendlyError } from '@/lib/supabase'
import { fromISODate, humanDate, longDate, toISODate, today } from '@/lib/dates'
import {
  WORKOUT_KIND_LABEL,
  type Buddy,
  type Exercise,
  type Routine,
  type RoutineExercise,
  type Workout,
  type WorkoutKind,
  type WorkoutSet,
} from '@/lib/types'
import { CHART_COLORS } from '@/lib/palette'

const KINDS = Object.keys(WORKOUT_KIND_LABEL) as WorkoutKind[]

const KIND_COLOR: Record<WorkoutKind, string> = {
  fuerza: CHART_COLORS[0],
  cardio: CHART_COLORS[5],
  movilidad: CHART_COLORS[3],
  otro: CHART_COLORS[1],
}

export default function Gimnasio() {
  const [tab, setTab] = useState<'sesiones' | 'rutinas' | 'gymbros'>('sesiones')

  return (
    <div className="animate-rise">
      {tab !== 'gymbros' && (
        <SectionTitle hint="Cuándo vas, qué haces y cuánto mueves. Nada más.">
          Gimnasio
        </SectionTitle>
      )}

      <Segmented
        className="mb-5"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'sesiones', label: '📅 Sesiones' },
          { value: 'rutinas', label: '🏋️ Rutinas' },
          { value: 'gymbros', label: '🤝 Gymbros' },
        ]}
      />

      {tab === 'sesiones' ? <Sesiones /> : tab === 'rutinas' ? <Rutinas /> : <Gymbros />}
    </div>
  )
}

/* ========================================================================== */
/*  SESIONES                                                                   */
/* ========================================================================== */

function Sesiones() {
  const toast = useToast()
  const confirm = useConfirm()

  const [openWorkout, setOpenWorkout] = useState<Workout | null>(null)
  const [playing, setPlaying] = useState<{ workout: Workout; routine: Routine | null } | null>(null)
  const [busy, setBusy] = useState(false)
  /** Rutina elegida, esperando a que digas con quién entrenas. */
  const [starting, setStarting] = useState<Routine | null>(null)

  const buddies = useCollection<Buddy>('buddies', { shape: (q) => q.order('name') })

  const workouts = useCollection<Workout>('workouts', {
    shape: (q) => q.order('date', { ascending: false }).limit(200),
  })

  const routines = useCollection<Routine>('routines', { shape: (q) => q.order('name') })

  const attended = useMemo(() => new Set(workouts.rows.map((w) => w.date)), [workouts.rows])

  const stats = useMemo(() => {
    const month = today().slice(0, 7)
    const thisMonth = workouts.rows.filter((w) => w.date.startsWith(month)).length

    // Racha: días consecutivos hacia atrás con sesión, en hora local.
    let streak = 0
    const cursor = fromISODate(today())
    if (!attended.has(today())) cursor.setDate(cursor.getDate() - 1)
    while (attended.has(toISODate(cursor))) {
      streak++
      cursor.setDate(cursor.getDate() - 1)
    }

    return { thisMonth, streak, total: workouts.rows.length }
  }, [workouts.rows, attended])

  /**
   * Crea la sesión y, si viene de una rutina, precarga las series de cada
   * persona: las tuyas (buddy_id null) y una tanda por cada gymbro que venga.
   */
  async function createWorkout(
    routineId?: string,
    date = today(),
    buddyIds: string[] = [],
  ): Promise<Workout | null> {
    setBusy(true)
    try {
      const routine = routines.rows.find((r) => r.id === routineId)
      const workout = await workouts.insert({
        date,
        routine_id: routineId ?? null,
        title: routine?.name ?? null,
        kind: 'fuerza',
        started_at: new Date().toISOString(),
      })

      if (routineId) {
        const { data, error } = await db()
          .from('routine_exercises')
          .select('*')
          .eq('routine_id', routineId)
          .order('sort_order')
        if (error) throw error

        const plan = (data ?? []) as RoutineExercise[]
        const people: Array<string | null> = [null, ...buddyIds]

        const rows = people.flatMap((buddyId) =>
          plan.flatMap((ex, exIndex) =>
            Array.from({ length: ex.target_sets }, (_, i) => ({
              workout_id: workout.id,
              buddy_id: buddyId,
              exercise_id: ex.exercise_id,
              exercise: ex.name,
              set_number: i + 1,
              // Los pesos objetivo son los tuyos: el gymbro empieza en blanco.
              reps: Number.parseInt(ex.target_reps, 10) || null,
              weight_kg: buddyId ? null : ex.target_weight,
              sort_order: exIndex * 100 + i,
            })),
          ),
        )
        if (rows.length) {
          const { error: setsError } = await db().from('workout_sets').insert(rows)
          if (setsError) throw setsError
        }
      }
      return workout
    } catch (e) {
      toast.error(friendlyError(e))
      return null
    } finally {
      setBusy(false)
    }
  }

  async function startRoutine(routine: Routine, buddyIds: string[]) {
    setStarting(null)
    const workout = await createWorkout(routine.id, today(), buddyIds)
    if (workout) setPlaying({ workout, routine })
  }

  async function removeWorkout(w: Workout) {
    const ok = await confirm({
      title: '¿Borrar sesión?',
      message: `Se borrará la del ${longDate(w.date)} con todas sus series.`,
      confirmLabel: 'Borrar',
      danger: true,
    })
    if (!ok) return
    try {
      await workouts.remove(w.id)
      setOpenWorkout(null)
      toast.success('Sesión borrada')
    } catch (e) {
      toast.error(friendlyError(e))
    }
  }

  const trainedToday = attended.has(today())

  if (playing) {
    return (
      <WorkoutPlayer
        workoutId={playing.workout.id}
        routine={playing.routine}
        onFinish={(min) => {
          setPlaying(null)
          void workouts.reload()
          toast.success(`¡Sesión terminada! ${min} minutos`)
        }}
        onCancel={() => {
          setPlaying(null)
          void workouts.reload()
        }}
      />
    )
  }

  return (
    <div className="stagger space-y-5">
      {/* --- Empezar: la tarjeta protagonista ------------------------------ */}
      <Card className="relative overflow-hidden p-5 sm:p-6">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{ background: 'var(--grad)' }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -top-16 -right-10 size-56 animate-breathe rounded-full opacity-20 blur-3xl"
          style={{ background: 'var(--grad)' }}
        />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <h2 className="font-display text-3xl leading-tight font-bold">
              {trainedToday ? '¡Hoy ya has entrenado! 💪' : '¿Entrenamos?'}
            </h2>
            <p className="mt-1 text-[13px] text-ink-2">
              {routines.rows.length
                ? 'Elige rutina y te voy llevando ejercicio a ejercicio.'
                : 'Crea una rutina en la pestaña de al lado y aquí tendrás el botón de empezar.'}
            </p>
          </div>
          <Button
            variant={trainedToday ? 'outline' : 'primary'}
            loading={busy}
            icon={<Plus className="size-4" />}
            onClick={async () => {
              const w = await createWorkout()
              if (w) setOpenWorkout(w)
            }}
          >
            Sesión libre
          </Button>
        </div>

        {routines.rows.length > 0 && (
          <div className="relative mt-5 grid gap-2.5 sm:grid-cols-2">
            {routines.rows.map((r) => (
              <button
                key={r.id}
                disabled={busy}
                onClick={() => (buddies.rows.length ? setStarting(r) : void startRoutine(r, []))}
                className="group card-hover flex items-center gap-3 rounded-2xl bg-surface p-3.5 text-left shadow-card disabled:opacity-50"
              >
                <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-accent-soft text-2xl transition-transform duration-200 group-hover:scale-110">
                  {r.emoji || '🏋️'}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-display font-bold">{r.name}</span>
                  {r.description && (
                    <span className="block truncate text-[12px] text-ink-3">{r.description}</span>
                  )}
                </span>
                <span className="grid size-9 shrink-0 place-items-center rounded-full text-accent-ink shadow-glow transition-transform duration-200 group-hover:scale-110 [background:var(--grad)]">
                  <Play className="size-4 translate-x-px fill-current" />
                </span>
              </button>
            ))}
          </div>
        )}
      </Card>

      {/* --- Cifras -------------------------------------------------------- */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Tile icon={<Flame className="size-4" />} label="Racha" value={stats.streak} unit="días" joy />
        <Tile
          icon={<CalendarCheck className="size-4" />}
          label="Este mes"
          value={stats.thisMonth}
          unit="sesiones"
        />
        <Tile
          icon={<Dumbbell className="size-4" />}
          label="En total"
          value={stats.total}
          unit="sesiones"
        />
      </div>

      {/* --- Calendario ---------------------------------------------------- */}
      <AttendanceCalendar
        attended={attended}
        onPickDay={async (iso) => {
          const existing = workouts.rows.find((w) => w.date === iso)
          if (existing) return setOpenWorkout(existing)
          const w = await createWorkout(undefined, iso)
          if (w) setOpenWorkout(w)
        }}
      />

      {workouts.error && <ErrorNote>{workouts.error}</ErrorNote>}

      {/* --- Historial ------------------------------------------------------ */}
      {workouts.loading ? (
        <Spinner />
      ) : workouts.rows.length === 0 ? (
        <EmptyState
          icon={<Dumbbell className="size-8" />}
          title="Todavía no hay sesiones"
          description="Empieza una y el calendario se irá llenando solo."
        />
      ) : (
        <div>
          <h3 className="mb-2 px-1 text-[13px] font-bold tracking-wide text-ink-3 uppercase">
            Últimas sesiones
          </h3>
          <ul className="space-y-2">
            {workouts.rows.slice(0, 12).map((w) => (
              <Card as="li" key={w.id} className="flex items-center gap-3 p-3">
                <div
                  className="grid size-11 shrink-0 place-items-center rounded-2xl text-sm font-bold"
                  style={{ backgroundColor: `${KIND_COLOR[w.kind]}20`, color: KIND_COLOR[w.kind] }}
                >
                  {w.date.slice(8, 10)}
                </div>
                <button onClick={() => setOpenWorkout(w)} className="min-w-0 flex-1 text-left">
                  <p className="truncate text-sm font-bold">
                    {w.title || WORKOUT_KIND_LABEL[w.kind]}
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px] text-ink-3">
                    <span>{humanDate(w.date)}</span>
                    <Badge color={KIND_COLOR[w.kind]}>{WORKOUT_KIND_LABEL[w.kind]}</Badge>
                    {w.duration_min ? <span className="tnum">{w.duration_min} min</span> : null}
                  </p>
                </button>
                <IconButton label="Editar" onClick={() => setOpenWorkout(w)}>
                  <Pencil className="size-4" />
                </IconButton>
                <IconButton label="Borrar" onClick={() => void removeWorkout(w)}>
                  <Trash2 className="size-4" />
                </IconButton>
              </Card>
            ))}
          </ul>
        </div>
      )}

      {/* --- ¿Con quién entrenas? ------------------------------------------ */}
      <CompanionPicker
        routine={starting}
        buddies={buddies.rows}
        busy={busy}
        onCancel={() => setStarting(null)}
        onStart={(ids) => starting && void startRoutine(starting, ids)}
      />

      {openWorkout && (
        <WorkoutDrawer
          workout={openWorkout}
          onClose={() => setOpenWorkout(null)}
          onPlay={() =>
            setPlaying({
              workout: openWorkout,
              routine: routines.rows.find((r) => r.id === openWorkout.routine_id) ?? null,
            })
          }
          onSaved={(patch) => {
            void workouts.update(openWorkout.id, patch).catch((e) => toast.error(friendlyError(e)))
            setOpenWorkout({ ...openWorkout, ...patch } as Workout)
          }}
        />
      )}
    </div>
  )
}

/** Antes de empezar: solo o acompañado. Un toque por persona y a entrenar. */
function CompanionPicker({
  routine,
  buddies,
  busy,
  onCancel,
  onStart,
}: {
  routine: Routine | null
  buddies: Buddy[]
  busy: boolean
  onCancel: () => void
  onStart: (buddyIds: string[]) => void
}) {
  const [picked, setPicked] = useState<string[]>([])

  return (
    <Modal
      open={Boolean(routine)}
      onClose={() => {
        setPicked([])
        onCancel()
      }}
      title={`${routine?.emoji || '🏋️'} ${routine?.name ?? ''}`}
      description="¿Entrenas solo o viene alguien?"
      footer={
        <>
          <Button
            variant="ghost"
            onClick={() => {
              setPicked([])
              onCancel()
            }}
          >
            Cancelar
          </Button>
          <Button
            variant="primary"
            loading={busy}
            onClick={() => {
              onStart(picked)
              setPicked([])
            }}
          >
            {picked.length ? `Empezar (${picked.length + 1})` : 'Empezar solo'}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {buddies.map((b) => {
          const on = picked.includes(b.id)
          return (
            <button
              key={b.id}
              onClick={() =>
                setPicked(on ? picked.filter((x) => x !== b.id) : [...picked, b.id])
              }
              className={cx(
                'flex flex-col items-center gap-2 rounded-2xl border p-4 transition-colors',
                on
                  ? 'border-accent bg-accent-soft text-accent'
                  : 'border-line bg-surface-2 hover:border-line-strong',
              )}
            >
              <span className="text-3xl">{b.emoji}</span>
              <span className="max-w-full truncate text-[13px] font-bold">{b.name}</span>
            </button>
          )
        })}
      </div>

      <p className="mt-4 text-[12px] leading-relaxed text-ink-3">
        A quien elijas se le crean sus propias series de la rutina, en blanco. Durante el entreno
        puedes ir cambiando de persona para apuntar sus pesos.
      </p>
    </Modal>
  )
}

function Tile({
  icon,
  label,
  value,
  unit,
  joy,
}: {
  icon: React.ReactNode
  label: string
  value: number
  unit: string
  joy?: boolean
}) {
  return (
    <Card className={cx('card-hover p-4', joy && 'bg-joy-soft')}>
      <p
        className={cx(
          'flex items-center gap-1.5 text-[11px] font-bold tracking-[0.1em] uppercase',
          joy ? 'text-joy' : 'text-ink-3',
        )}
      >
        {icon}
        {label}
      </p>
      <p className="mt-1.5 tnum font-display text-4xl leading-none font-bold">
        <AnimatedNumber value={value} />
        <span className="ml-1.5 font-sans text-[13px] font-semibold text-ink-3">{unit}</span>
      </p>
    </Card>
  )
}

/* -------------------------------------------------------------------------- */

function WorkoutDrawer({
  workout,
  onClose,
  onSaved,
  onPlay,
}: {
  workout: Workout
  onClose: () => void
  onSaved: (patch: Partial<Workout>) => void
  onPlay: () => void
}) {
  const toast = useToast()
  const [kind, setKind] = useState<WorkoutKind>(workout.kind)
  const [title, setTitle] = useState(workout.title ?? '')
  const [duration, setDuration] = useState(workout.duration_min?.toString() ?? '')
  const [notes, setNotes] = useState(workout.notes ?? '')
  const [picker, setPicker] = useState(false)

  const sets = useCollection<WorkoutSet>('workout_sets', {
    scopeToUser: false,
    shape: (q) => q.eq('workout_id', workout.id).order('sort_order').order('set_number'),
    deps: [workout.id],
  })

  const grouped = useMemo(() => {
    const map = new Map<string, WorkoutSet[]>()
    for (const s of sets.rows) {
      const list = map.get(s.exercise) ?? []
      list.push(s)
      map.set(s.exercise, list)
    }
    return [...map.entries()]
  }, [sets.rows])

  const volume = useMemo(
    () => sets.rows.reduce((a, s) => a + (s.reps ?? 0) * Number(s.weight_kg ?? 0), 0),
    [sets.rows],
  )

  async function addExercise(ex: Exercise) {
    try {
      for (let i = 0; i < 3; i++) {
        await sets.insert({
          workout_id: workout.id,
          exercise_id: ex.id,
          exercise: ex.name,
          set_number: i + 1,
          sort_order: sets.rows.length + i,
        })
      }
    } catch (e) {
      toast.error(friendlyError(e))
    }
  }

  return (
    <>
      <Drawer
        open
        onClose={() => {
          onSaved({
            kind,
            title: title.trim() || null,
            duration_min: duration ? Number(duration) : null,
            notes: notes.trim() || null,
          })
          onClose()
        }}
        width="lg"
        title={longDate(workout.date)}
        subtitle={volume > 0 ? `${Math.round(volume).toLocaleString('es-ES')} kg movidos` : undefined}
        footer={
          <>
            <Button variant="outline" icon={<Play className="size-4" />} onClick={onPlay}>
              Entrenar
            </Button>
            <div className="flex-1" />
            <Button
              variant="primary"
              onClick={() => {
                onSaved({
                  kind,
                  title: title.trim() || null,
                  duration_min: duration ? Number(duration) : null,
                  notes: notes.trim() || null,
                })
                onClose()
              }}
            >
              Guardar
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nombre">
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Torso A" />
            </Field>
            <Field label="Tipo">
              <Select value={kind} onChange={(e) => setKind(e.target.value as WorkoutKind)}>
                {KINDS.map((k) => (
                  <option key={k} value={k}>
                    {WORKOUT_KIND_LABEL[k]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Field label="Duración (min)">
            <Input
              type="number"
              min={0}
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              placeholder="60"
            />
          </Field>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-[13px] font-bold tracking-wide text-ink-3 uppercase">
                Ejercicios
              </h3>
              <Button size="sm" variant="outline" icon={<Plus className="size-4" />} onClick={() => setPicker(true)}>
                Añadir
              </Button>
            </div>

            {sets.loading ? (
              <Spinner label="Cargando…" />
            ) : grouped.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-line-strong px-4 py-6 text-center text-sm text-ink-3">
                Añade el primer ejercicio.
              </p>
            ) : (
              <div className="space-y-3">
                {grouped.map(([exercise, list]) => (
                  <div key={exercise} className="rounded-2xl border border-line bg-surface-2 p-3">
                    <div className="mb-2 flex items-center gap-2.5">
                      <ExerciseGif
                        exercise={{
                          gif_path: list[0].exercise_id ? `${list[0].exercise_id}.gif` : null,
                          name: exercise,
                          body_part: null,
                        }}
                        className="size-11"
                      />
                      <p className="min-w-0 flex-1 truncate text-sm font-bold">{exercise}</p>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          void sets
                            .insert({
                              workout_id: workout.id,
                              exercise_id: list[0].exercise_id,
                              exercise,
                              set_number: list.length + 1,
                              reps: list.at(-1)?.reps ?? null,
                              weight_kg: list.at(-1)?.weight_kg ?? null,
                              sort_order: (list.at(-1)?.sort_order ?? 0) + 1,
                            })
                            .catch((e) => toast.error(friendlyError(e)))
                        }
                      >
                        <Plus className="size-4" /> Serie
                      </Button>
                    </div>

                    <div className="grid grid-cols-[auto_1fr_1fr_auto] items-center gap-x-2 gap-y-1.5 text-[12px]">
                      <span className="text-ink-3">#</span>
                      <span className="text-ink-3">Reps</span>
                      <span className="text-ink-3">Peso (kg)</span>
                      <span />
                      {list.map((s, i) => (
                        <SetRow
                          key={s.id}
                          index={i + 1}
                          set={s}
                          onChange={(patch) =>
                            void sets.update(s.id, patch).catch((e) => toast.error(friendlyError(e)))
                          }
                          onDelete={() =>
                            void sets.remove(s.id).catch((e) => toast.error(friendlyError(e)))
                          }
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <Field label="Notas">
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Cómo te has encontrado, molestias…"
            />
          </Field>
        </div>
      </Drawer>

      <ExercisePicker open={picker} onClose={() => setPicker(false)} onPick={(ex) => void addExercise(ex)} />
    </>
  )
}

function SetRow({
  index,
  set,
  onChange,
  onDelete,
}: {
  index: number
  set: WorkoutSet
  onChange: (patch: Record<string, unknown>) => void
  onDelete: () => void
}) {
  const [reps, setReps] = useState(set.reps?.toString() ?? '')
  const [weight, setWeight] = useState(set.weight_kg?.toString() ?? '')

  return (
    <>
      <span className="tnum text-center text-ink-3">{index}</span>
      <Input
        type="number"
        inputMode="numeric"
        value={reps}
        onChange={(e) => setReps(e.target.value)}
        onBlur={() => onChange({ reps: reps === '' ? null : Number(reps) })}
        className="h-9 py-0 text-center tnum"
        placeholder="10"
      />
      <Input
        type="number"
        inputMode="decimal"
        step="0.5"
        value={weight}
        onChange={(e) => setWeight(e.target.value)}
        onBlur={() => onChange({ weight_kg: weight === '' ? null : Number(weight) })}
        className="h-9 py-0 text-center tnum"
        placeholder="60"
      />
      <IconButton label={`Borrar serie ${index}`} onClick={onDelete} className="size-8">
        <Trash2 className="size-3.5" />
      </IconButton>
    </>
  )
}

/* ========================================================================== */
/*  RUTINAS                                                                    */
/* ========================================================================== */

const EMOJIS = ['🏋️', '🦵', '💪', '🔥', '🧘', '🏃', '🤸', '⚡']

function Rutinas() {
  const toast = useToast()
  const confirm = useConfirm()
  const [open, setOpen] = useState<Routine | null>(null)
  const [name, setName] = useState('')

  const routines = useCollection<Routine>('routines', { shape: (q) => q.order('name') })

  async function create() {
    const clean = name.trim()
    if (!clean) return
    try {
      const created = await routines.insert({
        name: clean,
        emoji: EMOJIS[routines.rows.length % EMOJIS.length],
      })
      setName('')
      setOpen(created)
    } catch (e) {
      toast.error(friendlyError(e))
    }
  }

  async function removeRoutine(r: Routine) {
    const ok = await confirm({
      title: `¿Borrar “${r.name}”?`,
      message: 'Se borra la rutina y sus ejercicios. Las sesiones ya hechas se conservan.',
      confirmLabel: 'Borrar',
      danger: true,
    })
    if (!ok) return
    try {
      await routines.remove(r.id)
      toast.success('Rutina borrada')
    } catch (e) {
      toast.error(friendlyError(e))
    }
  }

  return (
    <div className="space-y-5">
      <Card className="p-3">
        <div className="flex gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void create()}
            placeholder="Nueva rutina: Torso A, Pierna, Full body…"
          />
          <Button variant="primary" onClick={() => void create()} icon={<Plus className="size-4" />}>
            Crear
          </Button>
        </div>
      </Card>

      {routines.error && <ErrorNote>{routines.error}</ErrorNote>}

      {routines.loading ? (
        <Spinner />
      ) : routines.rows.length === 0 ? (
        <EmptyState
          icon={<Dumbbell className="size-8" />}
          title="Sin rutinas todavía"
          description="Crea una, mete sus ejercicios con sus series, y luego entrenar es pulsar un botón."
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {routines.rows.map((r) => (
            <Card as="li" key={r.id} className="flex items-center gap-3 p-4">
              <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-accent-soft text-2xl">
                {r.emoji || '🏋️'}
              </span>
              <button onClick={() => setOpen(r)} className="min-w-0 flex-1 text-left">
                <p className="truncate font-display text-lg font-bold">{r.name}</p>
                {r.description && (
                  <p className="truncate text-[12px] text-ink-3">{r.description}</p>
                )}
              </button>
              <IconButton label="Editar" onClick={() => setOpen(r)}>
                <Pencil className="size-4" />
              </IconButton>
              <IconButton label="Borrar" onClick={() => void removeRoutine(r)}>
                <Trash2 className="size-4" />
              </IconButton>
            </Card>
          ))}
        </ul>
      )}

      {open && <RoutineEditor routine={open} onClose={() => setOpen(null)} />}
    </div>
  )
}

function RoutineEditor({ routine, onClose }: { routine: Routine; onClose: () => void }) {
  const toast = useToast()
  const [picker, setPicker] = useState(false)

  const exercises = useCollection<RoutineExercise>('routine_exercises', {
    scopeToUser: false,
    shape: (q) => q.eq('routine_id', routine.id).order('sort_order'),
    deps: [routine.id],
  })

  async function add(ex: Exercise) {
    try {
      await exercises.insert({
        routine_id: routine.id,
        exercise_id: ex.id,
        name: ex.name,
        muscle_group: ex.target,
        sort_order: exercises.rows.length,
      })
    } catch (e) {
      toast.error(friendlyError(e))
    }
  }

  return (
    <>
      <Drawer
        open
        onClose={onClose}
        width="lg"
        title={`${routine.emoji || '🏋️'} ${routine.name}`}
        subtitle="Ejercicios y series objetivo. Al entrenar se precargan solos."
        footer={
          <>
            <Button variant="outline" icon={<Plus className="size-4" />} onClick={() => setPicker(true)}>
              Añadir ejercicio
            </Button>
            <div className="flex-1" />
            <Button variant="primary" onClick={onClose}>
              Listo
            </Button>
          </>
        }
      >
        {exercises.loading ? (
          <Spinner label="Cargando…" />
        ) : exercises.rows.length === 0 ? (
          <EmptyState
            icon={<Zap className="size-7" />}
            title="Rutina vacía"
            description="Busca ejercicios en el catálogo: vienen con su animación para no dudar de la técnica."
            action={
              <Button variant="primary" onClick={() => setPicker(true)}>
                Buscar ejercicios
              </Button>
            }
          />
        ) : (
          <ul className="space-y-3">
            {exercises.rows.map((ex) => (
              <li key={ex.id} className="rounded-2xl border border-line bg-surface-2 p-3">
                <div className="flex items-center gap-3">
                  <ExerciseGif
                    exercise={{
                      gif_path: ex.exercise_id ? `${ex.exercise_id}.gif` : null,
                      name: ex.name,
                      body_part: ex.muscle_group,
                    }}
                    className="size-14"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">{ex.name}</p>
                    {ex.muscle_group && (
                      <p className="truncate text-[12px] text-ink-3">{ex.muscle_group}</p>
                    )}
                  </div>
                  <IconButton
                    label={`Quitar ${ex.name}`}
                    className="size-8"
                    onClick={() =>
                      void exercises.remove(ex.id).catch((e) => toast.error(friendlyError(e)))
                    }
                  >
                    <Trash2 className="size-3.5" />
                  </IconButton>
                </div>

                <div className="mt-3 grid grid-cols-4 gap-2">
                  <Field label="Series">
                    <Input
                      type="number"
                      min={1}
                      defaultValue={ex.target_sets}
                      className="h-9 py-0 text-center tnum"
                      onBlur={(e) =>
                        void exercises.update(ex.id, { target_sets: Number(e.target.value) || 1 })
                      }
                    />
                  </Field>
                  <Field label="Reps">
                    <Input
                      defaultValue={ex.target_reps}
                      className="h-9 py-0 text-center"
                      onBlur={(e) =>
                        void exercises.update(ex.id, { target_reps: e.target.value || '10' })
                      }
                    />
                  </Field>
                  <Field label="Peso">
                    <Input
                      type="number"
                      step="0.5"
                      defaultValue={ex.target_weight ?? ''}
                      className="h-9 py-0 text-center tnum"
                      onBlur={(e) =>
                        void exercises.update(ex.id, {
                          target_weight: e.target.value === '' ? null : Number(e.target.value),
                        })
                      }
                    />
                  </Field>
                  <Field label="Descanso">
                    <Input
                      type="number"
                      step="15"
                      defaultValue={ex.rest_seconds}
                      className="h-9 py-0 text-center tnum"
                      onBlur={(e) =>
                        void exercises.update(ex.id, { rest_seconds: Number(e.target.value) || 90 })
                      }
                    />
                  </Field>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Drawer>

      <ExercisePicker open={picker} onClose={() => setPicker(false)} onPick={(ex) => void add(ex)} />
    </>
  )
}
