import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Dumbbell, FolderKanban, Plane, Target } from 'lucide-react'
import {
  Badge,
  Button,
  Card,
  Checkbox,
  cx,
  ProgressBar,
  ProgressRing,
  Spinner,
  useToast,
} from '@/components/ui'
import AnimatedNumber from '@/components/AnimatedNumber'
import { useCollection } from '@/hooks/useCollection'
import { useAuth } from '@/context/AuthContext'
import { friendlyError } from '@/lib/supabase'
import { daysUntil, greeting, humanDate, isOverdue, localDateOf, longDate, today, weekStart } from '@/lib/dates'
import {
  GOAL_GROUPS,
  PROJECT_STATUS_LABEL,
  TECH_COLOR,
  TRIP_STATUS_EMOJI,
  type Project,
  type Task,
  type Trip,
  type WeeklyGoal,
  type Workout,
} from '@/lib/types'
import { CHART_COLORS } from '@/lib/palette'

export default function Dashboard() {
  const { user } = useAuth()
  const toast = useToast()
  const iso = today()

  const goals = useCollection<WeeklyGoal>('weekly_goals', {
    shape: (q) => q.eq('week_start', weekStart()).order('sort_order'),
  })
  const tasks = useCollection<Task>('tasks', {
    shape: (q) => q.order('sort_order'),
  })
  const workouts = useCollection<Workout>('workouts', {
    shape: (q) => q.order('date', { ascending: false }).limit(40),
  })
  const projects = useCollection<Project>('projects', {
    shape: (q) => q.eq('status', 'activo').order('priority', { ascending: false }).limit(4),
  })
  const trips = useCollection<Trip>('trips', {
    shape: (q) => q.order('start_date', { nullsFirst: false }),
  })

  const goalById = useMemo(() => new Map(goals.rows.map((g) => [g.id, g])), [goals.rows])

  /** Avance de cada objetivo según sus tareas. */
  const progressByGoal = useMemo(() => {
    const map = new Map<string, { done: number; total: number }>()
    for (const t of tasks.rows) {
      if (!t.goal_id) continue
      const slot = map.get(t.goal_id) ?? { done: 0, total: 0 }
      slot.total++
      if (t.status === 'done') slot.done++
      map.set(t.goal_id, slot)
    }
    return map
  }, [tasks.rows])

  const goalDone = (g: WeeklyGoal) => {
    const p = progressByGoal.get(g.id)
    return g.done || (p !== undefined && p.total > 0 && p.done === p.total)
  }

  const goalPct = useMemo(() => {
    if (!goals.rows.length) return 0
    return (goals.rows.filter(goalDone).length / goals.rows.length) * 100
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goals.rows, progressByGoal])

  const todayTasks = useMemo(
    () =>
      tasks.rows
        .filter(
          (t) =>
            !t.is_backlog &&
            t.status !== 'done' &&
            (t.my_day_date === iso || (t.due_date !== null && t.due_date <= iso)),
        )
        .sort((a, b) => a.sort_order - b.sort_order)
        .slice(0, 6),
    [tasks.rows, iso],
  )

  const doneToday = useMemo(
    () => tasks.rows.filter((t) => t.status === 'done' && localDateOf(t.completed_at) === iso).length,
    [tasks.rows, iso],
  )

  const trainedToday = workouts.rows.some((w) => w.date === iso)
  const gymThisWeek = useMemo(
    () => workouts.rows.filter((w) => w.date >= weekStart()).length,
    [workouts.rows],
  )

  const nextTrip = useMemo(
    () =>
      trips.rows
        .filter((t) => t.start_date && daysUntil(t.start_date) >= 0)
        .sort((a, b) => a.start_date!.localeCompare(b.start_date!))[0] ?? null,
    [trips.rows],
  )

  const name = user?.email?.split('@')[0] ?? ''
  const loading = goals.loading && tasks.loading

  return (
    <div className="space-y-6">
      <header className="animate-rise">
        <p className="inline-flex max-w-full items-center gap-2 rounded-full bg-surface px-3 py-1 text-[11px] font-bold tracking-[0.08em] text-accent uppercase shadow-card sm:text-[12px] sm:tracking-[0.1em]">
          <span className="size-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
          <span className="truncate">{longDate(iso)}</span>
        </p>
        <h1 className="mt-3 font-display text-3xl leading-tight font-bold text-balance sm:mt-4 sm:text-4xl lg:text-5xl">
          {greeting()}
          {name && <span className="text-grad">, {name}</span>} :)
        </h1>
        <p className="mt-2 max-w-xl text-[14px] leading-relaxed text-ink-2 sm:text-[15px]">
          {todayTasks.length > 0
            ? `${todayTasks.length} ${todayTasks.length === 1 ? 'cosa' : 'cosas'} para hoy y ${Math.round(goalPct)}% de la semana cubierta.`
            : 'Nada urgente para hoy. Buen momento para empujar un proyecto o mirar el backlog.'}
        </p>
      </header>

      {loading ? (
        <Spinner />
      ) : (
        /* En móvil son dos columnas y el orden cambia: primero lo de hoy.
           `min-w-0` en los hijos evita que el contenido largo estire la rejilla. */
        <div className="stagger grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 [&>*]:min-w-0">
          {/* --- Objetivos ------------------------------------------------- */}
          <Card className="card-hover order-2 col-span-2 p-4 sm:p-5 lg:order-none lg:col-span-2">
            <div className="mb-4 flex items-center justify-between gap-2">
              <h2 className="flex min-w-0 items-center gap-2 font-display text-base font-bold sm:text-lg">
                <Target className="size-4 shrink-0 text-accent" />
                <span className="truncate">Objetivos de la semana</span>
              </h2>
              <Link to="/objetivos" className="shrink-0">
                <Button size="sm" variant="ghost">
                  <span className="hidden sm:inline">Ver todos</span>
                  <ArrowRight className="size-3.5" />
                </Button>
              </Link>
            </div>

            {goals.rows.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-line-strong px-4 py-8 text-center">
                <p className="text-sm text-ink-3">Semana en blanco. Define por dónde empiezas.</p>
                <Link to="/objetivos">
                  <Button size="sm" variant="primary" className="mt-3">
                    Definir objetivos
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="flex items-center gap-4 sm:gap-5">
                <div className="shrink-0">
                  <ProgressRing value={goalPct} size={64} stroke={6} />
                </div>
                <ul className="min-w-0 flex-1 space-y-2.5">
                  {goals.rows.slice(0, 4).map((g) => {
                    const p = progressByGoal.get(g.id)
                    const pct = p && p.total ? (p.done / p.total) * 100 : goalDone(g) ? 100 : 0
                    const meta = GOAL_GROUPS.find((x) => x.key === g.group_key)
                    return (
                      <li key={g.id} className="min-w-0">
                        <div className="mb-1 flex min-w-0 items-baseline justify-between gap-2">
                          <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">
                            <span className="mr-1" aria-hidden>
                              {meta?.emoji}
                            </span>
                            {g.title}
                          </span>
                          <span className="tnum shrink-0 text-[12px] text-ink-3">
                            {p ? `${p.done}/${p.total}` : goalDone(g) ? '✓' : '—'}
                          </span>
                        </div>
                        <ProgressBar
                          value={pct}
                          height={6}
                          color={g.tech ? TECH_COLOR[g.tech] : undefined}
                        />
                      </li>
                    )
                  })}
                  {goals.rows.length > 4 && (
                    <li className="text-[12px] text-ink-3">
                      +{goals.rows.length - 4} objetivo(s) más
                    </li>
                  )}
                </ul>
              </div>
            )}
          </Card>

          {/* --- Gimnasio --------------------------------------------------- */}
          <Card
            className={cx(
              'card-hover order-3 flex flex-col p-4 sm:p-5 lg:order-none',
              trainedToday && 'bg-accent-soft',
            )}
          >
            <h2 className="mb-2 flex items-center gap-2 font-display text-base font-bold sm:mb-3 sm:text-lg">
              <Dumbbell className="size-4 shrink-0 text-accent" />
              Gimnasio
            </h2>
            <div className="flex-1">
              <p className="tnum font-display text-4xl leading-none font-bold sm:text-6xl">
                <AnimatedNumber value={gymThisWeek} />
              </p>
              <p className="mt-1 text-[12px] leading-snug text-ink-2 sm:text-[13px]">
                {gymThisWeek === 1 ? 'sesión esta semana' : 'sesiones esta semana'}
              </p>
              <p className="mt-2 text-[12px] font-semibold sm:mt-3 sm:text-[13px]">
                {trainedToday ? 'Hoy ya has entrenado' : 'Hoy todavía no'}
              </p>
            </div>
            <Link to="/gimnasio" className="mt-3 sm:mt-4">
              <Button
                variant={trainedToday ? 'outline' : 'primary'}
                size="sm"
                className="w-full sm:h-10 sm:text-sm"
              >
                {trainedToday ? 'Ver' : 'Entrenar'}
              </Button>
            </Link>
          </Card>

          {/* --- Mi día ----------------------------------------------------- */}
          <Card className="card-hover order-1 col-span-2 p-4 sm:p-5 lg:order-none lg:col-span-2">
            <div className="mb-4 flex items-center justify-between gap-2">
              <h2 className="font-display text-base font-bold sm:text-lg">Mi día</h2>
              <span className="shrink-0 text-[12px] text-ink-3 sm:text-[13px]">
                <span className="tnum font-bold text-good">{doneToday}</span> hechas hoy
              </span>
            </div>

            {todayTasks.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-line-strong px-4 py-8 text-center">
                <p className="text-sm text-ink-3">Día limpio. Mira el backlog si te sobra energía.</p>
                <Link to="/tareas">
                  <Button size="sm" variant="outline" className="mt-3">
                    Ir a tareas
                  </Button>
                </Link>
              </div>
            ) : (
              <ul className="space-y-1.5">
                {todayTasks.map((t) => {
                  const goal = t.goal_id ? goalById.get(t.goal_id) : undefined
                  return (
                    /* En móvil el título va arriba y los detalles debajo:
                       en una sola línea no cabían tarea, objetivo y fecha. */
                    <li
                      key={t.id}
                      className="flex items-start gap-3 rounded-2xl border border-line bg-surface-2 px-3 py-2.5"
                    >
                      <span className="pt-0.5">
                        <Checkbox
                          checked={false}
                          color={goal?.tech ? TECH_COLOR[goal.tech] : undefined}
                          onChange={() =>
                            void tasks
                              .update(t.id, {
                                status: 'done',
                                completed_at: new Date().toISOString(),
                              })
                              .catch((e) => toast.error(friendlyError(e)))
                          }
                        />
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm">{t.title}</span>
                        {(goal || t.due_date) && (
                          <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 sm:hidden">
                            {goal && (
                              <Badge color={goal.tech ? TECH_COLOR[goal.tech] : undefined}>
                                {goal.title.length > 22 ? `${goal.title.slice(0, 22)}…` : goal.title}
                              </Badge>
                            )}
                            {t.due_date && (
                              <span
                                className={cx(
                                  'text-[12px]',
                                  isOverdue(t.due_date) ? 'font-bold text-bad' : 'text-ink-3',
                                )}
                              >
                                {humanDate(t.due_date)}
                              </span>
                            )}
                          </span>
                        )}
                      </span>

                      {/* A partir de tablet caben en la misma línea. */}
                      {goal && (
                        <span className="hidden shrink-0 sm:inline-flex">
                          <Badge color={goal.tech ? TECH_COLOR[goal.tech] : undefined}>
                            {goal.title.length > 18 ? `${goal.title.slice(0, 18)}…` : goal.title}
                          </Badge>
                        </span>
                      )}
                      {t.due_date && (
                        <span
                          className={cx(
                            'hidden shrink-0 text-[12px] sm:inline',
                            isOverdue(t.due_date) ? 'font-bold text-bad' : 'text-ink-3',
                          )}
                        >
                          {humanDate(t.due_date)}
                        </span>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>

          {/* --- Próximo viaje ---------------------------------------------- */}
          <Card className="card-hover order-4 flex flex-col p-4 sm:p-5 lg:order-none">
            <h2 className="mb-2 flex items-center gap-2 font-display text-base font-bold sm:mb-3 sm:text-lg">
              <Plane className="size-4 shrink-0 text-accent" />
              <span className="truncate">Próximo viaje</span>
            </h2>

            {nextTrip ? (
              <div className="min-w-0 flex-1">
                <p className="tnum font-display text-4xl leading-none font-bold text-joy sm:text-6xl">
                  <AnimatedNumber value={daysUntil(nextTrip.start_date!)} />
                </p>
                <p className="mt-1 text-[12px] text-ink-3 sm:text-[13px]">días para</p>
                <p className="mt-1.5 truncate font-display text-base font-bold sm:text-xl">
                  {TRIP_STATUS_EMOJI[nextTrip.status]} {nextTrip.destination}
                </p>
              </div>
            ) : (
              <div className="flex-1">
                <p className="text-[13px] leading-relaxed text-ink-3 sm:text-sm">
                  Ningún viaje con fecha. Tienes{' '}
                  <span className="font-bold text-ink">{trips.rows.length}</span> destino(s)
                  apuntados.
                </p>
              </div>
            )}

            <Link to="/viajes" className="mt-3 sm:mt-4">
              <Button variant="outline" size="sm" className="w-full sm:h-10 sm:text-sm">
                Ver viajes
              </Button>
            </Link>
          </Card>

          {/* --- Proyectos activos ------------------------------------------ */}
          {projects.rows.length > 0 && (
            <Card className="card-hover order-5 col-span-2 p-4 sm:p-5 lg:order-none lg:col-span-3">
              <div className="mb-4 flex items-center justify-between gap-2">
                <h2 className="flex min-w-0 items-center gap-2 font-display text-base font-bold sm:text-lg">
                  <FolderKanban className="size-4 shrink-0 text-accent" />
                  <span className="truncate">Proyectos activos</span>
                </h2>
                <Link to="/proyectos" className="shrink-0">
                  <Button size="sm" variant="ghost">
                    <span className="hidden sm:inline">Ver todos</span>
                    <ArrowRight className="size-3.5" />
                  </Button>
                </Link>
              </div>

              <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 [&>*]:min-w-0">
                {projects.rows.map((p, i) => (
                  <li key={p.id} className="rounded-2xl border border-line bg-surface-2 p-3">
                    <p className="truncate text-sm font-bold">{p.name}</p>
                    <p className="mt-0.5 text-[12px] text-ink-3">
                      {PROJECT_STATUS_LABEL[p.status]} · <span className="tnum">{p.progress}%</span>
                    </p>
                    <ProgressBar
                      className="mt-2"
                      value={p.progress}
                      height={5}
                      color={
                        p.technologies[0]
                          ? TECH_COLOR[p.technologies[0]]
                          : CHART_COLORS[i % CHART_COLORS.length]
                      }
                    />
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}
