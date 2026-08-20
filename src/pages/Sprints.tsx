import { useMemo, useState } from 'react'
import { motion } from 'motion/react'
import {
  CalendarRange,
  Flag,
  FolderKanban,
  ListChecks,
  Pencil,
  Plus,
  Rocket,
  Trash2,
  X,
} from 'lucide-react'
import {
  Badge,
  Button,
  Card,
  Checkbox,
  cx,
  Drawer,
  EmptyState,
  ErrorNote,
  Field,
  IconButton,
  Input,
  Modal,
  ProgressBar,
  ProgressRing,
  SectionTitle,
  Segmented,
  Select,
  Spinner,
  Textarea,
  useConfirm,
  useToast,
} from '@/components/ui'
import AnimatedNumber from '@/components/AnimatedNumber'
import { useCollection } from '@/hooks/useCollection'
import { friendlyError } from '@/lib/supabase'
import { daysUntil, longDate, shortDate, toISODate } from '@/lib/dates'
import {
  PROJECT_STATUS_LABEL,
  SPRINT_EMOJIS,
  SPRINT_STATUS_LABEL,
  TECH_COLOR,
  type Idea,
  type Project,
  type Sprint,
  type SprintStatus,
  type Task,
} from '@/lib/types'

const STATUSES = Object.keys(SPRINT_STATUS_LABEL) as SprintStatus[]

const STATUS_TONE: Record<SprintStatus, 'accent' | 'good' | 'neutral'> = {
  planificado: 'neutral',
  activo: 'accent',
  cerrado: 'good',
}

interface Contenido {
  tareas: Task[]
  hechas: number
  proyectos: Project[]
  ideas: Idea[]
}

/** Dos semanas por defecto: el largo clásico de un sprint. */
function porDefecto() {
  const inicio = new Date()
  const fin = new Date()
  fin.setDate(fin.getDate() + 13)
  return { start: toISODate(inicio), end: toISODate(fin) }
}

const emptyDraft = () => ({
  name: '',
  goal: '',
  emoji: SPRINT_EMOJIS[0] as string,
  status: 'planificado' as SprintStatus,
  ...porDefecto(),
})

/** Cuánto del sprint ha transcurrido ya, en porcentaje. */
function tiempoTranscurrido(s: Sprint) {
  const ini = new Date(s.start_date).getTime()
  const fin = new Date(s.end_date).getTime()
  const ahora = Date.now()
  if (ahora <= ini) return 0
  if (ahora >= fin || fin === ini) return 100
  return ((ahora - ini) / (fin - ini)) * 100
}

export default function Sprints() {
  const toast = useToast()
  const confirm = useConfirm()

  const [filtro, setFiltro] = useState<SprintStatus | 'todos'>('todos')
  const [open, setOpen] = useState(false)
  const [editando, setEditando] = useState<Sprint | null>(null)
  const [draft, setDraft] = useState(emptyDraft)
  const [guardando, setGuardando] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [detalle, setDetalle] = useState<Sprint | null>(null)

  const sprints = useCollection<Sprint>('sprints', {
    shape: (q) => q.order('start_date', { ascending: false }),
  })
  const tasks = useCollection<Task>('tasks', {})
  const projects = useCollection<Project>('projects', {})
  const ideas = useCollection<Idea>('ideas', {})

  /** Qué hay dentro de cada sprint y cuánto va cumplido. */
  const contenido = useMemo(() => {
    const map = new Map<string, Contenido>()
    const slot = (id: string) => {
      if (!map.has(id)) map.set(id, { tareas: [], hechas: 0, proyectos: [], ideas: [] })
      return map.get(id)!
    }
    for (const t of tasks.rows) {
      if (!t.sprint_id) continue
      const s = slot(t.sprint_id)
      s.tareas.push(t)
      if (t.status === 'done') s.hechas++
    }
    for (const p of projects.rows) if (p.sprint_id) slot(p.sprint_id).proyectos.push(p)
    for (const i of ideas.rows) if (i.sprint_id) slot(i.sprint_id).ideas.push(i)
    return map
  }, [tasks.rows, projects.rows, ideas.rows])

  /** Avance = tareas hechas sobre el total de tareas del sprint. */
  const avance = (s: Sprint) => {
    const c = contenido.get(s.id)
    if (!c || c.tareas.length === 0) return 0
    return (c.hechas / c.tareas.length) * 100
  }

  const activo = useMemo(
    () => sprints.rows.find((s) => s.status === 'activo') ?? null,
    [sprints.rows],
  )

  const cuentas = useMemo(() => {
    const m = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<SprintStatus, number>
    for (const s of sprints.rows) m[s.status]++
    return m
  }, [sprints.rows])

  const visibles = useMemo(
    () => (filtro === 'todos' ? sprints.rows : sprints.rows.filter((s) => s.status === filtro)),
    [sprints.rows, filtro],
  )

  function abrirNuevo() {
    setEditando(null)
    setDraft(emptyDraft())
    setFormError(null)
    setOpen(true)
  }

  function abrirEdicion(s: Sprint) {
    setEditando(s)
    setDraft({
      name: s.name,
      goal: s.goal ?? '',
      emoji: s.emoji,
      status: s.status,
      start: s.start_date,
      end: s.end_date,
    })
    setFormError(null)
    setOpen(true)
  }

  async function guardar() {
    if (!draft.name.trim()) return setFormError('Ponle un nombre al sprint.')
    if (draft.end < draft.start) {
      return setFormError('La fecha de fin no puede ser anterior a la de inicio.')
    }

    setGuardando(true)
    setFormError(null)
    try {
      const values = {
        name: draft.name.trim(),
        goal: draft.goal.trim() || null,
        emoji: draft.emoji,
        status: draft.status,
        start_date: draft.start,
        end_date: draft.end,
      }
      if (editando) await sprints.update(editando.id, values)
      else await sprints.insert({ ...values, sort_order: sprints.rows.length })
      setOpen(false)
      toast.success(editando ? 'Sprint actualizado' : 'Sprint creado')
    } catch (e) {
      setFormError(friendlyError(e))
    } finally {
      setGuardando(false)
    }
  }

  async function cambiarEstado(s: Sprint, status: SprintStatus) {
    try {
      // Solo puede haber un sprint activo: al activar uno, el anterior se cierra.
      if (status === 'activo') {
        const otro = sprints.rows.find((x) => x.status === 'activo' && x.id !== s.id)
        if (otro) {
          await sprints.update(otro.id, {
            status: 'cerrado',
            closed_at: new Date().toISOString(),
          })
        }
      }
      await sprints.update(s.id, {
        status,
        closed_at: status === 'cerrado' ? new Date().toISOString() : null,
      })
      setDetalle((d) => (d && d.id === s.id ? { ...d, status } : d))
    } catch (e) {
      toast.error(friendlyError(e))
    }
  }

  async function borrar(s: Sprint) {
    const ok = await confirm({
      title: '¿Borrar el sprint?',
      message: `Se eliminará “${s.name}”. Las tareas y proyectos que contenga no se borran: solo dejan de pertenecer a él.`,
      confirmLabel: 'Borrar',
      danger: true,
    })
    if (!ok) return
    try {
      await sprints.remove(s.id)
      setDetalle(null)
      toast.success('Sprint borrado')
    } catch (e) {
      toast.error(friendlyError(e))
    }
  }

  return (
    <div className="animate-rise">
      <SectionTitle
        hint="Bloques de tiempo con fecha. Dentro va lo que toca hacer en ese periodo."
        action={
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={abrirNuevo}>
            <span className="hidden sm:inline">Nuevo sprint</span>
            <span className="sm:hidden">Nuevo</span>
          </Button>
        }
      >
        Sprints
      </SectionTitle>

      {/* --- El sprint en marcha, a lo grande --------------------------------- */}
      {activo && (
        <SprintHero
          sprint={activo}
          contenido={contenido.get(activo.id)}
          avance={avance(activo)}
          onOpen={() => setDetalle(activo)}
        />
      )}

      <Segmented
        className="mb-5 flex max-w-full"
        value={filtro}
        onChange={setFiltro}
        options={[
          { value: 'todos', label: 'Todos', count: sprints.rows.length },
          ...STATUSES.map((s) => ({
            value: s,
            label: SPRINT_STATUS_LABEL[s],
            count: cuentas[s],
          })),
        ]}
      />

      {sprints.error && <ErrorNote>{sprints.error}</ErrorNote>}

      {sprints.loading ? (
        <Spinner />
      ) : visibles.length === 0 ? (
        <EmptyState
          icon={<Rocket className="size-8" />}
          title={filtro === 'todos' ? 'Todavía no hay sprints' : 'Nada en este estado'}
          description="Un sprint es un trozo de calendario con nombre. Le pones dos semanas, metes dentro lo que quieres sacar adelante, y sabes en qué centrarte."
          action={
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={abrirNuevo}>
              Crear el primero
            </Button>
          }
        />
      ) : (
        <ul className="stagger grid gap-4 sm:grid-cols-2 xl:grid-cols-3 [&>*]:min-w-0">
          {visibles.map((s) => {
            const c = contenido.get(s.id)
            const pct = avance(s)
            const dias = daysUntil(s.end_date)
            const cerrado = s.status === 'cerrado'

            return (
              <Card
                as="li"
                key={s.id}
                className={cx(
                  'card-hover flex flex-col overflow-hidden p-4 pt-5',
                  cerrado && 'opacity-70',
                  s.status === 'activo' && 'ring-2 ring-accent',
                )}
              >
                <span
                  aria-hidden
                  className="absolute inset-x-0 top-0 h-1"
                  style={{
                    background: s.status === 'activo' ? 'var(--grad)' : 'var(--line-strong)',
                  }}
                />

                <div className="flex items-start gap-3">
                  <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-surface-2 text-xl">
                    {s.emoji}
                  </span>
                  <button onClick={() => setDetalle(s)} className="min-w-0 flex-1 text-left">
                    <p className="truncate font-display text-lg leading-snug font-bold">{s.name}</p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-[12px] text-ink-3">
                      <CalendarRange className="size-3.5 shrink-0" />
                      <span className="truncate">
                        {shortDate(s.start_date)} — {shortDate(s.end_date)}
                      </span>
                    </p>
                  </button>
                  <IconButton label="Editar" onClick={() => abrirEdicion(s)}>
                    <Pencil className="size-4" />
                  </IconButton>
                </div>

                {s.goal && (
                  <p className="mt-2.5 line-clamp-2 text-[13px] leading-relaxed text-ink-3">
                    {s.goal}
                  </p>
                )}

                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <Badge tone={STATUS_TONE[s.status]}>{SPRINT_STATUS_LABEL[s.status]}</Badge>
                  {!cerrado && dias >= 0 && (
                    <Badge tone={dias <= 2 ? 'warn' : 'neutral'}>
                      {dias === 0 ? 'Acaba hoy' : `${dias} días`}
                    </Badge>
                  )}
                  {!cerrado && dias < 0 && <Badge tone="bad">Vencido</Badge>}
                </div>

                <div className="mt-auto pt-4">
                  <div className="mb-1.5 flex items-center justify-between text-[12px]">
                    <span className="text-ink-3">Avance</span>
                    <span className="tnum font-bold">{Math.round(pct)}%</span>
                  </div>
                  <ProgressBar value={pct} height={6} />

                  <p className="mt-3 flex flex-wrap items-center gap-x-3 text-[12px] text-ink-3">
                    <span className="inline-flex items-center gap-1">
                      <ListChecks className="size-3.5" />
                      <span className="tnum">
                        {c?.hechas ?? 0}/{c?.tareas.length ?? 0}
                      </span>
                    </span>
                    {(c?.proyectos.length ?? 0) > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <FolderKanban className="size-3.5" />
                        <span className="tnum">{c!.proyectos.length}</span>
                      </span>
                    )}
                  </p>
                </div>
              </Card>
            )
          })}
        </ul>
      )}

      {/* --- Detalle ---------------------------------------------------------- */}
      {detalle && (
        <SprintDrawer
          sprint={detalle}
          contenido={contenido.get(detalle.id)}
          avance={avance(detalle)}
          todasTareas={tasks.rows}
          todosProyectos={projects.rows}
          onClose={() => setDetalle(null)}
          onEstado={(st) => void cambiarEstado(detalle, st)}
          onEditar={() => {
            setDetalle(null)
            abrirEdicion(detalle)
          }}
          onBorrar={() => void borrar(detalle)}
          onAsignarTarea={(id, dentro) =>
            void tasks
              .update(id, { sprint_id: dentro ? detalle.id : null })
              .catch((e) => toast.error(friendlyError(e)))
          }
          onAsignarProyecto={(id, dentro) =>
            void projects
              .update(id, { sprint_id: dentro ? detalle.id : null })
              .catch((e) => toast.error(friendlyError(e)))
          }
          onMarcarTarea={(t) =>
            void tasks
              .update(t.id, {
                status: t.status === 'done' ? 'todo' : 'done',
                completed_at: t.status === 'done' ? null : new Date().toISOString(),
              })
              .catch((e) => toast.error(friendlyError(e)))
          }
        />
      )}

      {/* --- Alta / edición ---------------------------------------------------- */}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editando ? 'Editar sprint' : 'Nuevo sprint'}
        description="Un nombre, unas fechas y qué quieres haber logrado al cerrarlo."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button variant="primary" loading={guardando} onClick={() => void guardar()}>
              {editando ? 'Guardar' : 'Crear'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Nombre">
            <Input
              autoFocus
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="Sprint 1 · Arrancar la consultoría"
            />
          </Field>

          <Field label="Objetivo" hint="Qué quieres poder decir cuando lo cierres.">
            <Textarea
              rows={2}
              value={draft.goal}
              onChange={(e) => setDraft({ ...draft, goal: e.target.value })}
              placeholder="Tener la plantilla de incidencias lista para enseñar a un cliente."
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Empieza">
              <Input
                type="date"
                value={draft.start}
                onChange={(e) => setDraft({ ...draft, start: e.target.value })}
              />
            </Field>
            <Field label="Acaba">
              <Input
                type="date"
                value={draft.end}
                onChange={(e) => setDraft({ ...draft, end: e.target.value })}
              />
            </Field>
          </div>

          <Field label="Icono">
            <div className="flex flex-wrap gap-2">
              {SPRINT_EMOJIS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => setDraft({ ...draft, emoji: e })}
                  className={cx(
                    'grid size-11 place-items-center rounded-2xl border text-xl transition-all',
                    draft.emoji === e
                      ? 'scale-105 border-accent bg-accent-soft'
                      : 'border-line bg-surface-2 hover:border-line-strong',
                  )}
                >
                  {e}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Estado">
            <Select
              value={draft.status}
              onChange={(e) => setDraft({ ...draft, status: e.target.value as SprintStatus })}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {SPRINT_STATUS_LABEL[s]}
                </option>
              ))}
            </Select>
          </Field>

          {formError && <ErrorNote>{formError}</ErrorNote>}
        </div>
      </Modal>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  El sprint en marcha                                                        */
/* -------------------------------------------------------------------------- */

function SprintHero({
  sprint,
  contenido,
  avance,
  onOpen,
}: {
  sprint: Sprint
  contenido?: Contenido
  avance: number
  onOpen: () => void
}) {
  const dias = daysUntil(sprint.end_date)
  const transcurrido = tiempoTranscurrido(sprint)
  const pendientes = (contenido?.tareas.length ?? 0) - (contenido?.hechas ?? 0)

  return (
    <Card className="relative mb-5 overflow-hidden p-5 sm:p-6">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{ background: 'var(--grad)' }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-20 -right-16 size-64 animate-breathe rounded-full opacity-20 blur-3xl"
        style={{ background: 'var(--grad)' }}
      />

      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <span className="grid size-14 shrink-0 animate-float place-items-center rounded-3xl bg-surface text-3xl shadow-card">
            {sprint.emoji}
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-bold tracking-[0.14em] text-accent uppercase">
              Sprint en marcha
            </p>
            <button onClick={onOpen} className="block w-full min-w-0 text-left">
              <h2 className="truncate font-display text-2xl leading-tight font-bold sm:text-3xl">
                {sprint.name}
              </h2>
            </button>
            {sprint.goal && (
              <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-ink-2">
                {sprint.goal}
              </p>
            )}
            <p className="mt-1.5 flex items-center gap-1.5 text-[12px] text-ink-3">
              <CalendarRange className="size-3.5 shrink-0" />
              <span className="truncate">
                {longDate(sprint.start_date)} — {longDate(sprint.end_date)}
              </span>
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-5">
          <ProgressRing value={avance} size={72} stroke={7} />
          <div className="text-center">
            <p className="tnum font-display text-4xl leading-none font-bold text-accent">
              <AnimatedNumber value={Math.max(0, dias)} />
            </p>
            <p className="text-[12px] text-ink-3">
              {dias < 0 ? 'vencido' : dias === 1 ? 'día' : 'días'}
            </p>
          </div>
        </div>
      </div>

      {/* Línea de tiempo: el tiempo consumido frente a lo que llevas hecho.
          Si la barra gris va por delante de la de color, vas con retraso. */}
      <div className="relative mt-5">
        <div className="mb-1.5 flex items-center justify-between text-[12px]">
          <span className="text-ink-3">
            Tiempo consumido <span className="tnum font-bold">{Math.round(transcurrido)}%</span>
          </span>
          <span className="text-ink-3">
            {pendientes > 0 ? (
              <>
                Quedan <span className="tnum font-bold text-ink-2">{pendientes}</span> tareas
              </>
            ) : (
              'Todo hecho'
            )}
          </span>
        </div>
        <div className="relative h-2 overflow-hidden rounded-full bg-surface-3">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${transcurrido}%` }}
            transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
            className="h-full rounded-full bg-line-strong"
          />
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${avance}%` }}
            transition={{ duration: 0.9, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-y-0 left-0 rounded-full [background:var(--grad)]"
          />
        </div>
      </div>
    </Card>
  )
}

/* -------------------------------------------------------------------------- */
/*  Detalle del sprint                                                         */
/* -------------------------------------------------------------------------- */

function SprintDrawer({
  sprint,
  contenido,
  avance,
  todasTareas,
  todosProyectos,
  onClose,
  onEstado,
  onEditar,
  onBorrar,
  onAsignarTarea,
  onAsignarProyecto,
  onMarcarTarea,
}: {
  sprint: Sprint
  contenido?: Contenido
  avance: number
  todasTareas: Task[]
  todosProyectos: Project[]
  onClose: () => void
  onEstado: (s: SprintStatus) => void
  onEditar: () => void
  onBorrar: () => void
  onAsignarTarea: (id: string, dentro: boolean) => void
  onAsignarProyecto: (id: string, dentro: boolean) => void
  onMarcarTarea: (t: Task) => void
}) {
  const [tab, setTab] = useState<'tareas' | 'proyectos'>('tareas')
  const [anadir, setAnadir] = useState(false)

  const tareas = contenido?.tareas ?? []
  const proyectos = contenido?.proyectos ?? []
  const dias = daysUntil(sprint.end_date)

  // Lo que se puede meter: lo que no está ya aquí ni terminado.
  const disponiblesTareas = todasTareas.filter(
    (t) => t.sprint_id !== sprint.id && t.status !== 'done',
  )
  const disponiblesProyectos = todosProyectos.filter(
    (p) => p.sprint_id !== sprint.id && p.status !== 'completado',
  )

  return (
    <>
      <Drawer
        open
        onClose={onClose}
        width="lg"
        title={
          <span className="flex items-center gap-2.5">
            <span aria-hidden>{sprint.emoji}</span>
            {sprint.name}
          </span>
        }
        subtitle={
          <span className="flex flex-wrap items-center gap-1.5">
            <CalendarRange className="size-3.5" />
            {shortDate(sprint.start_date)} — {shortDate(sprint.end_date)}
            {sprint.status !== 'cerrado' && (
              <span className={cx('font-bold', dias < 0 ? 'text-bad' : 'text-accent')}>
                {dias < 0 ? 'vencido' : dias === 0 ? 'acaba hoy' : `quedan ${dias} días`}
              </span>
            )}
          </span>
        }
        footer={
          <>
            <Button
              variant="danger"
              size="sm"
              icon={<Trash2 className="size-4" />}
              onClick={onBorrar}
            >
              Borrar
            </Button>
            <div className="flex-1" />
            <Button variant="outline" icon={<Pencil className="size-4" />} onClick={onEditar}>
              Editar
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          {sprint.goal && (
            <div className="rounded-2xl bg-accent-soft p-4">
              <p className="flex items-center gap-1.5 text-[11px] font-bold tracking-wide text-accent uppercase">
                <Flag className="size-3.5" />
                Objetivo del sprint
              </p>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{sprint.goal}</p>
            </div>
          )}

          {/* --- Estado ------------------------------------------------------ */}
          <div>
            <p className="mb-2 text-[12px] font-bold tracking-wide text-ink-3 uppercase">Estado</p>
            <div className="grid grid-cols-3 gap-2">
              {STATUSES.map((s) => {
                const on = sprint.status === s
                return (
                  <button
                    key={s}
                    onClick={() => onEstado(s)}
                    className={cx(
                      'rounded-2xl px-3 py-2.5 text-[13px] font-bold transition-all',
                      on
                        ? 'text-accent-ink shadow-glow [background:var(--grad)]'
                        : 'bg-surface-2 text-ink-3 hover:text-ink',
                    )}
                  >
                    {SPRINT_STATUS_LABEL[s]}
                  </button>
                )
              })}
            </div>
            {sprint.status !== 'activo' && (
              <p className="mt-2 text-[12px] text-ink-3">
                Solo puede haber un sprint activo: al activar este, el anterior se cierra.
              </p>
            )}
          </div>

          {/* --- Avance ------------------------------------------------------ */}
          <div>
            <div className="mb-1.5 flex items-center justify-between text-[13px]">
              <span className="text-ink-3">Avance</span>
              <span className="tnum font-bold">
                {contenido?.hechas ?? 0} de {tareas.length} · {Math.round(avance)}%
              </span>
            </div>
            <ProgressBar value={avance} />
          </div>

          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              { value: 'tareas', label: 'Tareas', count: tareas.length },
              { value: 'proyectos', label: 'Proyectos', count: proyectos.length },
            ]}
          />

          <Button
            variant="outline"
            className="w-full"
            icon={<Plus className="size-4" />}
            onClick={() => setAnadir(true)}
          >
            Añadir {tab === 'tareas' ? 'tareas' : 'proyectos'} al sprint
          </Button>

          {tab === 'tareas' ? (
            tareas.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-line-strong px-4 py-8 text-center text-sm text-ink-3">
                Este sprint todavía no tiene tareas.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {tareas.map((t) => (
                  <li
                    key={t.id}
                    className="flex items-center gap-3 rounded-2xl border border-line bg-surface-2 px-3 py-2.5"
                  >
                    <Checkbox checked={t.status === 'done'} onChange={() => onMarcarTarea(t)} />
                    <span
                      className={cx(
                        'min-w-0 flex-1 truncate text-sm',
                        t.status === 'done' && 'text-ink-3 line-through decoration-2',
                      )}
                    >
                      {t.title}
                    </span>
                    <IconButton
                      label={`Sacar ${t.title} del sprint`}
                      className="size-8"
                      onClick={() => onAsignarTarea(t.id, false)}
                    >
                      <X className="size-3.5" />
                    </IconButton>
                  </li>
                ))}
              </ul>
            )
          ) : proyectos.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-line-strong px-4 py-8 text-center text-sm text-ink-3">
              Este sprint todavía no tiene proyectos.
            </p>
          ) : (
            <ul className="space-y-2">
              {proyectos.map((p) => (
                <li key={p.id} className="rounded-2xl border border-line bg-surface-2 p-3">
                  <div className="flex items-center gap-3">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold">{p.name}</span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[12px] text-ink-3">
                        {PROJECT_STATUS_LABEL[p.status]} ·{' '}
                        <span className="tnum">{p.progress}%</span>
                        {p.technologies.map((t) => (
                          <Badge key={t} color={TECH_COLOR[t]}>
                            {t}
                          </Badge>
                        ))}
                      </span>
                    </span>
                    <IconButton
                      label={`Sacar ${p.name} del sprint`}
                      className="size-8"
                      onClick={() => onAsignarProyecto(p.id, false)}
                    >
                      <X className="size-3.5" />
                    </IconButton>
                  </div>
                  <ProgressBar className="mt-2" value={p.progress} height={5} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </Drawer>

      {/* --- Selector de qué meter ------------------------------------------- */}
      <Modal
        open={anadir}
        onClose={() => setAnadir(false)}
        title={`Añadir ${tab === 'tareas' ? 'tareas' : 'proyectos'}`}
        description={`Se moverán al sprint “${sprint.name}”.`}
        footer={
          <Button variant="primary" onClick={() => setAnadir(false)}>
            Listo
          </Button>
        }
      >
        {tab === 'tareas' ? (
          disponiblesTareas.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-3">
              No hay tareas pendientes fuera de este sprint.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {disponiblesTareas.map((t) => (
                <li key={t.id}>
                  <button
                    onClick={() => onAsignarTarea(t.id, true)}
                    className="flex w-full items-center gap-3 rounded-2xl border border-line bg-surface-2 px-3 py-2.5 text-left transition-colors hover:border-accent hover:bg-accent-soft"
                  >
                    <Plus className="size-4 shrink-0 text-accent" />
                    <span className="min-w-0 flex-1 truncate text-sm">{t.title}</span>
                    {t.sprint_id && <Badge>En otro sprint</Badge>}
                    {t.is_backlog && <Badge>Backlog</Badge>}
                  </button>
                </li>
              ))}
            </ul>
          )
        ) : disponiblesProyectos.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-3">
            No hay proyectos sin terminar fuera de este sprint.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {disponiblesProyectos.map((p) => (
              <li key={p.id}>
                <button
                  onClick={() => onAsignarProyecto(p.id, true)}
                  className="flex w-full items-center gap-3 rounded-2xl border border-line bg-surface-2 px-3 py-2.5 text-left transition-colors hover:border-accent hover:bg-accent-soft"
                >
                  <Plus className="size-4 shrink-0 text-accent" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold">{p.name}</span>
                    <span className="block text-[12px] text-ink-3">
                      {PROJECT_STATUS_LABEL[p.status]} · {p.progress}%
                    </span>
                  </span>
                  {p.sprint_id && <Badge>En otro sprint</Badge>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </>
  )
}
