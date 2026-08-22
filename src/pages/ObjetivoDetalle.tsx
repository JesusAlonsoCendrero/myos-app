import { useMemo } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  CalendarRange,
  ChevronsRight,
  FolderKanban,
  ListChecks,
  Trash2,
} from 'lucide-react'
import {
  Badge,
  Button,
  Card,
  Checkbox,
  cx,
  ErrorNote,
  IconButton,
  ProgressBar,
  Spinner,
  useConfirm,
  useToast,
} from '@/components/ui'
import Canvas from '@/components/Canvas'
import { useCollection } from '@/hooks/useCollection'
import { db, friendlyError } from '@/lib/supabase'
import { shiftWeek, weekLabel, weekNumberLabel } from '@/lib/dates'
import {
  GOAL_GROUPS,
  TECH_COLOR,
  type Project,
  type Task,
  type WeeklyGoal,
} from '@/lib/types'

export default function ObjetivoDetalle() {
  const { id = '' } = useParams()
  const navegar = useNavigate()
  const toast = useToast()
  const confirm = useConfirm()

  const goals = useCollection<WeeklyGoal>('weekly_goals', {})
  const tasks = useCollection<Task>('tasks', {})
  const projects = useCollection<Project>('projects', {})

  const goal = useMemo(() => goals.rows.find((g) => g.id === id) ?? null, [goals.rows, id])
  const suyas = useMemo(
    () => tasks.rows.filter((t) => t.goal_id === id).sort((a, b) => a.sort_order - b.sort_order),
    [tasks.rows, id],
  )
  const proyecto = goal?.project_id ? projects.rows.find((p) => p.id === goal.project_id) : undefined

  const hechas = suyas.filter((t) => t.status === 'done').length
  // Si cuelga de un proyecto, su avance es el que manda.
  const pct = proyecto ? proyecto.progress : suyas.length ? (hechas / suyas.length) * 100 : 0

  /** Marca el objetivo y, si vino del banco, cierra también la idea. */
  async function completar(done: boolean) {
    if (!goal) return
    try {
      await goals.update(goal.id, { done })
      if (goal.idea_id) {
        await db()
          .from('ideas')
          .update({
            status: done ? 'hecha' : 'en_curso',
            done_at: done ? new Date().toISOString() : null,
          })
          .eq('id', goal.idea_id)
      }
    } catch (e) {
      toast.error(friendlyError(e))
    }
  }

  async function aLaSiguiente() {
    if (!goal) return
    const destino = shiftWeek(goal.week_start, 1)
    try {
      await goals.update(goal.id, { week_start: destino })
      toast.success(`Pasa a la semana del ${weekLabel(destino)}`)
    } catch (e) {
      toast.error(friendlyError(e))
    }
  }

  async function borrar() {
    if (!goal) return
    const ok = await confirm({
      title: '¿Borrar el objetivo?',
      message: `Se eliminará “${goal.title}” y su lienzo. Las tareas asociadas no se borran.`,
      confirmLabel: 'Borrar',
      danger: true,
    })
    if (!ok) return
    try {
      await goals.remove(goal.id)
      toast.success('Objetivo borrado')
      navegar('/objetivos')
    } catch (e) {
      toast.error(friendlyError(e))
    }
  }

  if (goals.loading) return <Spinner label="Abriendo el objetivo…" />

  if (!goal) {
    return (
      <div className="animate-rise">
        <Link to="/objetivos">
          <Button variant="ghost" icon={<ArrowLeft className="size-4" />}>
            Volver a objetivos
          </Button>
        </Link>
        <ErrorNote>Ese objetivo ya no existe.</ErrorNote>
      </div>
    )
  }

  const grupo = GOAL_GROUPS.find((g) => g.key === goal.group_key) ?? GOAL_GROUPS[0]
  const color = goal.tech ? TECH_COLOR[goal.tech] : 'var(--accent)'

  return (
    <div className="animate-rise">
      <Link to="/objetivos" className="inline-block">
        <Button variant="ghost" size="sm" icon={<ArrowLeft className="size-4" />}>
          Objetivos
        </Button>
      </Link>

      {/* --- Cabecera --------------------------------------------------------- */}
      <Card className="relative mt-3 mb-6 overflow-hidden p-5 sm:p-6">
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 w-1.5"
          style={{ background: color }}
        />

        <div className="flex flex-wrap items-start justify-between gap-4 pl-3">
          <div className="flex min-w-0 items-start gap-4">
            <span className="pt-1.5">
              <Checkbox checked={goal.done} onChange={(v) => void completar(v)} color={color} />
            </span>
            <div className="min-w-0">
              <h1
                className={cx(
                  'font-display text-2xl leading-tight font-bold sm:text-4xl',
                  goal.done && 'text-ink-3 line-through decoration-2',
                )}
              >
                {goal.title}
              </h1>
              {goal.detail && (
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-2">{goal.detail}</p>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Badge>
                  <span aria-hidden>{grupo.emoji}</span>
                  {grupo.label}
                </Badge>
                {goal.tech && <Badge color={TECH_COLOR[goal.tech]}>{goal.tech}</Badge>}
                <span className="inline-flex items-center gap-1.5 text-[12px] text-ink-3">
                  <CalendarRange className="size-3.5" />
                  {weekNumberLabel(goal.week_start)} · {weekLabel(goal.week_start)}
                </span>
                {proyecto && (
                  <Link to="/proyectos">
                    <Badge tone="accent">
                      <FolderKanban className="size-3" />
                      {proyecto.name} · {proyecto.progress}%
                    </Badge>
                  </Link>
                )}
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <IconButton label="Mandar a la semana siguiente" onClick={() => void aLaSiguiente()}>
              <ChevronsRight className="size-4" />
            </IconButton>
            <IconButton label="Borrar objetivo" onClick={() => void borrar()}>
              <Trash2 className="size-4" />
            </IconButton>
          </div>
        </div>

        {(proyecto || suyas.length > 0) && (
          <div className="mt-5 pl-3">
            <div className="mb-1.5 flex items-center justify-between text-[12px]">
              <span className="inline-flex items-center gap-1.5 text-ink-3">
                <ListChecks className="size-3.5" />
                {suyas.length ? `${hechas}/${suyas.length} tareas` : 'Avance del proyecto'}
              </span>
              <span className="tnum font-bold">{Math.round(pct)}%</span>
            </div>
            <ProgressBar value={pct} height={6} color={goal.tech ? color : undefined} />
          </div>
        )}
      </Card>

      {/* --- Tareas que lo empujan -------------------------------------------- */}
      {suyas.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 px-1 text-[13px] font-bold tracking-wide text-ink-3 uppercase">
            Tareas asociadas
          </h2>
          <ul className="grid gap-2 sm:grid-cols-2 [&>*]:min-w-0">
            {suyas.map((t) => (
              <Card as="li" key={t.id} className="flex items-center gap-3 p-3">
                <span
                  aria-hidden
                  className={cx(
                    'size-2 shrink-0 rounded-full',
                    t.status === 'done'
                      ? 'bg-good'
                      : t.status === 'doing'
                        ? 'animate-beat bg-accent'
                        : 'bg-line-strong',
                  )}
                />
                <span
                  className={cx(
                    'min-w-0 flex-1 truncate text-sm',
                    t.status === 'done' && 'text-ink-3 line-through decoration-2',
                  )}
                >
                  {t.title}
                </span>
                {t.status === 'doing' && <Badge tone="accent">En curso</Badge>}
              </Card>
            ))}
          </ul>
        </section>
      )}

      {/* --- El lienzo, a lo ancho de la página -------------------------------- */}
      <h2 className="mb-3 px-1 font-display text-xl font-bold">Lienzo de trabajo</h2>
      <Canvas
        grande
        parentType="goal"
        parentId={goal.id}
        emptyHint="Guiones, ideas de miniatura, enlaces de referencia, lo que necesites tener a mano para sacar esto adelante."
      />
    </div>
  )
}
