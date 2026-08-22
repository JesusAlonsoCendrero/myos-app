import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ChevronLeft,
  ChevronRight,
  ChevronsRight,
  FolderKanban,
  LayoutGrid,
  ListPlus,
  Pencil,
  Plus,
  Target,
  Trash2,
} from 'lucide-react'
import {
  Badge,
  Button,
  Card,
  Checkbox,
  cx,
  EmptyState,
  ErrorNote,
  Field,
  IconButton,
  Input,
  Modal,
  ProgressBar,
  ProgressRing,
  SectionTitle,
  Select,
  Spinner,
  Textarea,
  useConfirm,
  useToast,
} from '@/components/ui'
import { useCollection } from '@/hooks/useCollection'
import { db, friendlyError } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { shiftWeek, weekLabel, weekNumberLabel, weekStart } from '@/lib/dates'
import {
  GOAL_GROUPS,
  PROJECT_STATUS_LABEL,
  TECH_COLOR,
  TECHNOLOGIES,
  type GoalGroup,
  type Project,
  type Task,
  type WeeklyGoal,
} from '@/lib/types'

const emptyDraft = { title: '', detail: '', tech: '' }

export default function Objetivos() {
  const navegar = useNavigate()
  const { user } = useAuth()
  const toast = useToast()
  const confirm = useConfirm()

  const [week, setWeek] = useState(() => weekStart())
  const [group, setGroup] = useState<GoalGroup>('proyectos')
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<WeeklyGoal | null>(null)
  const [draft, setDraft] = useState(emptyDraft)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [projectPicker, setProjectPicker] = useState(false)
  const [linking, setLinking] = useState(false)

  const goals = useCollection<WeeklyGoal>('weekly_goals', {
    shape: (q) => q.eq('week_start', week).order('sort_order').order('created_at'),
    deps: [week],
  })

  // Las tareas dan el avance de cada objetivo: ya no hay meta numérica.
  const tasks = useCollection<Task>('tasks', {
    shape: (q) => q.not('goal_id', 'is', null),
  })

  const projects = useCollection<Project>('projects', {
    shape: (q) => q.neq('status', 'completado').order('priority', { ascending: false }),
  })

  const projectById = useMemo(
    () => new Map(projects.rows.map((p) => [p.id, p])),
    [projects.rows],
  )

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

  /**
   * Un objetivo está hecho si lo marcas tú, si todas sus tareas están hechas o
   * si el proyecto al que apunta ya está al 100%.
   */
  const isDone = (g: WeeklyGoal) => {
    if (g.done) return true
    const linked = g.project_id ? projectById.get(g.project_id) : undefined
    if (linked?.progress === 100) return true
    const p = progressByGoal.get(g.id)
    return p !== undefined && p.total > 0 && p.done === p.total
  }

  const countByGroup = useMemo(() => {
    const map = Object.fromEntries(GOAL_GROUPS.map((g) => [g.key, 0])) as Record<GoalGroup, number>
    for (const g of goals.rows) map[g.group_key]++
    return map
  }, [goals.rows])

  const visible = useMemo(
    () => goals.rows.filter((g) => g.group_key === group),
    [goals.rows, group],
  )

  const weekProgress = useMemo(() => {
    if (!goals.rows.length) return 0
    return (goals.rows.filter(isDone).length / goals.rows.length) * 100
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goals.rows, progressByGoal])

  const isCurrentWeek = week === weekStart()

  function openNew() {
    setEditing(null)
    setDraft(emptyDraft)
    setFormError(null)
    setOpen(true)
  }

  function openEdit(goal: WeeklyGoal) {
    setEditing(goal)
    setDraft({ title: goal.title, detail: goal.detail ?? '', tech: goal.tech ?? '' })
    setFormError(null)
    setOpen(true)
  }

  async function save() {
    if (!draft.title.trim()) return setFormError('Ponle un título al objetivo.')
    setSaving(true)
    setFormError(null)
    try {
      const values = {
        title: draft.title.trim(),
        detail: draft.detail.trim() || null,
        tech: draft.tech || null,
        group_key: group,
        week_start: week,
      }
      if (editing) await goals.update(editing.id, values)
      else await goals.insert({ ...values, sort_order: goals.rows.length })
      setOpen(false)
      toast.success(editing ? 'Objetivo actualizado' : 'Objetivo añadido')
    } catch (e) {
      setFormError(friendlyError(e))
    } finally {
      setSaving(false)
    }
  }

  /**
   * Marca el objetivo y, si vino del banco de ideas, cierra también la idea:
   * si no, tendrías que acordarte de ir a tacharla allí.
   */
  async function completeGoal(goal: WeeklyGoal, done: boolean) {
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

  /**
   * Empuja un objetivo a la semana siguiente. Lo quitamos de la lista a mano
   * porque la consulta está filtrada por semana y el objetivo ya no pertenece
   * a esta.
   */
  async function pushToNextWeek(goal: WeeklyGoal) {
    const destino = shiftWeek(goal.week_start, 1)
    try {
      await goals.update(goal.id, { week_start: destino })
      goals.setRows((prev) => prev.filter((g) => g.id !== goal.id))
      toast.success(`“${goal.title}” pasa a la semana del ${weekLabel(destino)}`)
    } catch (e) {
      toast.error(friendlyError(e))
    }
  }

  /** Convierte proyectos ya registrados en objetivos de esta semana. */
  async function linkProjects(ids: string[]) {
    setLinking(true)
    try {
      const chosen = projects.rows.filter((p) => ids.includes(p.id))
      for (const [i, p] of chosen.entries()) {
        await goals.insert({
          title: p.name,
          detail: p.description,
          group_key: 'proyectos',
          tech: p.technologies[0] ?? null,
          project_id: p.id,
          week_start: week,
          sort_order: goals.rows.length + i,
        })
      }
      setProjectPicker(false)
      toast.success(`${chosen.length} proyecto(s) añadidos a la semana`)
    } catch (e) {
      toast.error(friendlyError(e))
    } finally {
      setLinking(false)
    }
  }

  async function removeGoal(goal: WeeklyGoal) {
    const ok = await confirm({
      title: '¿Borrar objetivo?',
      message: `Se eliminará “${goal.title}”. Las tareas asociadas se quedarán sueltas.`,
      confirmLabel: 'Borrar',
      danger: true,
    })
    if (!ok) return
    try {
      await goals.remove(goal.id)
      toast.success('Objetivo borrado')
    } catch (e) {
      toast.error(friendlyError(e))
    }
  }

  const current = GOAL_GROUPS.find((g) => g.key === group)!

  return (
    <div className="animate-rise">
      <SectionTitle
        hint="Cada semana arranca en blanco. Cuatro frentes, y las tareas los empujan."
        action={
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={openNew}>
            <span className="hidden sm:inline">Nuevo objetivo</span>
            <span className="sm:hidden">Nuevo</span>
          </Button>
        }
      >
        Objetivos
      </SectionTitle>

      {/* --- Hero de la semana --------------------------------------------- */}
      <Card className="relative mb-5 overflow-hidden p-5 sm:p-6">
        {/* Un lavado del degradado de marca, muy tenue, da el aire de producto. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.06]"
          style={{ background: 'var(--grad)' }}
        />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <ProgressRing value={weekProgress} size={72} stroke={7} />
            <div className="min-w-0">
              <p className="flex items-center gap-2 font-display text-2xl leading-none font-bold">
                {weekNumberLabel(week)}
                {isCurrentWeek && <Badge tone="accent">Esta semana</Badge>}
              </p>
              <p className="mt-1.5 text-[13px] text-ink-3">{weekLabel(week)}</p>
              <div className="mt-2 flex items-center gap-1">
                <IconButton
                  label="Semana anterior"
                  className="size-7"
                  onClick={() => setWeek((w) => shiftWeek(w, -1))}
                >
                  <ChevronLeft className="size-4" />
                </IconButton>
                <IconButton
                  label="Semana siguiente"
                  className="size-7"
                  onClick={() => setWeek((w) => shiftWeek(w, 1))}
                >
                  <ChevronRight className="size-4" />
                </IconButton>
                {!isCurrentWeek && (
                  <Button size="sm" variant="ghost" onClick={() => setWeek(weekStart())}>
                    Volver a hoy
                  </Button>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              icon={<ListPlus className="size-4" />}
              onClick={() => setImportOpen(true)}
            >
              <span className="hidden sm:inline">De la semana anterior</span>
              <span className="sm:hidden">Traer</span>
            </Button>
            {group === 'proyectos' && (
              <Button
                variant="outline"
                size="sm"
                icon={<FolderKanban className="size-4" />}
                onClick={() => setProjectPicker(true)}
              >
                <span className="hidden sm:inline">Traer un proyecto</span>
                <span className="sm:hidden">Proyecto</span>
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* --- Pestañas fijas ------------------------------------------------ */}
      <div className="stagger mb-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {GOAL_GROUPS.map((g) => {
          const active = g.key === group
          return (
            <button
              key={g.key}
              onClick={() => setGroup(g.key)}
              className={cx(
                'card-hover flex items-center gap-3 rounded-3xl p-3.5 text-left',
                active
                  ? 'text-accent-ink shadow-glow [background:var(--grad)]'
                  : 'bg-surface text-ink-2 shadow-card',
              )}
            >
              <span
                className={cx(
                  'grid size-10 shrink-0 place-items-center rounded-2xl text-xl',
                  active ? 'bg-white/20' : 'bg-surface-2',
                )}
                aria-hidden
              >
                {g.emoji}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-bold">{g.short}</span>
                <span className={cx('tnum block text-[11px]', active ? 'opacity-80' : 'opacity-60')}>
                  {countByGroup[g.key]} objetivo{countByGroup[g.key] === 1 ? '' : 's'}
                </span>
              </span>
            </button>
          )
        })}
      </div>

      {goals.error && <ErrorNote>{goals.error}</ErrorNote>}

      {/* --- Objetivos del grupo activo ------------------------------------ */}
      {goals.loading ? (
        <Spinner />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={<Target className="size-8" />}
          title={`Nada en ${current.short} esta semana`}
          description="Escribe qué quieres sacar adelante. Luego le cuelgas tareas y el avance sale solo."
          action={
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={openNew}>
              Añadir objetivo
            </Button>
          }
        />
      ) : (
        <ul className="stagger space-y-3">
          {visible.map((goal) => {
            const p = progressByGoal.get(goal.id)
            const linked = goal.project_id ? projectById.get(goal.project_id) : undefined
            // Si viene de un proyecto, su avance es el que manda.
            const pct = linked
              ? linked.progress
              : p && p.total
                ? (p.done / p.total) * 100
                : 0
            const done = isDone(goal)
            const accentColor = goal.tech ? TECH_COLOR[goal.tech] : 'var(--accent)'

            return (
              <Card
                as="li"
                key={goal.id}
                className={cx('card-hover overflow-hidden p-4 pl-5', done && 'opacity-70')}
              >
                {/* Cinta de color de la tecnología en el borde izquierdo. */}
                <span
                  aria-hidden
                  className="absolute inset-y-3 left-0 w-1 rounded-r-full"
                  style={{ background: accentColor }}
                />
                <div className="flex items-start gap-3">
                  <div className="pt-0.5">
                    <Checkbox
                      checked={done}
                      onChange={(v) => void completeGoal(goal, v)}
                    />
                  </div>

                  <div className="min-w-0 flex-1">
                    <button
                      onClick={() => navegar(`/objetivos/${goal.id}`)}
                      className="block max-w-full text-left"
                    >
                      <p
                        className={cx(
                          'font-display text-[17px] leading-snug font-bold underline-offset-4 hover:underline',
                          done && 'text-ink-3 line-through decoration-2',
                        )}
                      >
                        {goal.title}
                      </p>
                    </button>
                    {goal.detail && (
                      <p className="mt-1 text-[13px] leading-relaxed text-ink-3">{goal.detail}</p>
                    )}

                    <div className="mt-2.5 flex flex-wrap items-center gap-2">
                      {linked && (
                        <Link to="/proyectos">
                          <Badge tone="accent">
                            <FolderKanban className="size-3" />
                            Proyecto · {linked.progress}%
                          </Badge>
                        </Link>
                      )}
                      {goal.tech && <Badge color={TECH_COLOR[goal.tech]}>{goal.tech}</Badge>}
                      {p ? (
                        <span className="tnum text-[12px] text-ink-3">
                          {p.done}/{p.total} tareas
                        </span>
                      ) : (
                        !linked && (
                          <span className="text-[12px] text-ink-3">Sin tareas asociadas</span>
                        )
                      )}
                    </div>

                    {(linked || (p && p.total > 0)) && (
                      <ProgressBar
                        className="mt-2.5"
                        value={pct}
                        height={6}
                        color={goal.tech ? TECH_COLOR[goal.tech] : undefined}
                      />
                    )}
                  </div>

                  <div className="flex shrink-0 flex-col items-center gap-0.5 sm:flex-row">
                    <IconButton
                      label="Mandar a la semana siguiente"
                      onClick={() => void pushToNextWeek(goal)}
                    >
                      <ChevronsRight className="size-4" />
                    </IconButton>
                    <IconButton
                      label="Abrir el objetivo y su lienzo"
                      onClick={() => navegar(`/objetivos/${goal.id}`)}
                    >
                      <LayoutGrid className="size-4" />
                    </IconButton>
                    <IconButton label="Editar" onClick={() => openEdit(goal)}>
                      <Pencil className="size-4" />
                    </IconButton>
                    <IconButton label="Borrar" onClick={() => void removeGoal(goal)}>
                      <Trash2 className="size-4" />
                    </IconButton>
                  </div>
                </div>
              </Card>
            )
          })}
        </ul>
      )}

      {/* --- Traer de la semana anterior ----------------------------------- */}
      <ImportPreviousWeek
        open={importOpen}
        onClose={() => setImportOpen(false)}
        week={week}
        userId={user?.id}
        existing={goals.rows}
        onDone={() => void goals.reload()}
      />

      {/* --- Traer un proyecto registrado ---------------------------------- */}
      <ProjectPicker
        open={projectPicker}
        onClose={() => setProjectPicker(false)}
        projects={projects.rows}
        alreadyLinked={new Set(goals.rows.map((g) => g.project_id).filter(Boolean) as string[])}
        busy={linking}
        onPick={(ids) => void linkProjects(ids)}
      />

      {/* --- Alta / edición ------------------------------------------------- */}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? 'Editar objetivo' : `Nuevo en ${current.short}`}
        description={weekLabel(week)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button variant="primary" loading={saving} onClick={() => void save()}>
              {editing ? 'Guardar' : 'Añadir'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Objetivo">
            <Input
              autoFocus
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              placeholder={
                group === 'youtube'
                  ? 'Vídeo: Dataverse explicado en 10 minutos'
                  : group === 'linkedin'
                    ? 'Post sobre automatizar aprobaciones'
                    : group === 'estudio'
                      ? 'Terminar el módulo 4 de PL-400'
                      : 'Cerrar la plantilla de incidencias'
              }
            />
          </Field>

          <Field label="Detalle" hint="Opcional: el enfoque, el criterio para darlo por hecho⬦">
            <Textarea
              value={draft.detail}
              onChange={(e) => setDraft({ ...draft, detail: e.target.value })}
            />
          </Field>

          <Field label="Tecnología" hint="Opcional. Sirve para ver en qué te concentras.">
            <Select
              value={draft.tech}
              onChange={(e) => setDraft({ ...draft, tech: e.target.value })}
            >
              <option value="">Ninguna en concreto</option>
              {TECHNOLOGIES.map((t) => (
                <option key={t} value={t}>
                  {t}
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

/** Elige proyectos ya registrados para convertirlos en objetivos de la semana. */
function ProjectPicker({
  open,
  onClose,
  projects,
  alreadyLinked,
  busy,
  onPick,
}: {
  open: boolean
  onClose: () => void
  projects: Project[]
  alreadyLinked: Set<string>
  busy: boolean
  onPick: (ids: string[]) => void
}) {
  const [picked, setPicked] = useState<string[]>([])

  return (
    <Modal
      open={open}
      onClose={() => {
        setPicked([])
        onClose()
      }}
      title="Traer un proyecto"
      description="Los que elijas pasan a ser objetivos de esta semana, con su avance."
      footer={
        <>
          <Button
            variant="ghost"
            onClick={() => {
              setPicked([])
              onClose()
            }}
          >
            Cancelar
          </Button>
          <Button
            variant="primary"
            loading={busy}
            disabled={!picked.length}
            onClick={() => {
              onPick(picked)
              setPicked([])
            }}
          >
            Añadir {picked.length > 0 && `(${picked.length})`}
          </Button>
        </>
      }
    >
      {projects.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-3">
          No tienes proyectos activos. Créalos en el apartado de Proyectos.
        </p>
      ) : (
        <ul className="space-y-2">
          {projects.map((p) => {
            const linked = alreadyLinked.has(p.id)
            const on = picked.includes(p.id)
            return (
              <li
                key={p.id}
                className={cx(
                  'flex items-start gap-3 rounded-2xl border px-3 py-2.5',
                  on ? 'border-accent bg-accent-soft' : 'border-line bg-surface-2',
                  linked && 'opacity-50',
                )}
              >
                <div className="pt-0.5">
                  <Checkbox
                    checked={on}
                    onChange={(v) =>
                      setPicked(v ? [...picked, p.id] : picked.filter((x) => x !== p.id))
                    }
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{p.name}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-2 text-[12px] text-ink-3">
                    <span>{PROJECT_STATUS_LABEL[p.status]}</span>
                    <span className="tnum">· {p.progress}%</span>
                    {p.technologies.map((t) => (
                      <Badge key={t} color={TECH_COLOR[t]}>
                        {t}
                      </Badge>
                    ))}
                    {linked && <span className="font-bold">Ya está esta semana</span>}
                  </p>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </Modal>
  )
}

/** Lista los objetivos de la semana pasada y deja elegir cuáles traer. */
function ImportPreviousWeek({
  open,
  onClose,
  week,
  userId,
  existing,
  onDone,
}: {
  open: boolean
  onClose: () => void
  week: string
  userId?: string
  existing: WeeklyGoal[]
  onDone: () => void
}) {
  const toast = useToast()
  const [rows, setRows] = useState<WeeklyGoal[] | null>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)

  const alreadyHere = useMemo(
    () => new Set(existing.map((g) => g.title.toLowerCase())),
    [existing],
  )

  async function load() {
    setRows(null)
    setPicked(new Set())
    try {
      const { data, error } = await db()
        .from('weekly_goals')
        .select('*')
        .eq('user_id', userId!)
        .eq('week_start', shiftWeek(week, -1))
        .order('group_key')
      if (error) throw error
      setRows((data ?? []) as WeeklyGoal[])
    } catch (e) {
      toast.error(friendlyError(e))
      setRows([])
    }
  }

  // Cargamos al abrir, no antes: no tiene sentido pedirlo si nunca lo abre.
  if (open && rows === null && userId) void load()

  async function bring() {
    if (!picked.size) return
    setBusy(true)
    try {
      const chosen = (rows ?? []).filter((g) => picked.has(g.id))
      const { error } = await db()
        .from('weekly_goals')
        .insert(
          chosen.map((g, i) => ({
            user_id: userId,
            week_start: week,
            title: g.title,
            detail: g.detail,
            group_key: g.group_key,
            tech: g.tech,
            done: false,
            sort_order: existing.length + i,
          })),
        )
      if (error) throw error
      toast.success(`${chosen.length} objetivo(s) traídos`)
      onDone()
      onClose()
      setRows(null)
    } catch (e) {
      toast.error(friendlyError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        onClose()
        setRows(null)
      }}
      title="Traer de la semana anterior"
      description="Marca los que quieras repetir. Vienen sin avance."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" loading={busy} disabled={!picked.size} onClick={() => void bring()}>
            Traer {picked.size > 0 && `(${picked.size})`}
          </Button>
        </>
      }
    >
      {rows === null ? (
        <Spinner label="Buscando⬦" />
      ) : rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-3">
          La semana anterior no tenía objetivos.
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((g) => {
            const repeated = alreadyHere.has(g.title.toLowerCase())
            const groupMeta = GOAL_GROUPS.find((x) => x.key === g.group_key)
            return (
              <li
                key={g.id}
                className={cx(
                  'flex items-start gap-3 rounded-2xl border px-3 py-2.5',
                  picked.has(g.id) ? 'border-accent bg-accent-soft' : 'border-line bg-surface-2',
                  repeated && 'opacity-50',
                )}
              >
                <div className="pt-0.5">
                  <Checkbox
                    checked={picked.has(g.id)}
                    onChange={(v) =>
                      setPicked((prev) => {
                        const next = new Set(prev)
                        v ? next.add(g.id) : next.delete(g.id)
                        return next
                      })
                    }
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{g.title}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-2 text-[12px] text-ink-3">
                    <span>
                      {groupMeta?.emoji} {groupMeta?.short}
                    </span>
                    {g.tech && <Badge color={TECH_COLOR[g.tech]}>{g.tech}</Badge>}
                    {repeated && <span className="font-semibold">Ya lo tienes esta semana</span>}
                  </p>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </Modal>
  )
}
