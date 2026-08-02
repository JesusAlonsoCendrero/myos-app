import { useEffect, useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  LabelList,
} from 'recharts'
import { Dumbbell, FolderKanban, ListChecks, Plane, Target, Archive } from 'lucide-react'
import {
  Card,
  EmptyState,
  ErrorNote,
  SectionTitle,
  Segmented,
  Spinner,
} from '@/components/ui'
import {
  AXIS_PROPS,
  ChartCard,
  ChartTooltip,
  GRID_PROPS,
  LABEL_STYLE,
  Legend,
  StatTile,
} from '@/components/charts'
import { db, friendlyError } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { fromISODate, lastNWeeks, localDateOf, shiftWeek, today, weekStart } from '@/lib/dates'
import { CHART_COLORS, seriesColor } from '@/lib/palette'
import {
  GOAL_GROUPS,
  PROJECT_STATUS_LABEL,
  TECH_COLOR,
  TRIP_STATUS_LABEL,
  type Project,
  type ProjectStatus,
  type Task,
  type Trip,
  type WeeklyGoal,
} from '@/lib/types'

interface WorkoutWithSets {
  date: string
  workout_sets: Array<{ reps: number | null; weight_kg: number | null }> | null
}

interface Snapshot {
  tasks: Task[]
  goals: WeeklyGoal[]
  workouts: WorkoutWithSets[]
  projects: Project[]
  trips: Trip[]
}

const RANGES = [
  { value: '8', label: '8 semanas' },
  { value: '12', label: '12 semanas' },
  { value: '26', label: '6 meses' },
] as const

export default function Kpis() {
  const { user } = useAuth()
  const [weeks, setWeeks] = useState<'8' | '12' | '26'>('8')
  const [data, setData] = useState<Snapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const since = useMemo(() => shiftWeek(weekStart(), -(Number(weeks) - 1)), [weeks])

  useEffect(() => {
    if (!user) return
    let alive = true
    setLoading(true)
    setError(null)
    ;(async () => {
      try {
        const client = db()
        const [tasks, goals, workouts, projects, trips] = await Promise.all([
          client.from('tasks').select('*').eq('user_id', user.id),
          client.from('weekly_goals').select('*').eq('user_id', user.id).gte('week_start', since),
          client
            .from('workouts')
            .select('date, workout_sets(reps, weight_kg)')
            .eq('user_id', user.id)
            .gte('date', since),
          client.from('projects').select('*').eq('user_id', user.id),
          client.from('trips').select('*').eq('user_id', user.id),
        ])

        const failed = [tasks, goals, workouts, projects, trips].find((r) => r.error)
        if (failed?.error) throw failed.error
        if (!alive) return

        setData({
          tasks: (tasks.data ?? []) as Task[],
          goals: (goals.data ?? []) as WeeklyGoal[],
          workouts: (workouts.data ?? []) as unknown as WorkoutWithSets[],
          projects: (projects.data ?? []) as Project[],
          trips: (trips.data ?? []) as Trip[],
        })
      } catch (e) {
        if (alive) setError(friendlyError(e))
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [user, since])

  const model = useMemo(() => {
    if (!data) return null
    const buckets = lastNWeeks(Number(weeks))
    const labelOf = (iso: string) => iso.slice(8, 10) + '/' + iso.slice(5, 7)

    // El lunes de la semana a la que pertenece una fecha, en hora local.
    // Ojo: `new Date(...).toISOString()` pasa por UTC y en España resta un día.
    const weekOf = (iso: string) => weekStart(fromISODate(iso))

    // --- Tareas completadas por semana ---------------------------------
    const taskByWeek = new Map(buckets.map((w) => [w, 0]))
    for (const t of data.tasks) {
      if (t.status !== 'done' || !t.completed_at) continue
      const w = weekOf(localDateOf(t.completed_at)!)
      if (taskByWeek.has(w)) taskByWeek.set(w, taskByWeek.get(w)! + 1)
    }

    // --- Avance de cada objetivo según sus tareas ----------------------
    const taskStats = new Map<string, { done: number; total: number }>()
    for (const t of data.tasks) {
      if (!t.goal_id) continue
      const slot = taskStats.get(t.goal_id) ?? { done: 0, total: 0 }
      slot.total++
      if (t.status === 'done') slot.done++
      taskStats.set(t.goal_id, slot)
    }

    /** 1 = cumplido. Sin tareas, manda la casilla que marcas a mano. */
    const goalRatio = (g: WeeklyGoal) => {
      const p = taskStats.get(g.id)
      if (g.done) return 1
      if (!p || p.total === 0) return 0
      return p.done / p.total
    }

    // --- Cumplimiento de objetivos por semana --------------------------
    const goalByWeek = new Map(buckets.map((w) => [w, { sum: 0, n: 0 }]))
    for (const g of data.goals) {
      const slot = goalByWeek.get(g.week_start)
      if (!slot) continue
      slot.sum += goalRatio(g)
      slot.n += 1
    }

    // --- Gimnasio: sesiones y volumen por semana -----------------------
    const gymByWeek = new Map(buckets.map((w) => [w, { sessions: 0, volume: 0 }]))
    for (const w of data.workouts) {
      const slot = gymByWeek.get(weekOf(w.date))
      if (!slot) continue
      slot.sessions += 1
      for (const s of w.workout_sets ?? []) {
        slot.volume += (s.reps ?? 0) * Number(s.weight_kg ?? 0)
      }
    }

    const weekly = buckets.map((w) => ({
      week: labelOf(w),
      iso: w,
      tareas: taskByWeek.get(w) ?? 0,
      objetivos: Math.round(
        ((goalByWeek.get(w)!.n ? goalByWeek.get(w)!.sum / goalByWeek.get(w)!.n : 0) as number) * 100,
      ),
      sesiones: gymByWeek.get(w)!.sessions,
      volumen: Math.round(gymByWeek.get(w)!.volume),
    }))

    // --- Tareas completadas por frente de trabajo ----------------------
    // Ya no hay categorías: una tarea hereda el grupo del objetivo que empuja.
    const goalById = new Map(data.goals.map((g) => [g.id, g]))
    const groupLabel = new Map(GOAL_GROUPS.map((g) => [g.key, `${g.emoji} ${g.short}`]))

    const perGroup = new Map<string, number>()
    const perTech = new Map<string, number>()
    for (const t of data.tasks) {
      if (t.status !== 'done') continue
      const goal = t.goal_id ? goalById.get(t.goal_id) : undefined
      const label = goal ? (groupLabel.get(goal.group_key) ?? 'Otros') : 'Sin asociar'
      perGroup.set(label, (perGroup.get(label) ?? 0) + 1)
      if (goal?.tech) perTech.set(goal.tech, (perTech.get(goal.tech) ?? 0) + 1)
    }

    const byGroup = [...perGroup.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)

    const byTech = [...perTech.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 7)

    // --- Proyectos por estado ------------------------------------------
    const projectStatuses = Object.keys(PROJECT_STATUS_LABEL) as ProjectStatus[]
    const byStatus = projectStatuses.map((s) => ({
      name: PROJECT_STATUS_LABEL[s],
      value: data.projects.filter((p) => p.status === s).length,
    }))

    // --- Titulares ------------------------------------------------------
    const currentWeek = weekStart()
    const currentGoals = data.goals.filter((g) => g.week_start === currentWeek)
    const goalPct = currentGoals.length
      ? Math.round((currentGoals.reduce((a, g) => a + goalRatio(g), 0) / currentGoals.length) * 100)
      : 0

    const month = today().slice(0, 7)
    const openTasks = data.tasks.filter((t) => !t.is_backlog && t.status !== 'done').length

    return {
      weekly,
      byGroup,
      byTech,
      byStatus,
      headline: {
        tareasSemana: weekly[weekly.length - 1]?.tareas ?? 0,
        objetivosPct: goalPct,
        sesionesMes: data.workouts.filter((w) => w.date.startsWith(month)).length,
        proyectosActivos: data.projects.filter((p) => p.status === 'activo').length,
        viajesPlaneados: data.trips.filter((t) => t.status !== 'idea').length,
        backlog: data.tasks.filter((t) => t.is_backlog).length,
        openTasks,
      },
      totals: {
        tasks: data.tasks.length,
        workouts: data.workouts.length,
        projects: data.projects.length,
        trips: data.trips.length,
      },
    }
  }, [data, weeks])

  const rangeLabel = RANGES.find((r) => r.value === weeks)!.label.toLowerCase()

  return (
    <div className="animate-rise">
      <SectionTitle
        hint="Cómo vas de verdad, sin autoengaños. Cada tarjeta se puede leer también como tabla."
        action={
          <Segmented value={weeks} onChange={setWeeks} options={RANGES.map((r) => ({ ...r }))} />
        }
      >
        Análisis
      </SectionTitle>

      {error && <ErrorNote>{error}</ErrorNote>}

      {loading || !model ? (
        <Spinner label="Calculando tus KPIs…" />
      ) : model.totals.tasks + model.totals.workouts + model.totals.projects + model.totals.trips ===
        0 ? (
        <EmptyState
          title="Todavía no hay nada que medir"
          description="En cuanto empieces a completar tareas, registrar entrenos y avanzar proyectos, esta pantalla se llena sola."
        />
      ) : (
        <div className="space-y-6">
          {/* --- Titulares ------------------------------------------------ */}
          <div className="stagger grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <StatTile
              icon={<Target className="size-3.5" />}
              label="Objetivos de esta semana"
              value={model.headline.objetivosPct}
              unit="%"
              tone={
                model.headline.objetivosPct >= 80
                  ? 'good'
                  : model.headline.objetivosPct >= 40
                    ? 'warn'
                    : 'bad'
              }
              hint="Según las tareas que llevas hechas de cada objetivo."
            />
            <StatTile
              icon={<ListChecks className="size-3.5" />}
              label="Tareas completadas"
              value={model.headline.tareasSemana}
              hint={`Esta semana · ${model.headline.openTasks} siguen abiertas`}
            />
            <StatTile
              icon={<Dumbbell className="size-3.5" />}
              label="Gimnasio este mes"
              value={model.headline.sesionesMes}
              unit="sesiones"
            />
            <StatTile
              icon={<FolderKanban className="size-3.5" />}
              label="Proyectos activos"
              value={model.headline.proyectosActivos}
              hint={`${model.totals.projects} en total, contando ideas`}
            />
            <StatTile
              icon={<Plane className="size-3.5" />}
              label="Viajes en marcha"
              value={model.headline.viajesPlaneados}
              hint="Planificando o ya reservados"
            />
            <StatTile
              icon={<Archive className="size-3.5" />}
              label="Backlog de ideas"
              value={model.headline.backlog}
              unit="tareas"
              hint="Aparcadas esperando su turno"
            />
          </div>

          {/* --- Series temporales --------------------------------------- */}
          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard
              title="Tareas completadas por semana"
              subtitle={`Últimas ${rangeLabel}`}
              data={model.weekly}
              columns={[
                { key: 'week', label: 'Semana' },
                { key: 'tareas', label: 'Tareas' },
              ]}
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={model.weekly} margin={{ top: 18, right: 6, bottom: 0, left: -18 }}>
                  <CartesianGrid {...GRID_PROPS} />
                  <XAxis dataKey="week" {...AXIS_PROPS} interval="preserveStartEnd" />
                  <YAxis {...AXIS_PROPS} allowDecimals={false} width={34} />
                  <Tooltip
                    cursor={{ fill: 'var(--surface-2)' }}
                    content={<ChartTooltip unit=" tareas" />}
                  />
                  <Bar
                    dataKey="tareas"
                    name="Tareas"
                    fill={CHART_COLORS[0]}
                    radius={[4, 4, 0, 0]}
                    maxBarSize={26}
                  >
                    <LabelList dataKey="tareas" position="top" {...LABEL_STYLE} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard
              title="Cumplimiento de objetivos semanales"
              subtitle="Porcentaje de objetivos cerrados cada semana"
              data={model.weekly}
              columns={[
                { key: 'week', label: 'Semana' },
                { key: 'objetivos', label: '% cumplido' },
              ]}
            >
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={model.weekly} margin={{ top: 18, right: 12, bottom: 0, left: -18 }}>
                  <CartesianGrid {...GRID_PROPS} />
                  <XAxis dataKey="week" {...AXIS_PROPS} interval="preserveStartEnd" />
                  <YAxis {...AXIS_PROPS} domain={[0, 100]} width={34} />
                  <Tooltip content={<ChartTooltip unit="%" />} />
                  <Line
                    type="monotone"
                    dataKey="objetivos"
                    name="Cumplimiento"
                    stroke={CHART_COLORS[2]}
                    strokeWidth={2}
                    dot={{ r: 4, strokeWidth: 2, fill: 'var(--surface)' }}
                    activeDot={{ r: 6 }}
                  >
                    <LabelList dataKey="objetivos" position="top" formatter={pct} {...LABEL_STYLE} />
                  </Line>
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard
              title="Asistencia al gimnasio"
              subtitle="Sesiones registradas cada semana"
              data={model.weekly}
              columns={[
                { key: 'week', label: 'Semana' },
                { key: 'sesiones', label: 'Sesiones' },
              ]}
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={model.weekly} margin={{ top: 18, right: 6, bottom: 0, left: -18 }}>
                  <CartesianGrid {...GRID_PROPS} />
                  <XAxis dataKey="week" {...AXIS_PROPS} interval="preserveStartEnd" />
                  <YAxis {...AXIS_PROPS} allowDecimals={false} width={34} />
                  <Tooltip
                    cursor={{ fill: 'var(--surface-2)' }}
                    content={<ChartTooltip unit=" sesiones" />}
                  />
                  <Bar
                    dataKey="sesiones"
                    name="Sesiones"
                    fill={CHART_COLORS[6]}
                    radius={[4, 4, 0, 0]}
                    maxBarSize={26}
                  >
                    <LabelList dataKey="sesiones" position="top" {...LABEL_STYLE} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard
              title="Volumen de entrenamiento"
              subtitle="Kilos totales movidos por semana (series × reps × peso)"
              data={model.weekly}
              columns={[
                { key: 'week', label: 'Semana' },
                { key: 'volumen', label: 'Kg' },
              ]}
            >
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={model.weekly} margin={{ top: 18, right: 12, bottom: 0, left: -6 }}>
                  <CartesianGrid {...GRID_PROPS} />
                  <XAxis dataKey="week" {...AXIS_PROPS} interval="preserveStartEnd" />
                  <YAxis {...AXIS_PROPS} width={46} tickFormatter={compact} />
                  <Tooltip content={<ChartTooltip unit=" kg" />} />
                  <Line
                    type="monotone"
                    dataKey="volumen"
                    name="Volumen"
                    stroke={CHART_COLORS[4]}
                    strokeWidth={2}
                    dot={{ r: 4, strokeWidth: 2, fill: 'var(--surface)' }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          {/* --- Reparto por frente de trabajo ---------------------------- */}
          <ChartCard
            title="Tareas completadas por frente"
            subtitle="Dónde se te está yendo el tiempo, según el objetivo que empujan"
            height={Math.max(180, model.byGroup.length * 42)}
            data={model.byGroup}
            columns={[
              { key: 'name', label: 'Frente' },
              { key: 'value', label: 'Tareas' },
            ]}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                layout="vertical"
                data={model.byGroup}
                margin={{ top: 0, right: 40, bottom: 0, left: 8 }}
              >
                <CartesianGrid {...GRID_PROPS} horizontal={false} vertical />
                <XAxis type="number" {...AXIS_PROPS} allowDecimals={false} hide />
                <YAxis
                  type="category"
                  dataKey="name"
                  {...AXIS_PROPS}
                  width={110}
                  tick={{ fill: 'var(--ink-2)', fontSize: 12 }}
                />
                <Tooltip
                  cursor={{ fill: 'var(--surface-2)' }}
                  content={<ChartTooltip unit=" tareas" />}
                />
                <Bar dataKey="value" name="Tareas" radius={[0, 4, 4, 0]} maxBarSize={22}>
                  {model.byGroup.map((_, i) => (
                    <Cell key={i} fill={seriesColor(i)} />
                  ))}
                  <LabelList dataKey="value" position="right" {...LABEL_STYLE} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Leyenda obligatoria: hay más de una serie de color en el gráfico. */}
          <Legend
            className="-mt-2 px-1"
            items={model.byGroup.map((c, i) => ({ label: c.name, color: seriesColor(i) }))}
          />

          {/* --- Reparto por tecnología ----------------------------------- */}
          {model.byTech.length > 0 && (
            <>
              <ChartCard
                title="Tareas completadas por tecnología"
                subtitle="En qué parte de Power Platform te estás especializando de verdad"
                height={Math.max(180, model.byTech.length * 42)}
                data={model.byTech}
                columns={[
                  { key: 'name', label: 'Tecnología' },
                  { key: 'value', label: 'Tareas' },
                ]}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    layout="vertical"
                    data={model.byTech}
                    margin={{ top: 0, right: 40, bottom: 0, left: 8 }}
                  >
                    <CartesianGrid {...GRID_PROPS} horizontal={false} vertical />
                    <XAxis type="number" {...AXIS_PROPS} allowDecimals={false} hide />
                    <YAxis
                      type="category"
                      dataKey="name"
                      {...AXIS_PROPS}
                      width={130}
                      tick={{ fill: 'var(--ink-2)', fontSize: 12 }}
                    />
                    <Tooltip
                      cursor={{ fill: 'var(--surface-2)' }}
                      content={<ChartTooltip unit=" tareas" />}
                    />
                    <Bar dataKey="value" name="Tareas" radius={[0, 4, 4, 0]} maxBarSize={22}>
                      {model.byTech.map((t, i) => (
                        <Cell key={i} fill={TECH_COLOR[t.name] ?? seriesColor(i)} />
                      ))}
                      <LabelList dataKey="value" position="right" {...LABEL_STYLE} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              <Legend
                className="-mt-2 px-1"
                items={model.byTech.map((t, i) => ({
                  label: t.name,
                  color: TECH_COLOR[t.name] ?? seriesColor(i),
                }))}
              />
            </>
          )}

          {/* --- Reparto de proyectos y viajes ---------------------------- */}
          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard
              title="Proyectos por estado"
              subtitle="De la idea suelta al proyecto terminado"
              height={200}
              data={model.byStatus}
              columns={[
                { key: 'name', label: 'Estado' },
                { key: 'value', label: 'Proyectos' },
              ]}
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={model.byStatus} margin={{ top: 18, right: 6, bottom: 0, left: -18 }}>
                  <CartesianGrid {...GRID_PROPS} />
                  <XAxis dataKey="name" {...AXIS_PROPS} />
                  <YAxis {...AXIS_PROPS} allowDecimals={false} width={34} />
                  <Tooltip
                    cursor={{ fill: 'var(--surface-2)' }}
                    content={<ChartTooltip unit=" proyectos" />}
                  />
                  <Bar dataKey="value" name="Proyectos" radius={[4, 4, 0, 0]} maxBarSize={40}>
                    {model.byStatus.map((_, i) => (
                      <Cell key={i} fill={seriesColor(i)} />
                    ))}
                    <LabelList dataKey="value" position="top" {...LABEL_STYLE} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <TripsSummary trips={data?.trips ?? []} />
          </div>
        </div>
      )}
    </div>
  )
}

const pct = (v: unknown) => `${v}%`
const compact = (v: number) =>
  v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : String(v)

function TripsSummary({ trips }: { trips: Trip[] }) {
  const rows = (Object.keys(TRIP_STATUS_LABEL) as Array<keyof typeof TRIP_STATUS_LABEL>).map(
    (s, i) => ({
      label: TRIP_STATUS_LABEL[s],
      value: trips.filter((t) => t.status === s).length,
      color: seriesColor(i),
    }),
  )
  const total = rows.reduce((a, r) => a + r.value, 0)
  const budget = trips.reduce((a, t) => a + Number(t.budget ?? 0), 0)

  return (
    <Card className="p-5">
      <h3 className="text-[15px] font-semibold text-ink">Viajes</h3>
      <p className="mt-0.5 text-[12px] text-ink-3">
        {total} destinos apuntados
        {budget > 0 &&
          ` · ${budget.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })} presupuestados`}
      </p>

      <ul className="mt-4 space-y-3">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center gap-3">
            <span
              className="size-2.5 shrink-0 rounded-[3px]"
              style={{ backgroundColor: r.color }}
              aria-hidden
            />
            <span className="w-28 shrink-0 text-[13px] text-ink-2">{r.label}</span>
            <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-3">
              <div
                className="h-full rounded-full transition-[width] duration-500"
                style={{
                  width: total ? `${(r.value / total) * 100}%` : '0%',
                  backgroundColor: r.color,
                }}
              />
            </div>
            <span className="tnum w-6 shrink-0 text-right text-[13px] font-semibold">{r.value}</span>
          </li>
        ))}
      </ul>
    </Card>
  )
}
