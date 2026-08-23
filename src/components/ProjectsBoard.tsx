import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  CalendarClock,
  Check,
  Lightbulb,
  ListChecks,
  Pencil,
  Plus,
  Search,
  Sun,
  X,
} from 'lucide-react'
import {
  Badge,
  Button,
  Card,
  cx,
  EmptyState,
  ErrorNote,
  Field,
  IconButton,
  Input,
  Modal,
  ProgressBar,
  SectionTitle,
  Segmented,
  Select,
  Spinner,
  Textarea,
  useToast,
} from '@/components/ui'
import { useCollection } from '@/hooks/useCollection'
import { friendlyError } from '@/lib/supabase'
import { shortDate, today } from '@/lib/dates'
import {
  PRIORITY_LABEL,
  PROJECT_AREA_LABEL,
  PROJECT_STATUS_LABEL,
  TECH_COLOR,
  TECHNOLOGIES,
  type Project,
  type ProjectArea,
  type ProjectStatus,
  type Sprint,
  type Task,
} from '@/lib/types'
import { CHART_COLORS } from '@/lib/palette'

const STATUSES = Object.keys(PROJECT_STATUS_LABEL) as ProjectStatus[]
const AREAS = Object.keys(PROJECT_AREA_LABEL) as ProjectArea[]

const STATUS_COLOR: Record<ProjectStatus, string> = {
  idea: CHART_COLORS[1],
  planificado: CHART_COLORS[3],
  activo: CHART_COLORS[0],
  completado: CHART_COLORS[6],
}

const emptyDraft = {
  name: '',
  description: '',
  status: 'idea' as ProjectStatus,
  area: 'negocio' as ProjectArea,
  priority: '1',
  progress: '0',
  target_date: '',
  technologies: [] as string[],
}

/**
 * `embedded` lo dibuja sin su propia cabecera, para vivir dentro del frente
 * "Proyectos" del Banco de ideas.
 */
export default function ProjectsBoard({ embedded = false }: { embedded?: boolean } = {}) {
  const navegar = useNavigate()
  const toast = useToast()

  const [status, setStatus] = useState<ProjectStatus | 'todos'>('todos')
  const [techs, setTechs] = useState<string[]>([])
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Project | null>(null)
  const [draft, setDraft] = useState(emptyDraft)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const projects = useCollection<Project>('projects', {
    shape: (q) => q.order('priority', { ascending: false }).order('created_at', { ascending: false }),
  })

  const tasks = useCollection<Task>('tasks', {
    shape: (q) => q.not('project_id', 'is', null),
  })

  // Los sprints se ordenan por relevancia: primero el que está en marcha.
  const sprints = useCollection<Sprint>('sprints', {
    shape: (q) => q.order('start_date', { ascending: false }),
  })

  const sprintPorId = useMemo(
    () => new Map(sprints.rows.map((s) => [s.id, s])),
    [sprints.rows],
  )

  /** Tareas hechas / totales por proyecto, para el avance real. */
  const taskStats = useMemo(() => {
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

  const statusCounts = useMemo(() => {
    const map = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<ProjectStatus, number>
    for (const p of projects.rows) map[p.status]++
    return map
  }, [projects.rows])

  /** Cuántos proyectos usan cada tecnología: los que no se usan no se ofrecen. */
  const techCounts = useMemo(() => {
    const map = new Map<string, number>()
    for (const p of projects.rows) {
      for (const t of p.technologies) map.set(t, (map.get(t) ?? 0) + 1)
    }
    return map
  }, [projects.rows])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return projects.rows.filter((p) => {
      if (status !== 'todos' && p.status !== status) return false
      // Varias tecnologías marcadas = proyectos que usen al menos una.
      if (techs.length && !techs.some((t) => p.technologies.includes(t))) return false
      if (q && !`${p.name} ${p.description ?? ''}`.toLowerCase().includes(q)) return false
      return true
    })
  }, [projects.rows, status, techs, query])

  const filtering = status !== 'todos' || techs.length > 0 || query.trim() !== ''

  function openNew() {
    setEditing(null)
    setDraft(emptyDraft)
    setFormError(null)
    setOpen(true)
  }

  function openEdit(p: Project) {
    setEditing(p)
    setDraft({
      name: p.name,
      description: p.description ?? '',
      status: p.status,
      area: p.area,
      priority: String(p.priority),
      progress: String(p.progress),
      target_date: p.target_date ?? '',
      technologies: p.technologies ?? [],
    })
    setFormError(null)
    setOpen(true)
  }

  async function save() {
    if (!draft.name.trim()) return setFormError('El proyecto necesita un nombre.')
    setSaving(true)
    setFormError(null)
    try {
      const values = {
        name: draft.name.trim(),
        description: draft.description.trim() || null,
        status: draft.status,
        area: draft.area,
        priority: Number(draft.priority),
        progress: Math.max(0, Math.min(100, Number(draft.progress) || 0)),
        target_date: draft.target_date || null,
        technologies: draft.technologies,
        updated_at: new Date().toISOString(),
      }
      if (editing) await projects.update(editing.id, values)
      else await projects.insert(values)
      setOpen(false)
      toast.success(editing ? 'Proyecto actualizado' : 'Proyecto creado')
    } catch (e) {
      setFormError(friendlyError(e))
    } finally {
      setSaving(false)
    }
  }

  async function patch(p: Project, values: Partial<Project>) {
    try {
      await projects.update(p.id, values as Record<string, unknown>)
    } catch (e) {
      toast.error(friendlyError(e))
    }
  }

  return (
    <div className={embedded ? '' : 'animate-rise'}>
      {!embedded && (
        <SectionTitle
          hint="Desde la idea suelta hasta el proyecto en marcha."
          action={
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={openNew}>
              <span className="hidden sm:inline">Nuevo proyecto</span>
              <span className="sm:hidden">Nuevo</span>
            </Button>
          }
        >
          Proyectos
        </SectionTitle>
      )}

      {/* --- Buscador ------------------------------------------------------ */}
      <div className="mb-3 flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-3" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nombre o descripción…"
            className="pl-10"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              aria-label="Limpiar la búsqueda"
              className="absolute top-1/2 right-3 grid size-6 -translate-y-1/2 place-items-center rounded-full text-ink-3 hover:bg-surface-2"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
        {embedded && (
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={openNew}>
            <span className="hidden sm:inline">Nuevo proyecto</span>
            <span className="sm:hidden">Nuevo</span>
          </Button>
        )}
      </div>

      <Segmented
        className="mb-3 flex max-w-full"
        value={status}
        onChange={setStatus}
        options={[
          { value: 'todos', label: 'Todos', count: projects.rows.length },
          ...STATUSES.map((s) => ({
            value: s,
            label: PROJECT_STATUS_LABEL[s],
            count: statusCounts[s],
          })),
        ]}
      />

      {/* --- Filtro por tecnología ----------------------------------------- */}
      {techCounts.size > 0 && (
        <div className="mb-5 flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[12px] font-bold tracking-wide text-ink-3 uppercase">
            Tecnología
          </span>
          {TECHNOLOGIES.filter((t) => techCounts.has(t)).map((t) => {
            const on = techs.includes(t)
            return (
              <button
                key={t}
                onClick={() =>
                  setTechs(on ? techs.filter((x) => x !== t) : [...techs, t])
                }
                className={cx(
                  'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors',
                  on
                    ? 'border-transparent text-white'
                    : 'border-line bg-surface text-ink-2 hover:border-line-strong',
                )}
                style={on ? { backgroundColor: TECH_COLOR[t] } : undefined}
              >
                {!on && (
                  <span
                    className="size-2 rounded-full"
                    style={{ backgroundColor: TECH_COLOR[t] }}
                    aria-hidden
                  />
                )}
                {on && <Check className="size-3.5" />}
                {t}
                <span className="tnum opacity-70">{techCounts.get(t)}</span>
              </button>
            )
          })}
          {techs.length > 0 && (
            <button
              onClick={() => setTechs([])}
              className="ml-1 text-[12px] font-semibold text-accent underline-offset-2 hover:underline"
            >
              Quitar filtro
            </button>
          )}
        </div>
      )}

      {projects.error && <ErrorNote>{projects.error}</ErrorNote>}

      {projects.loading ? (
        <Spinner />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={<Lightbulb className="size-8" />}
          title={filtering ? 'Nada con esos filtros' : 'Ningún proyecto todavía'}
          description={
            filtering
              ? 'Prueba a quitar algún filtro o a buscar otra cosa.'
              : 'Apunta las ideas antes de que se te olviden: una plantilla de Power Apps, un curso, una web…'
          }
          action={
            filtering ? (
              <Button
                variant="outline"
                onClick={() => {
                  setStatus('todos')
                  setTechs([])
                  setQuery('')
                }}
              >
                Ver todos
              </Button>
            ) : (
              <Button variant="primary" icon={<Plus className="size-4" />} onClick={openNew}>
                Añadir proyecto
              </Button>
            )
          }
        />
      ) : (
        <>
          <p className="mb-2 px-1 text-[12px] text-ink-3">
            {visible.length} de {projects.rows.length} proyectos
          </p>
          <ul className="stagger grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {visible.map((p) => {
              const stats = taskStats.get(p.id)
              const inMyDay = p.my_day_date === today()
              const ribbon = p.technologies.length
                ? p.technologies.length > 1
                  ? `linear-gradient(90deg, ${p.technologies.map((t) => TECH_COLOR[t]).join(', ')})`
                  : TECH_COLOR[p.technologies[0]]
                : 'var(--grad)'

              return (
                <Card
                  as="li"
                  key={p.id}
                  className={cx(
                    'card-hover flex flex-col overflow-hidden p-4 pt-5',
                    inMyDay && 'ring-2 ring-accent',
                  )}
                >
                  {/* Cinta superior con los colores de sus tecnologías. */}
                  <span
                    aria-hidden
                    className="absolute inset-x-0 top-0 h-1"
                    style={{ background: ribbon }}
                  />
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                      <Badge color={STATUS_COLOR[p.status]}>{PROJECT_STATUS_LABEL[p.status]}</Badge>
                      <Badge>{PROJECT_AREA_LABEL[p.area]}</Badge>
                      {p.priority === 2 && <Badge tone="warn">Prioridad alta</Badge>}
                      {p.sprint_id && sprintPorId.has(p.sprint_id) && (
                        <Badge>
                          {sprintPorId.get(p.sprint_id)!.emoji}{' '}
                          {sprintPorId.get(p.sprint_id)!.name}
                        </Badge>
                      )}
                    </div>
                    <div className="flex shrink-0">
                      <IconButton
                        label={inMyDay ? 'Quitar de Mi día' : 'Poner en Mi día'}
                        onClick={() => void patch(p, { my_day_date: inMyDay ? null : today() })}
                        className={inMyDay ? 'text-accent' : ''}
                      >
                        <Sun className={cx('size-4', inMyDay && 'fill-current')} />
                      </IconButton>
                      <IconButton label="Editar" onClick={() => openEdit(p)}>
                        <Pencil className="size-4" />
                      </IconButton>
                    </div>
                  </div>

                  <button onClick={() => navegar(`/proyectos/${p.id}`)} className="mt-2.5 text-left">
                    <h3 className="font-display text-lg leading-snug font-bold">{p.name}</h3>
                    {p.description && (
                      <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-ink-3">
                        {p.description}
                      </p>
                    )}
                  </button>

                  {p.technologies.length > 0 && (
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {p.technologies.map((t) => (
                        <Badge key={t} color={TECH_COLOR[t]}>
                          {t}
                        </Badge>
                      ))}
                    </div>
                  )}

                  <div className="mt-auto pt-4">
                    <div className="mb-1.5 flex items-center justify-between text-[12px]">
                      <span className="text-ink-3">Avance</span>
                      <span className="tnum font-bold">{p.progress}%</span>
                    </div>
                    <ProgressBar
                      value={p.progress}
                      color={p.technologies[0] ? TECH_COLOR[p.technologies[0]] : STATUS_COLOR[p.status]}
                      height={6}
                    />

                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[12px] text-ink-3">
                      <span className="inline-flex items-center gap-1">
                        <ListChecks className="size-3.5" />
                        {stats ? (
                          <span className="tnum">
                            {stats.done}/{stats.total} tareas
                          </span>
                        ) : (
                          'Sin tareas'
                        )}
                      </span>
                      {p.target_date && (
                        <span className="inline-flex items-center gap-1">
                          <CalendarClock className="size-3.5" />
                          {shortDate(p.target_date)}
                        </span>
                      )}
                    </div>
                  </div>
                </Card>
              )
            })}
          </ul>
        </>
      )}

      {/* --- Alta / edición -------------------------------------------------- */}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        size="lg"
        title={editing ? 'Editar proyecto' : 'Nuevo proyecto'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button variant="primary" loading={saving} onClick={() => void save()}>
              {editing ? 'Guardar' : 'Crear'}
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
              placeholder="Panel de CRM en Power BI"
            />
          </Field>

          <Field label="Descripción">
            <Textarea
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              placeholder="Qué resuelve, para quién y qué haría falta para empezar."
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Estado">
              <Select
                value={draft.status}
                onChange={(e) => setDraft({ ...draft, status: e.target.value as ProjectStatus })}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {PROJECT_STATUS_LABEL[s]}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Área">
              <Select
                value={draft.area}
                onChange={(e) => setDraft({ ...draft, area: e.target.value as ProjectArea })}
              >
                {AREAS.map((a) => (
                  <option key={a} value={a}>
                    {PROJECT_AREA_LABEL[a]}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Prioridad">
              <Select
                value={draft.priority}
                onChange={(e) => setDraft({ ...draft, priority: e.target.value })}
              >
                {[2, 1, 0].map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_LABEL[p]}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Fecha objetivo">
              <Input
                type="date"
                value={draft.target_date}
                onChange={(e) => setDraft({ ...draft, target_date: e.target.value })}
              />
            </Field>
          </div>

          <Field label={`Avance · ${draft.progress}%`}>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={draft.progress}
              onChange={(e) => setDraft({ ...draft, progress: e.target.value })}
              className="w-full accent-[var(--accent)]"
            />
          </Field>

          <Field label="Tecnologías" hint="Pulsa las que uses. Luego podrás filtrar por ellas.">
            <div className="flex flex-wrap gap-2">
              {TECHNOLOGIES.map((t) => {
                const on = draft.technologies.includes(t)
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() =>
                      setDraft({
                        ...draft,
                        technologies: on
                          ? draft.technologies.filter((x) => x !== t)
                          : [...draft.technologies, t],
                      })
                    }
                    className={cx(
                      'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors',
                      on
                        ? 'border-transparent text-white'
                        : 'border-line bg-surface-2 text-ink-2 hover:border-line-strong',
                    )}
                    style={on ? { backgroundColor: TECH_COLOR[t] } : undefined}
                  >
                    {on && <Check className="size-3.5" />}
                    {t}
                  </button>
                )
              })}
            </div>
          </Field>

          {formError && <ErrorNote>{formError}</ErrorNote>}
        </div>
      </Modal>
    </div>
  )
}
