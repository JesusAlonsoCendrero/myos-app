import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  Archive,
  CalendarDays,
  Check,
  GripVertical,
  Link2,
  ListChecks,
  Moon,
  Plus,
  Star,
  Sun,
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
  SectionTitle,
  Segmented,
  Select,
  Spinner,
  Textarea,
  useConfirm,
  useToast,
} from '@/components/ui'
import { useCollection } from '@/hooks/useCollection'
import { useAuth } from '@/context/AuthContext'
import { arrastrarPendientes } from '@/lib/rollover'
import { db, friendlyError } from '@/lib/supabase'
import { humanDate, isOverdue, localDateOf, today } from '@/lib/dates'
import {
  GOAL_GROUPS,
  PRIORITY_LABEL,
  TECH_COLOR,
  type Project,
  type Task,
  type WeeklyGoal,
} from '@/lib/types'

type View = 'hoy' | 'backlog'

/** Cómo se ve el vínculo de una tarea con su objetivo o proyecto. */
interface LinkInfo {
  label: string
  color?: string
  emoji?: string
}

export default function Tareas() {
  const toast = useToast()
  const confirm = useConfirm()
  const { user } = useAuth()

  const [view, setView] = useState<View>('hoy')
  const [detail, setDetail] = useState<Task | null>(null)
  const [arrastradas, setArrastradas] = useState(0)
  const [quickTitle, setQuickTitle] = useState('')
  const [quickLink, setQuickLink] = useState('')
  const [adding, setAdding] = useState(false)

  const tasks = useCollection<Task>('tasks', {
    shape: (q) => q.order('sort_order').order('created_at', { ascending: false }),
  })

  const goals = useCollection<WeeklyGoal>('weekly_goals', {
    shape: (q) => q.order('week_start', { ascending: false }).limit(60),
  })

  const projects = useCollection<Project>('projects', {
    shape: (q) => q.neq('status', 'completado').order('name'),
  })

  // Al abrir: lo que quedó pendiente de días anteriores baja al backlog.
  // Sin candado de "efecto ya desmontado": en desarrollo React monta dos veces,
  // el primer montaje es el que mueve las filas y el candado se comería el aviso.
  useEffect(() => {
    if (!user) return
    arrastrarPendientes(user.id)
      .then((n) => {
        if (n === 0) return
        setArrastradas(n)
        void tasks.reload()
      })
      .catch(() => {
        // Si falla no pasa nada: se reintenta la próxima vez que abras Tareas.
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  /** Proyectos que has puesto en Mi día: se ven arriba, antes de las tareas. */
  const pinnedProjects = useMemo(
    () => projects.rows.filter((p) => p.my_day_date === today()),
    [projects.rows],
  )

  /** Mapa id → cómo pintarlo, para objetivos y proyectos a la vez. */
  const linkById = useMemo(() => {
    const map = new Map<string, LinkInfo>()
    for (const g of goals.rows) {
      map.set(`goal:${g.id}`, {
        label: g.title,
        color: g.tech ? TECH_COLOR[g.tech] : undefined,
        emoji: GOAL_GROUPS.find((x) => x.key === g.group_key)?.emoji,
      })
    }
    for (const p of projects.rows) map.set(`project:${p.id}`, { label: p.name, emoji: '📁' })
    return map
  }, [goals.rows, projects.rows])

  const linkOf = (t: Task): LinkInfo | undefined =>
    t.goal_id
      ? linkById.get(`goal:${t.goal_id}`)
      : t.project_id
        ? linkById.get(`project:${t.project_id}`)
        : undefined

  const taskCountByProject = useMemo(() => {
    const map = new Map<string, { done: number; total: number }>()
    for (const t of tasks.rows) {
      if (!t.project_id) continue
      const slot = map.get(t.project_id) ?? { done: 0, total: 0 }
      slot.total++
      if (t.status === 'done') slot.done++
      map.set(t.project_id, slot)
    }
    return map
  }, [tasks.rows])

  const iso = today()

  const pending = useMemo(() => {
    const base =
      view === 'backlog'
        ? tasks.rows.filter((t) => t.is_backlog && t.status !== 'done')
        : tasks.rows.filter(
            (t) =>
              !t.is_backlog &&
              t.status !== 'done' &&
              (t.my_day_date === iso || (t.due_date !== null && t.due_date <= iso)),
          )
    return [...base].sort((a, b) => a.sort_order - b.sort_order)
  }, [tasks.rows, view, iso])

  const completed = useMemo(
    () =>
      view === 'backlog'
        ? []
        : tasks.rows
            .filter((t) => t.status === 'done' && localDateOf(t.completed_at) === iso)
            .sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? '')),
    [tasks.rows, view, iso],
  )

  const counts = useMemo(
    () => ({
      hoy: tasks.rows.filter(
        (t) =>
          !t.is_backlog &&
          t.status !== 'done' &&
          (t.my_day_date === iso || (t.due_date !== null && t.due_date <= iso)),
      ).length,
      backlog: tasks.rows.filter((t) => t.is_backlog && t.status !== 'done').length,
    }),
    [tasks.rows, iso],
  )

  const sensors = useSensors(
    // Con el ratón se arrastra desde cualquier punto de la tarea: basta con
    // moverla 6 píxeles, así un clic seco sigue abriendo el detalle.
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    // Con el dedo hace falta mantener pulsado un momento; si no, un desliz para
    // bajar por la lista arrastraría la tarea en vez de mover la página.
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  async function onDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = pending.findIndex((t) => t.id === active.id)
    const newIndex = pending.findIndex((t) => t.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return

    const reordered = arrayMove(pending, oldIndex, newIndex)

    // Pintamos el nuevo orden ya, y lo persistimos después.
    const orderById = new Map(reordered.map((t, i) => [t.id, i]))
    tasks.setRows((prev) =>
      prev.map((t) => (orderById.has(t.id) ? { ...t, sort_order: orderById.get(t.id)! } : t)),
    )

    try {
      await Promise.all(
        reordered.map((t, i) => db().from('tasks').update({ sort_order: i }).eq('id', t.id)),
      )
    } catch (e) {
      toast.error(friendlyError(e))
      void tasks.reload()
    }
  }

  async function quickAdd(e: FormEvent) {
    e.preventDefault()
    const title = quickTitle.trim()
    if (!title) return
    setAdding(true)
    try {
      const [kind, id] = quickLink ? quickLink.split(':') : []
      // Lo nuevo entra arriba: un entero por debajo del menor que haya.
      // (Con un timestamp salía decimal y la columna es integer.)
      const topOrder = tasks.rows.reduce((min, t) => Math.min(min, t.sort_order), 0) - 1

      await tasks.insert({
        title,
        goal_id: kind === 'goal' ? id : null,
        project_id: kind === 'project' ? id : null,
        is_backlog: view === 'backlog',
        my_day_date: view === 'hoy' ? iso : null,
        sort_order: topOrder,
      })
      setQuickTitle('')
    } catch (err) {
      toast.error(friendlyError(err))
    } finally {
      setAdding(false)
    }
  }

  async function patch(task: Task, values: Partial<Task>) {
    try {
      await tasks.update(task.id, values as Record<string, unknown>)
      setDetail((d) => (d && d.id === task.id ? { ...d, ...values } : d))
    } catch (err) {
      toast.error(friendlyError(err))
    }
  }

  const toggleDone = (task: Task) =>
    patch(task, {
      status: task.status === 'done' ? 'todo' : 'done',
      completed_at: task.status === 'done' ? null : new Date().toISOString(),
    })

  async function removeTask(task: Task) {
    const ok = await confirm({
      title: '¿Borrar tarea?',
      message: `Se eliminará “${task.title}”.`,
      confirmLabel: 'Borrar',
      danger: true,
    })
    if (!ok) return
    try {
      await tasks.remove(task.id)
      setDetail(null)
      toast.success('Tarea borrada')
    } catch (err) {
      toast.error(friendlyError(err))
    }
  }

  return (
    <div className="animate-rise">
      <SectionTitle
        hint={
          view === 'hoy'
            ? 'Lo que has decidido hacer hoy. Arrastra para ordenarlo a tu gusto.'
            : 'El aparcadero de ideas. Cuando le llegue el turno, dale al sol.'
        }
      >
        Tareas
      </SectionTitle>

      <Segmented
        className="mb-4"
        value={view}
        onChange={setView}
        options={[
          { value: 'hoy', label: 'Mi día', count: counts.hoy },
          { value: 'backlog', label: 'Backlog', count: counts.backlog },
        ]}
      />

      {/* --- Alta rápida --------------------------------------------------- */}
      <Card className="mb-5 p-2">
        <form onSubmit={quickAdd} className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-2 px-2">
            <Plus className="size-5 shrink-0 text-accent" />
            <input
              value={quickTitle}
              onChange={(e) => setQuickTitle(e.target.value)}
              placeholder={
                view === 'backlog' ? 'Una idea para más adelante…' : '¿Qué toca hacer hoy?'
              }
              className="min-w-0 flex-1 bg-transparent py-2.5 text-sm placeholder:text-ink-3 focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-2">
            <Select
              value={quickLink}
              onChange={(e) => setQuickLink(e.target.value)}
              className="h-10 w-full py-0 text-[13px] sm:w-52"
              aria-label="Asociar a"
            >
              <option value="">Sin asociar</option>
              {goals.rows.length > 0 && (
                <optgroup label="Objetivos">
                  {goals.rows.map((g) => (
                    <option key={g.id} value={`goal:${g.id}`}>
                      {g.title}
                    </option>
                  ))}
                </optgroup>
              )}
              {projects.rows.length > 0 && (
                <optgroup label="Proyectos">
                  {projects.rows.map((p) => (
                    <option key={p.id} value={`project:${p.id}`}>
                      {p.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </Select>
            <Button type="submit" variant="primary" loading={adding}>
              Añadir
            </Button>
          </div>
        </form>
      </Card>

      {/* Aviso de lo que se ha arrastrado al backlog por no completarse. */}
      {arrastradas > 0 && (
        <Card className="animate-pop mb-5 flex items-center gap-3 p-3.5">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
            <Moon className="size-4.5" />
          </span>
          <p className="min-w-0 flex-1 text-[13px] leading-relaxed text-ink-2">
            <span className="font-bold">
              {arrastradas === 1 ? '1 tarea' : `${arrastradas} tareas`}
            </span>{' '}
            de días anteriores {arrastradas === 1 ? 'ha' : 'han'} vuelto al backlog. Tráete a Mi
            día lo que toque hoy.
          </p>
          {view === 'hoy' && (
            <Button size="sm" variant="outline" onClick={() => setView('backlog')}>
              Ver backlog
            </Button>
          )}
          <IconButton label="Cerrar aviso" onClick={() => setArrastradas(0)}>
            <X className="size-4" />
          </IconButton>
        </Card>
      )}

      {tasks.error && <ErrorNote>{tasks.error}</ErrorNote>}

      {/* Encabezado de la sección con el pulso del día. */}
      <div className="mb-3 flex items-end justify-between gap-4">
        <h2 className="font-display text-2xl leading-tight font-bold">
          {view === 'hoy' ? 'Mi día:' : 'Backlog:'}
        </h2>
        {view === 'hoy' && completed.length + pending.length > 0 && (
          <div className="flex items-center gap-2.5">
            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-surface-3">
              <div
                className="h-full rounded-full transition-[width] duration-700 ease-out [background:var(--grad)]"
                style={{
                  width: `${Math.round((completed.length / (completed.length + pending.length)) * 100)}%`,
                }}
              />
            </div>
            <span className="tnum text-[12px] font-bold text-ink-3">
              {completed.length}/{completed.length + pending.length}
            </span>
          </div>
        )}
      </div>

      {/* --- Proyectos fijados para hoy ------------------------------------- */}
      {view === 'hoy' && pinnedProjects.length > 0 && (
        <div className="mb-5">
          <h2 className="mb-2 px-1 text-[13px] font-bold tracking-wide text-ink-3 uppercase">
            Proyectos de hoy
          </h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {pinnedProjects.map((p) => {
              const stats = taskCountByProject.get(p.id)
              return (
                <Card as="li" key={p.id} className="flex items-center gap-3 p-3">
                  <span
                    className="grid size-10 shrink-0 place-items-center rounded-2xl text-lg"
                    style={{
                      backgroundColor: `${p.technologies[0] ? TECH_COLOR[p.technologies[0]] : 'var(--accent)'}22`,
                    }}
                  >
                    📁
                  </span>
                  <Link to="/proyectos" className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">{p.name}</p>
                    <p className="mt-0.5 flex items-center gap-2 text-[12px] text-ink-3">
                      <span className="tnum">{p.progress}%</span>
                      {stats && (
                        <span className="tnum">
                          · {stats.done}/{stats.total} tareas
                        </span>
                      )}
                    </p>
                  </Link>
                  <IconButton
                    label="Quitar de Mi día"
                    onClick={() =>
                      void projects
                        .update(p.id, { my_day_date: null })
                        .catch((e) => toast.error(friendlyError(e)))
                    }
                  >
                    <X className="size-4" />
                  </IconButton>
                </Card>
              )
            })}
          </ul>
        </div>
      )}

      {/* --- Lista ---------------------------------------------------------- */}
      {tasks.loading ? (
        <Spinner />
      ) : pending.length === 0 && completed.length === 0 ? (
        <EmptyState
          icon={view === 'backlog' ? <Archive className="size-8" /> : <ListChecks className="size-8" />}
          title={view === 'backlog' ? 'Backlog vacío' : 'Nada para hoy'}
          description={
            view === 'backlog'
              ? 'Suelta aquí lo que se te ocurra: un vídeo, un post, una investigación. Ya decidirás cuándo.'
              : 'Día limpio. Si te sobra energía, mira el backlog.'
          }
        />
      ) : (
        <div className="space-y-6">
          {/* Medición por defecto (una vez al empezar el gesto): al reordenar
              dentro de una sola lista, volver a medir mientras las filas se
              apartan devuelve posiciones ya desplazadas y el hueco baila. */}
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={pending.map((t) => t.id)} strategy={verticalListSortingStrategy}>
              <ul className="stagger space-y-2">
                {pending.map((task) => (
                  <SortableTask
                    key={task.id}
                    task={task}
                    link={linkOf(task)}
                    onToggle={() => void toggleDone(task)}
                    onOpen={() => setDetail(task)}
                    onStar={() => void patch(task, { is_important: !task.is_important })}
                    onSun={() =>
                      void patch(
                        task,
                        task.is_backlog
                          ? { is_backlog: false, my_day_date: iso }
                          : { my_day_date: task.my_day_date === iso ? null : iso },
                      )
                    }
                    onArchive={
                      view === 'hoy'
                        ? () => void patch(task, { is_backlog: true, my_day_date: null })
                        : undefined
                    }
                    onDelete={() => void removeTask(task)}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>

          {completed.length > 0 && (
            <details open>
              <summary className="mb-2 flex cursor-pointer list-none items-center gap-2 text-[13px] font-bold tracking-wide text-ink-3 uppercase">
                <Check className="size-4" />
                Hechas hoy
                <span className="tnum">{completed.length}</span>
              </summary>
              <ul className="space-y-2">
                {completed.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    link={linkOf(task)}
                    onToggle={() => void toggleDone(task)}
                    onOpen={() => setDetail(task)}
                    onDelete={() => void removeTask(task)}
                  />
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {/* --- Detalle en panel lateral --------------------------------------- */}
      <TaskDrawer
        task={detail}
        goals={goals.rows}
        projects={projects.rows}
        onClose={() => setDetail(null)}
        onSave={(values) => detail && patch(detail, values)}
        onDelete={() => detail && void removeTask(detail)}
      />
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Fila arrastrable                                                           */
/* -------------------------------------------------------------------------- */

function SortableTask(props: TaskRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: props.task.id,
  })

  // El asa es la fila entera. Le quitamos el role="button" que trae dnd-kit:
  // dentro hay botones de verdad y un botón no puede contener otros. El
  // tabIndex se queda, que es lo que permite reordenar con el teclado.
  const { role: _role, 'aria-pressed': _pressed, ...a11y } = attributes

  return (
    <TaskRow
      {...props}
      ref={setNodeRef}
      style={{
        // Translate y no Transform: la lista es vertical, no hay escalado que
        // aplicar y así el navegador no recalcula nada de más en cada píxel.
        transform: CSS.Translate.toString(transform),
        // La que arrastras va pegada al puntero; las demás sí se deslizan al
        // hacerle sitio.
        transition: isDragging ? 'none' : transition,
      }}
      dragging={isDragging}
      handleProps={{ ...a11y, ...listeners }}
    />
  )
}

interface TaskRowProps {
  task: Task
  link?: LinkInfo
  onToggle: () => void
  onOpen: () => void
  onStar?: () => void
  onSun?: () => void
  onArchive?: () => void
  onDelete?: () => void
}

function TaskRow({
  task,
  link,
  onToggle,
  onOpen,
  onStar,
  onSun,
  onArchive,
  onDelete,
  ref,
  style,
  dragging,
  handleProps,
}: TaskRowProps & {
  ref?: React.Ref<HTMLLIElement>
  style?: React.CSSProperties
  dragging?: boolean
  handleProps?: Record<string, unknown>
}) {
  const done = task.status === 'done'
  const overdue = !done && isOverdue(task.due_date)
  const inMyDay = task.my_day_date === today()

  return (
    <li
      ref={ref}
      style={style}
      {...handleProps}
      className={cx(
        'group relative flex items-center gap-2 rounded-2xl bg-surface p-3 shadow-card',
        'transition-shadow duration-200 hover:shadow-lift',
        // touch-manipulation (y no touch-none) para que deslizar siga moviendo
        // la página: el arrastre con el dedo lo activa la pulsación mantenida.
        handleProps && 'cursor-grab touch-manipulation select-none active:cursor-grabbing',
        dragging && 'z-20 scale-[1.015] cursor-grabbing shadow-lift',
        done && 'opacity-60',
      )}
    >
      {handleProps && (
        <span
          aria-hidden
          className="shrink-0 p-1 text-ink-3 opacity-30 transition-opacity group-hover:opacity-70"
        >
          <GripVertical className="size-4" />
        </span>
      )}

      {/* Los controles no arrastran: paran el gesto antes de que empiece. */}
      <div className="shrink-0" onPointerDown={(e) => e.stopPropagation()}>
        <Checkbox checked={done} onChange={onToggle} color={link?.color} />
      </div>

      <button onClick={onOpen} className="min-w-0 flex-1 py-0.5 text-left">
        <p className={cx('truncate text-sm font-medium', done && 'line-through decoration-2')}>
          {task.title}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12px] text-ink-3">
          {link && (
            <span className="inline-flex min-w-0 items-center gap-1">
              <span aria-hidden>{link.emoji ?? '🎯'}</span>
              <span className="max-w-40 truncate">{link.label}</span>
            </span>
          )}
          {task.due_date && (
            <span
              className={cx('inline-flex items-center gap-1', overdue && 'font-bold text-bad')}
            >
              <CalendarDays className="size-3.5" />
              {humanDate(task.due_date)}
            </span>
          )}
          {task.priority === 2 && <Badge tone="warn">{PRIORITY_LABEL[2]}</Badge>}
        </div>
      </button>

      <div className="flex shrink-0 items-center" onPointerDown={(e) => e.stopPropagation()}>
        {onSun && (
          <IconButton
            label={
              task.is_backlog
                ? 'Sacar del backlog y ponerlo en Mi día'
                : inMyDay
                  ? 'Quitar de Mi día'
                  : 'Añadir a Mi día'
            }
            onClick={onSun}
            className={inMyDay && !task.is_backlog ? 'text-joy' : ''}
          >
            <Sun className={cx('size-4', inMyDay && !task.is_backlog && 'fill-current')} />
          </IconButton>
        )}
        {onArchive && (
          <IconButton label="Mandar al backlog" onClick={onArchive}>
            <Archive className="size-4" />
          </IconButton>
        )}
        {onStar && (
          <IconButton
            label={task.is_important ? 'Quitar importancia' : 'Marcar importante'}
            onClick={onStar}
            className={task.is_important ? 'text-joy' : ''}
          >
            <Star className={cx('size-4', task.is_important && 'fill-current')} />
          </IconButton>
        )}
        {onDelete && (
          <IconButton label={`Borrar ${task.title}`} onClick={onDelete} className="hover:text-bad">
            <Trash2 className="size-4" />
          </IconButton>
        )}
      </div>
    </li>
  )
}

/* -------------------------------------------------------------------------- */
/*  Panel de detalle                                                           */
/* -------------------------------------------------------------------------- */

function TaskDrawer({
  task,
  goals,
  projects,
  onClose,
  onSave,
  onDelete,
}: {
  task: Task | null
  goals: WeeklyGoal[]
  projects: Project[]
  onClose: () => void
  onSave: (values: Partial<Task>) => void
  onDelete: () => void
}) {
  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [link, setLink] = useState('')
  const [due, setDue] = useState('')
  const [priority, setPriority] = useState('1')

  // Al cambiar de tarea recargamos el formulario con sus valores.
  useEffect(() => {
    if (!task) return
    setTitle(task.title)
    setNotes(task.notes ?? '')
    setLink(task.goal_id ? `goal:${task.goal_id}` : task.project_id ? `project:${task.project_id}` : '')
    setDue(task.due_date ?? '')
    setPriority(String(task.priority))
  }, [task])

  if (!task) return null

  const commit = () => {
    const [kind, id] = link ? link.split(':') : []
    onSave({
      title: title.trim() || task.title,
      notes: notes.trim() || null,
      goal_id: kind === 'goal' ? id : null,
      project_id: kind === 'project' ? id : null,
      due_date: due || null,
      priority: Number(priority),
    })
  }

  return (
    <Drawer
      open
      onClose={() => {
        commit()
        onClose()
      }}
      title="Tarea"
      subtitle={task.is_backlog ? 'En el backlog' : 'En Mi día'}
      footer={
        <>
          <Button variant="danger" size="sm" icon={<Trash2 className="size-4" />} onClick={onDelete}>
            Borrar
          </Button>
          <div className="flex-1" />
          <Button
            variant="primary"
            onClick={() => {
              commit()
              onClose()
            }}
          >
            Guardar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Título">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>

        <Field label="Asociada a" hint="Un objetivo de la semana o un proyecto.">
          <Select value={link} onChange={(e) => setLink(e.target.value)}>
            <option value="">Sin asociar</option>
            {goals.length > 0 && (
              <optgroup label="Objetivos">
                {goals.map((g) => (
                  <option key={g.id} value={`goal:${g.id}`}>
                    {g.title}
                  </option>
                ))}
              </optgroup>
            )}
            {projects.length > 0 && (
              <optgroup label="Proyectos">
                {projects.map((p) => (
                  <option key={p.id} value={`project:${p.id}`}>
                    {p.name}
                  </option>
                ))}
              </optgroup>
            )}
          </Select>
        </Field>

        <Field label="Notas">
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={6}
            placeholder="Enlaces, contexto, próximos pasos⬦"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Vence">
            <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </Field>
          <Field label="Prioridad">
            <Select value={priority} onChange={(e) => setPriority(e.target.value)}>
              {[2, 1, 0].map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABEL[p]}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="flex flex-wrap gap-2 border-t border-line pt-4">
          <Button
            size="sm"
            variant={task.my_day_date === today() && !task.is_backlog ? 'soft' : 'outline'}
            icon={<Sun className="size-4" />}
            onClick={() =>
              onSave(
                task.is_backlog
                  ? { is_backlog: false, my_day_date: today() }
                  : { my_day_date: task.my_day_date === today() ? null : today() },
              )
            }
          >
            {task.is_backlog ? 'Traer a Mi día' : 'Mi día'}
          </Button>
          <Button
            size="sm"
            variant={task.is_backlog ? 'soft' : 'outline'}
            icon={<Archive className="size-4" />}
            onClick={() => onSave({ is_backlog: !task.is_backlog, my_day_date: null })}
          >
            Backlog
          </Button>
          <Button
            size="sm"
            variant={task.is_important ? 'soft' : 'outline'}
            icon={<Star className={cx('size-4', task.is_important && 'fill-current')} />}
            onClick={() => onSave({ is_important: !task.is_important })}
          >
            Importante
          </Button>
        </div>

        {(task.goal_id || task.project_id) && (
          <p className="flex items-center gap-1.5 text-[12px] text-ink-3">
            <Link2 className="size-3.5" />
            Al completarla sube el avance de lo que tiene asociado.
          </p>
        )}
      </div>
    </Drawer>
  )
}
