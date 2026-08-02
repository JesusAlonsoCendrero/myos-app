import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronRight, Pause, Play, SkipForward, Timer, X } from 'lucide-react'
import { Button, Card, cx, IconButton, Spinner, useToast } from './ui'
import { ExerciseGif } from './ExercisePicker'
import { useCollection } from '@/hooks/useCollection'
import { db, friendlyError } from '@/lib/supabase'
import type { Buddy, RoutineExercise, Routine, WorkoutSet } from '@/lib/types'

const mmss = (s: number) =>
  `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`

/**
 * Pantalla de entrenamiento: cronómetro total, cronómetro del ejercicio actual y
 * descanso entre series. Va marcando series y pasando de ejercicio hasta acabar.
 */
export default function WorkoutPlayer({
  workoutId,
  routine,
  onFinish,
  onCancel,
}: {
  workoutId: string
  routine: Routine | null
  onFinish: (durationMin: number) => void
  onCancel: () => void
}) {
  const toast = useToast()
  const [elapsed, setElapsed] = useState(0)
  const [exerciseElapsed, setExerciseElapsed] = useState(0)
  const [rest, setRest] = useState<number | null>(null)
  const [paused, setPaused] = useState(false)
  const [index, setIndex] = useState(0)
  /** Persona cuyas series se están viendo. null = tú. */
  const [who, setWho] = useState<string | null>(null)

  const sets = useCollection<WorkoutSet>('workout_sets', {
    scopeToUser: false,
    shape: (q) => q.eq('workout_id', workoutId).order('sort_order').order('set_number'),
    deps: [workoutId],
  })

  const buddies = useCollection<Buddy>('buddies', { shape: (q) => q.order('name') })

  /** Quién entrena hoy: tú y los gymbros que tengan series en esta sesión. */
  const people = useMemo(() => {
    const ids = new Set(sets.rows.map((s) => s.buddy_id).filter(Boolean) as string[])
    return [
      { id: null as string | null, name: 'Tú', emoji: '🫵' },
      ...buddies.rows
        .filter((b) => ids.has(b.id))
        .map((b) => ({ id: b.id as string | null, name: b.name, emoji: b.emoji })),
    ]
  }, [sets.rows, buddies.rows])

  const plan = useCollection<RoutineExercise>('routine_exercises', {
    scopeToUser: false,
    shape: (q) => q.eq('routine_id', routine?.id ?? '').order('sort_order'),
    skip: !routine,
    deps: [routine?.id],
  })

  /**
   * Series agrupadas por ejercicio, solo las de la persona seleccionada.
   * El orden de los ejercicios es el mismo para todos, así que cambiar de
   * persona no te saca del ejercicio en el que vas.
   */
  const groups = useMemo(() => {
    const map = new Map<string, WorkoutSet[]>()
    for (const s of sets.rows) {
      if (s.buddy_id !== who) continue
      const list = map.get(s.exercise) ?? []
      list.push(s)
      map.set(s.exercise, list)
    }
    return [...map.entries()].map(([name, list]) => ({ name, list }))
  }, [sets.rows, who])

  const current = groups[index]
  const restSeconds =
    plan.rows.find((p) => p.name === current?.name)?.rest_seconds ?? 90

  const mine = sets.rows.filter((s) => s.buddy_id === who)
  const totalSets = mine.length
  const doneSets = mine.filter((s) => s.done).length

  // Un único intervalo mueve los tres relojes.
  useEffect(() => {
    if (paused) return
    const id = setInterval(() => {
      setElapsed((v) => v + 1)
      setExerciseElapsed((v) => v + 1)
      setRest((v) => (v === null ? null : v <= 1 ? null : v - 1))
    }, 1000)
    return () => clearInterval(id)
  }, [paused])

  // Aviso corto al terminar el descanso, sin archivos de sonido.
  const prevRest = useRef<number | null>(null)
  useEffect(() => {
    if (prevRest.current !== null && rest === null) beep()
    prevRest.current = rest
  }, [rest])

  async function markSet(set: WorkoutSet) {
    try {
      await sets.update(set.id, { done: !set.done })
      if (!set.done) setRest(restSeconds)
    } catch (e) {
      toast.error(friendlyError(e))
    }
  }

  function nextExercise() {
    if (index < groups.length - 1) {
      setIndex(index + 1)
      setExerciseElapsed(0)
      setRest(null)
    } else {
      void finish()
    }
  }

  async function finish() {
    const minutes = Math.max(1, Math.round(elapsed / 60))
    try {
      await db()
        .from('workouts')
        .update({ finished_at: new Date().toISOString(), duration_min: minutes })
        .eq('id', workoutId)
    } catch (e) {
      toast.error(friendlyError(e))
    }
    onFinish(minutes)
  }

  if (sets.loading) {
    return createPortal(
      <div className="fixed inset-0 z-50 grid place-items-center bg-paper">
        <Spinner label="Preparando la sesión…" />
      </div>,
      document.body,
    )
  }

  // A `body` obligatoriamente: cualquier ancestro con transform o backdrop-filter
  // secuestra el `position: fixed` y el reproductor acaba encajado en la página.
  return createPortal(
    // Cabecera y pie fijos, y solo el centro con scroll. Con `sticky` dentro de
    // un contenedor que ya scrollea, la cabecera se recortaba.
    <div className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-paper">
      {/* --- Cabecera con el reloj grande --------------------------------- */}
      <header className="safe-top shrink-0 border-b border-line bg-paper">
        <div className="mx-auto flex w-full max-w-2xl items-center gap-3 px-4 py-3">
          <IconButton label="Salir sin terminar" onClick={onCancel}>
            <X className="size-5" />
          </IconButton>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12px] font-bold tracking-wide text-ink-3 uppercase">
              {routine?.name ?? 'Entrenamiento'}
            </p>
            <p className="tnum text-[13px] text-ink-2">
              Ejercicio {Math.min(index + 1, groups.length)} de {groups.length} · {doneSets}/
              {totalSets} series
            </p>
          </div>
          <IconButton label={paused ? 'Reanudar' : 'Pausar'} onClick={() => setPaused(!paused)}>
            {paused ? <Play className="size-5" /> : <Pause className="size-5" />}
          </IconButton>
        </div>

        <div className="mx-auto w-full max-w-2xl px-4 pb-4">
          <div className="rounded-3xl bg-accent px-5 py-4 text-center">
            <p className="text-[11px] font-bold tracking-[0.18em] text-accent-ink/70 uppercase">
              Llevas entrenando
            </p>
            <p
              className={cx(
                'tnum font-display text-5xl leading-tight font-bold text-accent-ink sm:text-6xl',
                paused && 'animate-beat',
              )}
            >
              {mmss(elapsed)}
            </p>
            <p className="mt-1.5 inline-block rounded-full bg-accent-ink/15 px-3 py-1 text-[12px] font-bold text-accent-ink">
              {paused ? 'En pausa' : `En este ejercicio ${mmss(exerciseElapsed)}`}
            </p>
          </div>

          {/* Cambiar de persona para apuntar los pesos de cada uno. */}
          {people.length > 1 && (
            <div className="mt-3 flex gap-2">
              {people.map((p) => {
                const on = p.id === who
                const pending = sets.rows.filter((s) => s.buddy_id === p.id)
                const hechas = pending.filter((s) => s.done).length
                return (
                  <button
                    key={p.id ?? 'me'}
                    onClick={() => setWho(p.id)}
                    className={cx(
                      'flex flex-1 items-center justify-center gap-2 rounded-2xl border px-3 py-2.5 text-[13px] font-bold transition-colors',
                      on
                        ? 'border-accent bg-accent-soft text-accent'
                        : 'border-line bg-surface text-ink-3 hover:text-ink',
                    )}
                  >
                    <span className="text-base">{p.emoji}</span>
                    <span className="truncate">{p.name}</span>
                    <span className="tnum opacity-70">
                      {hechas}/{pending.length}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </header>

      {/* Solo esta zona hace scroll. */}
      <div className="min-h-0 flex-1 overflow-y-auto">

      {/* --- Descanso ------------------------------------------------------ */}
      {rest !== null && (
        <div className="mx-auto w-full max-w-2xl px-4 pt-4">
          <div className="flex items-center gap-3 rounded-3xl bg-joy-soft px-5 py-4">
            <Timer className="size-6 shrink-0 text-joy" />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-bold text-joy">Descansa</p>
              <p className="tnum font-display text-3xl leading-none font-bold text-joy">
                {mmss(rest)}
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={() => setRest(null)}>
              Saltar
            </Button>
          </div>
        </div>
      )}

      {/* --- Ejercicio actual ---------------------------------------------- */}
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-4">
        {!current ? (
          <Card className="p-8 text-center">
            <p className="font-display text-2xl font-bold">Esta sesión no tiene ejercicios</p>
            <p className="mt-2 text-sm text-ink-3">
              Sal, añade ejercicios a la sesión y vuelve a empezar.
            </p>
            <Button variant="primary" className="mt-5" onClick={onCancel}>
              Salir
            </Button>
          </Card>
        ) : (
          <>
            <Card className="p-4">
              <div className="flex items-center gap-4">
                <ExerciseGif
                  exercise={{
                    gif_path: planGif(plan.rows, current.name),
                    name: current.name,
                    body_part: null,
                  }}
                  className="size-24"
                />
                <div className="min-w-0">
                  <h2 className="font-display text-2xl leading-tight font-bold">{current.name}</h2>
                  <p className="mt-1 tnum text-[13px] text-ink-3">
                    {current.list.filter((s) => s.done).length} de {current.list.length} series ·
                    descanso {restSeconds}s
                  </p>
                </div>
              </div>

              <ul className="mt-4 space-y-2">
                {current.list.map((s, i) => (
                  <SetRow
                    key={s.id}
                    index={i + 1}
                    set={s}
                    onToggle={() => void markSet(s)}
                    onChange={(patch) =>
                      void sets.update(s.id, patch).catch((e) => toast.error(friendlyError(e)))
                    }
                  />
                ))}
              </ul>
            </Card>

            {groups[index + 1] && (
              <p className="mt-4 flex items-center gap-2 px-1 text-[13px] text-ink-3">
                <ChevronRight className="size-4" />
                Luego: <b className="text-ink-2">{groups[index + 1].name}</b>
              </p>
            )}
          </>
        )}
      </main>

      </div>

      {/* --- Acción principal ---------------------------------------------- */}
      {current && (
        <footer className="safe-bottom shrink-0 border-t border-line bg-paper px-4 py-3">
          <div className="mx-auto flex w-full max-w-2xl gap-2">
            <Button
              variant="outline"
              size="lg"
              icon={<SkipForward className="size-4" />}
              onClick={nextExercise}
            >
              Saltar
            </Button>
            <Button variant="primary" size="lg" className="flex-1" onClick={nextExercise}>
              {index < groups.length - 1 ? 'Siguiente ejercicio' : '¡Terminar entreno!'}
            </Button>
          </div>
        </footer>
      )}
    </div>,
    document.body,
  )
}

/**
 * Una serie: se marca hecha con el botón y se apuntan kilos y repeticiones sin
 * salir de aquí. Los del gymbro empiezan en blanco, así que hay que poder
 * escribirlos sobre la marcha.
 */
function SetRow({
  index,
  set,
  onToggle,
  onChange,
}: {
  index: number
  set: WorkoutSet
  onToggle: () => void
  onChange: (patch: Record<string, unknown>) => void
}) {
  const [weight, setWeight] = useState(set.weight_kg?.toString() ?? '')
  const [reps, setReps] = useState(set.reps?.toString() ?? '')

  useEffect(() => {
    setWeight(set.weight_kg?.toString() ?? '')
    setReps(set.reps?.toString() ?? '')
  }, [set.weight_kg, set.reps])

  const field =
    'h-11 w-full rounded-xl border border-line bg-surface px-2 text-center text-base font-bold tnum ' +
    'focus:border-accent focus:outline-none'

  return (
    <li
      className={cx(
        'flex items-center gap-2.5 rounded-2xl border px-3 py-2.5 transition-colors',
        set.done ? 'border-transparent bg-accent-soft' : 'border-line bg-surface-2',
      )}
    >
      <button
        onClick={onToggle}
        aria-label={set.done ? `Desmarcar serie ${index}` : `Marcar serie ${index} como hecha`}
        className={cx(
          'grid size-9 shrink-0 place-items-center rounded-full border-2 transition-colors',
          set.done ? 'border-transparent bg-accent' : 'border-line-strong',
        )}
      >
        {set.done && (
          <Check className="size-5 stroke-[3]" style={{ color: 'var(--accent-ink)' }} />
        )}
      </button>

      <span className={cx('w-14 shrink-0 text-[13px] font-bold', set.done && 'text-accent')}>
        Serie {index}
      </span>

      <label className="relative min-w-0 flex-1">
        <input
          type="number"
          inputMode="decimal"
          step="0.5"
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
          onBlur={() => onChange({ weight_kg: weight === '' ? null : Number(weight) })}
          placeholder="—"
          aria-label={`Kilos de la serie ${index}`}
          className={cx(field, 'pr-7')}
        />
        <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-[11px] font-semibold text-ink-3">
          kg
        </span>
      </label>

      <span className="shrink-0 text-ink-3">×</span>

      <label className="min-w-0 flex-1">
        <input
          type="number"
          inputMode="numeric"
          value={reps}
          onChange={(e) => setReps(e.target.value)}
          onBlur={() => onChange({ reps: reps === '' ? null : Number(reps) })}
          placeholder="—"
          aria-label={`Repeticiones de la serie ${index}`}
          className={field}
        />
      </label>
    </li>
  )
}

/** El GIF sale del plan de la rutina, que es quien conoce el ejercicio del catálogo. */
function planGif(plan: RoutineExercise[], name: string): string | null {
  const row = plan.find((p) => p.name === name)
  return row?.exercise_id ? `${row.exercise_id}.gif` : null
}

/** Pitido corto con la Web Audio API: sin archivos ni permisos. */
function beep() {
  try {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.value = 880
    gain.gain.setValueAtTime(0.2, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35)
    osc.start()
    osc.stop(ctx.currentTime + 0.35)
    setTimeout(() => void ctx.close(), 600)
  } catch {
    // Si el navegador no deja sonar sin interacción, no pasa nada.
  }
}
