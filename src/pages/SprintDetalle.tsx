import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { motion } from 'motion/react'
import {
  ArrowLeft,
  CalendarRange,
  Check,
  Flag,
  FolderKanban,
  ListChecks,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react'
import {
  Badge,
  Button,
  Card,
  Checkbox,
  cx,
  ErrorNote,
  Field,
  IconButton,
  Input,
  Modal,
  ProgressBar,
  ProgressRing,
  Segmented,
  Spinner,
  Textarea,
  useConfirm,
  useToast,
} from '@/components/ui'
import AnimatedNumber from '@/components/AnimatedNumber'
import Canvas from '@/components/Canvas'
import { useCollection } from '@/hooks/useCollection'
import { friendlyError } from '@/lib/supabase'
import { daysUntil, longDate } from '@/lib/dates'
import {
  PROJECT_STATUS_LABEL,
  SPRINT_EMOJIS,
  SPRINT_STATUS_LABEL,
  TECH_COLOR,
  type Project,
  type Sprint,
  type SprintStatus,
  type Task,
} from '@/lib/types'

const STATUSES = Object.keys(SPRINT_STATUS_LABEL) as SprintStatus[]
type Pestana = 'tareas' | 'proyectos' | 'notas'

/** Cuánto del sprint ha transcurrido ya, en porcentaje. */
function tiempoTranscurrido(s: Sprint) {
  const ini = new Date(s.start_date).getTime()
  const fin = new Date(s.end_date).getTime()
  const ahora = Date.now()
  if (ahora <= ini) return 0
  if (ahora >= fin || fin === ini) return 100
  return ((ahora - ini) / (fin - ini)) * 100
}

export default function SprintDetalle() {
  const { id = '' } = useParams()
  const navegar = useNavigate()
  const toast = useToast()
  const confirm = useConfirm()

  const [tab, setTab] = useState<Pestana>('tareas')
  const [nueva, setNueva] = useState('')
  const [creando, setCreando] = useState(false)
  const [traer, setTraer] = useState<'tareas' | 'proyectos' | null>(null)
  const [editar, setEditar] = useState(false)

  const sprints = useCollection<Sprint>('sprints', {})
  const tasks = useCollection<Task>('tasks', {})
  const projects = useCollection<Project>('projects', {})

  const sprint = useMemo(() => sprints.rows.find((s) => s.id === id) ?? null, [sprints.rows, id])

  const tareas = useMemo(
    () => tasks.rows.filter((t) => t.sprint_id === id).sort((a, b) => a.sort_order - b.sort_order),
    [tasks.rows, id],
  )
  const proyectos = useMemo(() => projects.rows.filter((p) => p.sprint_id === id), [projects.rows, id])

  const pendientes = tareas.filter((t) => t.status !== 'done')
  const hechas = tareas.filter((t) => t.status === 'done')
  const avance = tareas.length ? (hechas.length / tareas.length) * 100 : 0

  async function crearTarea(e: FormEvent) {
    e.preventDefault()
    const titulo = nueva.trim()
    if (!titulo) return
    setCreando(true)
    try {
      // Nace dentro del sprint y en el backlog: no ensucia Mi día hasta que
      // decidas hacerla hoy.
      const orden = tasks.rows.reduce((min, t) => Math.min(min, t.sort_order), 0) - 1
      await tasks.insert({ title: titulo, sprint_id: id, is_backlog: true, sort_order: orden })
      setNueva('')
    } catch (err) {
      toast.error(friendlyError(err))
    } finally {
      setCreando(false)
    }
  }

  const marcar = (t: Task) =>
    void tasks
      .update(t.id, {
        status: t.status === 'done' ? 'todo' : 'done',
        completed_at: t.status === 'done' ? null : new Date().toISOString(),
      })
      .catch((e) => toast.error(friendlyError(e)))

  const asignarTarea = (tid: string, dentro: boolean) =>
    void tasks
      .update(tid, { sprint_id: dentro ? id : null })
      .catch((e) => toast.error(friendlyError(e)))

  const asignarProyecto = (pid: string, dentro: boolean) =>
    void projects
      .update(pid, { sprint_id: dentro ? id : null })
      .catch((e) => toast.error(friendlyError(e)))

  async function cambiarEstado(status: SprintStatus) {
    if (!sprint) return
    try {
      // Solo puede haber un sprint activo: al activar este, el anterior se cierra.
      if (status === 'activo') {
        const otro = sprints.rows.find((x) => x.status === 'activo' && x.id !== id)
        if (otro) {
          await sprints.update(otro.id, { status: 'cerrado', closed_at: new Date().toISOString() })
        }
      }
      await sprints.update(id, {
        status,
        closed_at: status === 'cerrado' ? new Date().toISOString() : null,
      })
    } catch (e) {
      toast.error(friendlyError(e))
    }
  }

  async function borrar() {
    if (!sprint) return
    const ok = await confirm({
      title: '¿Borrar el sprint?',
      message: `Se eliminará “${sprint.name}”. Las tareas y proyectos que contenga no se borran: solo dejan de pertenecer a él.`,
      confirmLabel: 'Borrar',
      danger: true,
    })
    if (!ok) return
    try {
      await sprints.remove(id)
      toast.success('Sprint borrado')
      navegar('/sprints')
    } catch (e) {
      toast.error(friendlyError(e))
    }
  }

  if (sprints.loading) return <Spinner label="Abriendo el sprint…" />

  if (!sprint) {
    return (
      <div className="animate-rise">
        <Link to="/sprints">
          <Button variant="ghost" icon={<ArrowLeft className="size-4" />}>
            Volver a sprints
          </Button>
        </Link>
        <ErrorNote>Ese sprint ya no existe.</ErrorNote>
      </div>
    )
  }

  const dias = daysUntil(sprint.end_date)
  const transcurrido = tiempoTranscurrido(sprint)
  const cerrado = sprint.status === 'cerrado'

  return (
    <div className="animate-rise">
      <Link to="/sprints" className="inline-block">
        <Button variant="ghost" size="sm" icon={<ArrowLeft className="size-4" />}>
          Sprints
        </Button>
      </Link>

      {/* --- Cabecera del sprint --------------------------------------------- */}
      <Card className="relative mt-3 mb-5 overflow-hidden p-5 sm:p-6">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{ background: 'var(--grad)' }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 -right-16 size-72 animate-breathe rounded-full opacity-20 blur-3xl"
          style={{ background: 'var(--grad)' }}
        />

        <div className="relative">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-4">
              <span className="grid size-14 shrink-0 place-items-center rounded-3xl bg-surface text-3xl shadow-card">
                {sprint.emoji}
              </span>
              <div className="min-w-0">
                <h1 className="font-display text-2xl leading-tight font-bold sm:text-4xl">
                  {sprint.name}
                </h1>
                <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-ink-3">
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarRange className="size-3.5 shrink-0" />
                    {longDate(sprint.start_date)} — {longDate(sprint.end_date)}
                  </span>
                  {!cerrado && (
                    <span className={cx('font-bold', dias < 0 ? 'text-bad' : 'text-accent')}>
                      {dias < 0 ? 'vencido' : dias === 0 ? 'acaba hoy' : `quedan ${dias} días`}
                    </span>
                  )}
                </p>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1">
              <IconButton label="Editar sprint" onClick={() => setEditar(true)}>
                <Pencil className="size-4" />
              </IconButton>
              <IconButton label="Borrar sprint" onClick={() => void borrar()}>
                <Trash2 className="size-4" />
              </IconButton>
            </div>
          </div>

          {sprint.goal && (
            <div className="mt-5 rounded-2xl bg-accent-soft p-4">
              <p className="flex items-center gap-1.5 text-[11px] font-bold tracking-wide text-accent uppercase">
                <Flag className="size-3.5" />
                Objetivo del sprint
              </p>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{sprint.goal}</p>
            </div>
          )}

          {/* --- Cifras y estado --------------------------------------------- */}
          <div className="mt-5 grid gap-4 sm:grid-cols-[auto_1fr] sm:items-center">
            <div className="flex items-center gap-5">
              <ProgressRing value={avance} size={72} stroke={7} />
              <div>
                <p className="tnum font-display text-3xl leading-none font-bold">
                  <AnimatedNumber value={hechas.length} />
                  <span className="text-ink-3">/{tareas.length}</span>
                </p>
                <p className="text-[12px] text-ink-3">tareas hechas</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 sm:max-w-sm sm:justify-self-end">
              {STATUSES.map((s) => {
                const on = sprint.status === s
                return (
                  <button
                    key={s}
                    onClick={() => void cambiarEstado(s)}
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
          </div>

          {/* Tiempo consumido frente a lo hecho: si la gris adelanta, vas tarde. */}
          <div className="mt-5">
            <div className="mb-1.5 flex items-center justify-between text-[12px]">
              <span className="text-ink-3">
                Tiempo consumido <span className="tnum font-bold">{Math.round(transcurrido)}%</span>
              </span>
              <span className="text-ink-3">
                Avance <span className="tnum font-bold">{Math.round(avance)}%</span>
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
        </div>
      </Card>

      {/* --- Pestañas --------------------------------------------------------- */}
      <Segmented
        className="mb-5 flex max-w-full"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'tareas', label: 'Tareas', count: tareas.length },
          { value: 'proyectos', label: 'Proyectos', count: proyectos.length },
          { value: 'notas', label: 'Notas' },
        ]}
      />

      {/* --- Tareas ----------------------------------------------------------- */}
      {tab === 'tareas' && (
        <div className="space-y-4">
          <Card className="p-2">
            <form onSubmit={crearTarea} className="flex items-center gap-2">
              <Plus className="ml-2 size-5 shrink-0 text-accent" />
              <input
                value={nueva}
                onChange={(e) => setNueva(e.target.value)}
                placeholder="Escribe una tarea para este sprint…"
                className="min-w-0 flex-1 bg-transparent py-2.5 text-sm placeholder:text-ink-3 focus:outline-none"
              />
              <Button type="submit" variant="primary" loading={creando}>
                Añadir
              </Button>
            </form>
          </Card>

          <Button
            variant="outline"
            className="w-full"
            icon={<ListChecks className="size-4" />}
            onClick={() => setTraer('tareas')}
          >
            Traer tareas que ya tengo
          </Button>

          {tareas.length === 0 ? (
            <p className="rounded-3xl border border-dashed border-line-strong px-4 py-12 text-center text-sm text-ink-3">
              Este sprint todavía no tiene tareas. Escribe la primera arriba.
            </p>
          ) : (
            <div className="space-y-5">
              {pendientes.length > 0 && (
                <section>
                  <h2 className="mb-2 px-1 text-[13px] font-bold tracking-wide text-ink-3 uppercase">
                    Pendientes <span className="tnum">{pendientes.length}</span>
                  </h2>
                  <ul className="stagger space-y-2">
                    {pendientes.map((t) => (
                      <FilaTarea
                        key={t.id}
                        tarea={t}
                        onMarcar={() => marcar(t)}
                        onSacar={() => asignarTarea(t.id, false)}
                      />
                    ))}
                  </ul>
                </section>
              )}

              {hechas.length > 0 && (
                <section>
                  <h2 className="mb-2 flex items-center gap-1.5 px-1 text-[13px] font-bold tracking-wide text-ink-3 uppercase">
                    <Check className="size-4" />
                    Hechas <span className="tnum">{hechas.length}</span>
                  </h2>
                  <ul className="space-y-2">
                    {hechas.map((t) => (
                      <FilaTarea
                        key={t.id}
                        tarea={t}
                        onMarcar={() => marcar(t)}
                        onSacar={() => asignarTarea(t.id, false)}
                      />
                    ))}
                  </ul>
                </section>
              )}
            </div>
          )}
        </div>
      )}

      {/* --- Proyectos -------------------------------------------------------- */}
      {tab === 'proyectos' && (
        <div className="space-y-4">
          <Button
            variant="outline"
            className="w-full"
            icon={<FolderKanban className="size-4" />}
            onClick={() => setTraer('proyectos')}
          >
            Traer proyectos al sprint
          </Button>

          {proyectos.length === 0 ? (
            <p className="rounded-3xl border border-dashed border-line-strong px-4 py-12 text-center text-sm text-ink-3">
              Ningún proyecto asignado a este sprint.
            </p>
          ) : (
            <ul className="stagger grid gap-3 sm:grid-cols-2 [&>*]:min-w-0">
              {proyectos.map((p) => (
                <Card as="li" key={p.id} className="card-hover p-4">
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-display text-base font-bold">{p.name}</p>
                      <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[12px] text-ink-3">
                        <Badge>{PROJECT_STATUS_LABEL[p.status]}</Badge>
                        {p.technologies.map((t) => (
                          <Badge key={t} color={TECH_COLOR[t]}>
                            {t}
                          </Badge>
                        ))}
                      </p>
                    </div>
                    <IconButton
                      label={`Sacar ${p.name} del sprint`}
                      onClick={() => asignarProyecto(p.id, false)}
                    >
                      <X className="size-4" />
                    </IconButton>
                  </div>

                  <div className="mt-3">
                    <div className="mb-1.5 flex items-center justify-between text-[12px]">
                      <span className="text-ink-3">Avance</span>
                      <span className="tnum font-bold">{p.progress}%</span>
                    </div>
                    <ProgressBar value={p.progress} height={6} />
                  </div>
                </Card>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* --- Notas ------------------------------------------------------------ */}
      {tab === 'notas' && (
        <Canvas
          parentType="sprint"
          parentId={id}
          emptyHint="Lo que necesites tener a mano durante el sprint: decisiones, enlaces, lo que aprendiste, lo que dejaste a medias."
        />
      )}

      {/* --- Traer cosas ------------------------------------------------------ */}
      <SelectorTraer
        tipo={traer}
        sprintNombre={sprint.name}
        tareas={tasks.rows.filter((t) => t.sprint_id !== id && t.status !== 'done')}
        proyectos={projects.rows.filter((p) => p.sprint_id !== id && p.status !== 'completado')}
        onClose={() => setTraer(null)}
        onTarea={(tid) => asignarTarea(tid, true)}
        onProyecto={(pid) => asignarProyecto(pid, true)}
      />

      <EditarSprint
        sprint={editar ? sprint : null}
        onClose={() => setEditar(false)}
        onSave={(patch) => sprints.update(id, patch)}
      />
    </div>
  )
}

/* -------------------------------------------------------------------------- */

function FilaTarea({
  tarea,
  onMarcar,
  onSacar,
}: {
  tarea: Task
  onMarcar: () => void
  onSacar: () => void
}) {
  const hecha = tarea.status === 'done'
  return (
    <Card
      as="li"
      className={cx(
        'flex items-center gap-3 p-3 transition-shadow duration-200 hover:shadow-lift',
        hecha && 'opacity-60',
      )}
    >
      <Checkbox checked={hecha} onChange={onMarcar} />
      <span
        className={cx(
          'min-w-0 flex-1 truncate text-sm',
          hecha && 'text-ink-3 line-through decoration-2',
        )}
      >
        {tarea.title}
      </span>
      {tarea.is_backlog && <Badge>Backlog</Badge>}
      <IconButton label={`Sacar ${tarea.title} del sprint`} onClick={onSacar}>
        <X className="size-4" />
      </IconButton>
    </Card>
  )
}

/* -------------------------------------------------------------------------- */

function SelectorTraer({
  tipo,
  sprintNombre,
  tareas,
  proyectos,
  onClose,
  onTarea,
  onProyecto,
}: {
  tipo: 'tareas' | 'proyectos' | null
  sprintNombre: string
  tareas: Task[]
  proyectos: Project[]
  onClose: () => void
  onTarea: (id: string) => void
  onProyecto: (id: string) => void
}) {
  const esTareas = tipo === 'tareas'
  const lista = esTareas ? tareas : proyectos

  return (
    <Modal
      open={tipo !== null}
      onClose={onClose}
      title={`Traer ${esTareas ? 'tareas' : 'proyectos'}`}
      description={`Se moverán al sprint “${sprintNombre}”.`}
      footer={
        <Button variant="primary" onClick={onClose}>
          Listo
        </Button>
      }
    >
      {lista.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-3">
          No hay {esTareas ? 'tareas pendientes' : 'proyectos sin terminar'} fuera de este sprint.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {esTareas
            ? tareas.map((t) => (
                <li key={t.id}>
                  <button
                    onClick={() => onTarea(t.id)}
                    className="flex w-full items-center gap-3 rounded-2xl border border-line bg-surface-2 px-3 py-2.5 text-left transition-colors hover:border-accent hover:bg-accent-soft"
                  >
                    <Plus className="size-4 shrink-0 text-accent" />
                    <span className="min-w-0 flex-1 truncate text-sm">{t.title}</span>
                    {t.sprint_id && <Badge>En otro sprint</Badge>}
                    {t.is_backlog && <Badge>Backlog</Badge>}
                  </button>
                </li>
              ))
            : proyectos.map((p) => (
                <li key={p.id}>
                  <button
                    onClick={() => onProyecto(p.id)}
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
  )
}

/* -------------------------------------------------------------------------- */

function EditarSprint({
  sprint,
  onClose,
  onSave,
}: {
  sprint: Sprint | null
  onClose: () => void
  onSave: (patch: Record<string, unknown>) => Promise<void>
}) {
  const toast = useToast()
  const [draft, setDraft] = useState({ name: '', goal: '', emoji: '', start: '', end: '' })
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!sprint) return
    setDraft({
      name: sprint.name,
      goal: sprint.goal ?? '',
      emoji: sprint.emoji,
      start: sprint.start_date,
      end: sprint.end_date,
    })
    setError(null)
  }, [sprint])

  if (!sprint) return null

  async function guardar() {
    if (!draft.name.trim()) return setError('Ponle un nombre al sprint.')
    if (draft.end < draft.start) return setError('La fecha de fin no puede ser anterior a la de inicio.')

    setGuardando(true)
    try {
      await onSave({
        name: draft.name.trim(),
        goal: draft.goal.trim() || null,
        emoji: draft.emoji,
        start_date: draft.start,
        end_date: draft.end,
      })
      onClose()
      toast.success('Sprint actualizado')
    } catch (e) {
      setError(friendlyError(e))
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Editar sprint"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" loading={guardando} onClick={() => void guardar()}>
            Guardar
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
          />
        </Field>

        <Field label="Objetivo" hint="Qué quieres poder decir cuando lo cierres.">
          <Textarea
            rows={2}
            value={draft.goal}
            onChange={(e) => setDraft({ ...draft, goal: e.target.value })}
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

        {error && <ErrorNote>{error}</ErrorNote>}
      </div>
    </Modal>
  )
}
