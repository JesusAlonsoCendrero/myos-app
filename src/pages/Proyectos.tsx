import { useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  CalendarPlus,
  Check,
  FolderKanban,
  Lightbulb,
  Pencil,
  Play,
  Plus,
  Search,
  Trash2,
  X,
  Youtube,
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
  SectionTitle,
  Segmented,
  Select,
  Spinner,
  Textarea,
  useConfirm,
  useToast,
} from '@/components/ui'
import ProjectsBoard from '@/components/ProjectsBoard'
import { useCollection } from '@/hooks/useCollection'
import { friendlyError } from '@/lib/supabase'
import { weekLabel, weekStart } from '@/lib/dates'
import {
  BANK_GROUPS,
  IDEA_STATUS_EMOJI,
  IDEA_STATUS_LABEL,
  TECH_COLOR,
  TECHNOLOGIES,
  type BankGroup,
  type Idea,
  type IdeaStatus,
  type Project,
  type WeeklyGoal,
} from '@/lib/types'
import { fetchVideoInfo, youtubeId } from '@/lib/video'

const STATUSES = Object.keys(IDEA_STATUS_LABEL) as IdeaStatus[]

const emptyDraft = {
  title: '',
  notes: '',
  tech: '',
  project_id: '',
  status: 'idea' as IdeaStatus,
}

/**
 * Almacén permanente de todo lo que quieres hacer, con los mismos cuatro
 * frentes que los objetivos. Aquí un vídeo vive aunque no toque esta semana;
 * cuando le llega el turno se lleva a los objetivos de un botón.
 *
 * El frente "Proyectos" no son notas sueltas: es el tablero completo.
 */
export default function Proyectos() {
  const navegar = useNavigate()
  const toast = useToast()
  const confirm = useConfirm()

  const [group, setGroup] = useState<BankGroup>('youtube')
  const [savingVideo, setSavingVideo] = useState(false)
  const [videoError, setVideoError] = useState<string | null>(null)
  const [status, setStatus] = useState<IdeaStatus | 'todas'>('todas')
  const [query, setQuery] = useState('')
  const [quick, setQuick] = useState('')
  const [adding, setAdding] = useState(false)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Idea | null>(null)
  const [draft, setDraft] = useState(emptyDraft)
  const [formError, setFormError] = useState<string | null>(null)

  const ideas = useCollection<Idea>('ideas', {
    shape: (q) => q.order('sort_order').order('created_at', { ascending: false }),
  })

  const projects = useCollection<Project>('projects', {
    shape: (q) => q.neq('status', 'completado').order('name'),
  })

  // Objetivos de esta semana: para saber qué ideas ya están puestas.
  const goals = useCollection<WeeklyGoal>('weekly_goals', {
    shape: (q) => q.eq('week_start', weekStart()),
  })

  const projectById = useMemo(
    () => new Map(projects.rows.map((p) => [p.id, p])),
    [projects.rows],
  )

  const inThisWeek = useMemo(
    () => new Set(goals.rows.map((g) => g.idea_id).filter(Boolean) as string[]),
    [goals.rows],
  )

  const countByGroup = useMemo(() => {
    const map = Object.fromEntries(BANK_GROUPS.map((g) => [g.key, 0])) as Record<BankGroup, number>
    for (const i of ideas.rows) if (i.status !== 'hecha') map[i.group_key]++
    // Los proyectos no viven en "ideas": se cuentan los que están sin terminar.
    map.proyectos = projects.rows.length
    return map
  }, [ideas.rows, projects.rows])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return ideas.rows.filter((i) => {
      if (i.group_key !== group) return false
      if (status !== 'todas' && i.status !== status) return false
      if (q && !`${i.title} ${i.notes ?? ''}`.toLowerCase().includes(q)) return false
      return true
    })
  }, [ideas.rows, group, status, query])

  const current = BANK_GROUPS.find((g) => g.key === group)!

  async function quickAdd(e: FormEvent) {
    e.preventDefault()
    const title = quick.trim()
    if (!title) return
    setAdding(true)
    try {
      const top = ideas.rows.reduce((min, i) => Math.min(min, i.sort_order), 0) - 1
      await ideas.insert({ title, group_key: group, sort_order: top })
      setQuick('')
    } catch (err) {
      toast.error(friendlyError(err))
    } finally {
      setAdding(false)
    }
  }

  /** Guarda un vídeo pegando su enlace: el título y la miniatura los trae solo. */
  async function addVideo(e: FormEvent) {
    e.preventDefault()
    const url = quick.trim()
    if (!url) return

    if (!youtubeId(url)) {
      setVideoError('Eso no parece un enlace de YouTube. Pega la dirección del vídeo.')
      return
    }

    setSavingVideo(true)
    setVideoError(null)
    try {
      const info = await fetchVideoInfo(url)
      const top = ideas.rows.reduce((min, i) => Math.min(min, i.sort_order), 0) - 1
      await ideas.insert({
        title: info?.title ?? 'Vídeo de YouTube',
        url: info?.url ?? url,
        image_url: info?.thumbnail ?? null,
        author: info?.author ?? null,
        group_key: 'ver',
        sort_order: top,
      })
      setQuick('')
    } catch (err) {
      setVideoError(friendlyError(err))
    } finally {
      setSavingVideo(false)
    }
  }

  function openEdit(idea: Idea) {
    setEditing(idea)
    setDraft({
      title: idea.title,
      notes: idea.notes ?? '',
      tech: idea.tech ?? '',
      project_id: idea.project_id ?? '',
      status: idea.status,
    })
    setFormError(null)
    setOpen(true)
  }

  async function save() {
    if (!draft.title.trim()) return setFormError('Ponle un título.')
    try {
      await ideas.update(editing!.id, {
        title: draft.title.trim(),
        notes: draft.notes.trim() || null,
        tech: draft.tech || null,
        project_id: draft.project_id || null,
        status: draft.status,
        done_at: draft.status === 'hecha' ? new Date().toISOString() : null,
      })
      setOpen(false)
      toast.success('Idea actualizada')
    } catch (e) {
      setFormError(friendlyError(e))
    }
  }

  /** Lleva la idea a los objetivos de esta semana, dejándolas enlazadas. */
  async function toThisWeek(idea: Idea) {
    try {
      await goals.insert({
        title: idea.title,
        detail: idea.notes,
        group_key: idea.group_key,
        tech: idea.tech,
        project_id: idea.project_id,
        idea_id: idea.id,
        week_start: weekStart(),
        sort_order: goals.rows.length,
      })
      if (idea.status === 'idea') await ideas.update(idea.id, { status: 'en_curso' })
      toast.success('Añadida a los objetivos de esta semana')
    } catch (e) {
      toast.error(friendlyError(e))
    }
  }

  async function remove(idea: Idea) {
    const ok = await confirm({
      title: '¿Borrar del banco?',
      message: `Se eliminará “${idea.title}”.`,
      confirmLabel: 'Borrar',
      danger: true,
    })
    if (!ok) return
    try {
      await ideas.remove(idea.id)
      toast.success('Idea borrada')
    } catch (e) {
      toast.error(friendlyError(e))
    }
  }

  return (
    <div className="animate-rise">
      <SectionTitle
        hint={
          group === 'proyectos'
            ? 'Tus proyectos, con su estado, sus tareas y su lienzo.'
            : 'Todo lo que quieres hacer, esté o no en la semana. De aquí sale tu lunes.'
        }
      >
        Proyectos
      </SectionTitle>

      {/* --- Frentes -------------------------------------------------------- */}
      <div className="stagger mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
        {BANK_GROUPS.map((g) => {
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
                  {countByGroup[g.key]}{' '}
                  {g.key === 'proyectos'
                    ? countByGroup[g.key] === 1
                      ? 'proyecto'
                      : 'proyectos'
                    : countByGroup[g.key] === 1
                      ? 'pendiente'
                      : 'pendientes'}
                </span>
              </span>
            </button>
          )
        })}
      </div>

      {/* El frente de Proyectos no son notas sueltas: es el módulo entero. */}
      {group === 'proyectos' ? (
        <ProjectsBoard embedded />
      ) : (
        <>

      {/* --- Alta rápida ---------------------------------------------------- */}
      <Card className="mb-3 p-2">
        <form
          onSubmit={group === 'ver' ? addVideo : quickAdd}
          className="flex items-center gap-2 px-2"
        >
          {group === 'ver' ? (
            <Youtube className="size-5 shrink-0 text-bad" />
          ) : (
            <Plus className="size-5 shrink-0 text-accent" />
          )}
          <input
            value={quick}
            onChange={(e) => {
              setQuick(e.target.value)
              setVideoError(null)
            }}
            placeholder={
              group === 'ver'
                ? 'Pega aquí el enlace del vídeo de YouTube…'
                : group === 'youtube'
                  ? 'Idea de vídeo…'
                  : group === 'linkedin'
                    ? 'Idea de post…'
                    : group === 'estudio'
                      ? '¿Qué quieres estudiar?'
                      : '¿Qué quieres sacar adelante?'
            }
            className="min-w-0 flex-1 bg-transparent py-2.5 text-sm placeholder:text-ink-3 focus:outline-none"
          />
          <Button
            type="submit"
            variant="primary"
            size="sm"
            loading={group === 'ver' ? savingVideo : adding}
          >
            Guardar
          </Button>
        </form>
        {videoError && (
          <p className="px-3 pt-1 pb-2 text-[12px] font-semibold text-bad">{videoError}</p>
        )}
      </Card>

      {/* --- Filtros -------------------------------------------------------- */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Segmented
          value={status}
          onChange={setStatus}
          options={[
            { value: 'todas', label: 'Todas' },
            ...STATUSES.map((s) => ({
              value: s,
              label: `${IDEA_STATUS_EMOJI[s]} ${IDEA_STATUS_LABEL[s]}`,
            })),
          ]}
        />
        <div className="relative min-w-48 flex-1">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar…"
            className="h-10 py-0 pl-9"
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
      </div>

      {ideas.error && <ErrorNote>{ideas.error}</ErrorNote>}

      {/* --- Lista ---------------------------------------------------------- */}
      {ideas.loading ? (
        <Spinner />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={group === 'ver' ? <Youtube className="size-8" /> : <Lightbulb className="size-8" />}
          title={`Nada en ${current.short}`}
          description={
            group === 'ver'
              ? 'Pega arriba el enlace de un vídeo que quieras ver y se guarda con su miniatura.'
              : 'Escribe arriba cualquier cosa que se te ocurra. No hace falta que la hagas ya: para eso está el banco.'
          }
        />
      ) : group === 'ver' ? (
        /* --- Vídeos por ver: rejilla de miniaturas --------------------- */
        <ul className="stagger grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((video) => {
            const seen = video.status === 'hecha'
            return (
              <Card as="li" key={video.id} className="card-hover flex flex-col overflow-hidden">
                <a
                  href={video.url ?? '#'}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="group relative block aspect-video bg-surface-2"
                >
                  {video.image_url ? (
                    <img
                      src={video.image_url}
                      alt=""
                      loading="lazy"
                      className={cx(
                        'size-full object-cover transition-opacity',
                        seen && 'opacity-40',
                      )}
                    />
                  ) : (
                    <div className="grid size-full place-items-center text-4xl opacity-40">📺</div>
                  )}
                  <span className="absolute inset-0 grid place-items-center bg-black/0 transition-colors group-hover:bg-black/35">
                    <span className="grid size-12 scale-90 place-items-center rounded-full bg-white/95 opacity-0 shadow-lg transition-all group-hover:scale-100 group-hover:opacity-100">
                      <Play className="size-5 translate-x-0.5 fill-black text-black" />
                    </span>
                  </span>
                  {seen && (
                    <span className="absolute top-2 left-2 rounded-full bg-good px-2.5 py-1 text-[11px] font-bold text-white">
                      Visto
                    </span>
                  )}
                </a>

                <div className="flex flex-1 flex-col p-3.5">
                  <p
                    className={cx(
                      'line-clamp-2 text-[14px] leading-snug font-bold',
                      seen && 'text-ink-3',
                    )}
                  >
                    {video.title}
                  </p>
                  {video.author && (
                    <p className="mt-1 truncate text-[12px] text-ink-3">{video.author}</p>
                  )}
                  {video.notes && (
                    <p className="mt-1.5 line-clamp-2 text-[12px] text-ink-3">{video.notes}</p>
                  )}

                  <div className="mt-auto flex items-center gap-1 pt-3">
                    <Button
                      size="sm"
                      variant={seen ? 'soft' : 'outline'}
                      className="flex-1"
                      icon={<Check className="size-4" />}
                      onClick={() =>
                        void ideas
                          .update(video.id, {
                            status: seen ? 'idea' : 'hecha',
                            done_at: seen ? null : new Date().toISOString(),
                          })
                          .catch((e) => toast.error(friendlyError(e)))
                      }
                    >
                      {seen ? 'Visto' : 'Marcar visto'}
                    </Button>
                    <IconButton label="Editar" onClick={() => openEdit(video)}>
                      <Pencil className="size-4" />
                    </IconButton>
                    <IconButton label="Borrar" onClick={() => void remove(video)}>
                      <Trash2 className="size-4" />
                    </IconButton>
                  </div>
                </div>
              </Card>
            )
          })}
        </ul>
      ) : (
        <ul className="stagger space-y-2.5">
          {visible.map((idea) => {
            const project = idea.project_id ? projectById.get(idea.project_id) : undefined
            const placed = inThisWeek.has(idea.id)
            const done = idea.status === 'hecha'

            return (
              <Card as="li" key={idea.id} className={cx('card-hover p-4', done && 'opacity-70')}>
                <div className="flex items-start gap-3">
                  <span
                    className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-surface-2 text-lg"
                    aria-hidden
                  >
                    {IDEA_STATUS_EMOJI[idea.status]}
                  </span>

                  <button
                    onClick={() => navegar(`/ideas/${idea.id}`)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <p
                      className={cx(
                        'font-display text-[16px] leading-snug font-bold',
                        done && 'text-ink-3 line-through decoration-2',
                      )}
                    >
                      {idea.title}
                    </p>
                    {idea.notes && (
                      <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-ink-3">
                        {idea.notes}
                      </p>
                    )}

                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {project && (
                        <Badge tone="accent">
                          <FolderKanban className="size-3" />
                          {project.name}
                        </Badge>
                      )}
                      {idea.tech && <Badge color={TECH_COLOR[idea.tech]}>{idea.tech}</Badge>}
                      {placed && <Badge tone="good">En la semana</Badge>}
                    </div>
                  </button>

                  <div className="flex shrink-0 items-center">
                    {!done && !placed && (
                      <IconButton
                        label="Llevar a los objetivos de esta semana"
                        onClick={() => void toThisWeek(idea)}
                        className="text-accent"
                      >
                        <CalendarPlus className="size-4" />
                      </IconButton>
                    )}
                    <IconButton
                      label={done ? 'Marcar como pendiente' : 'Marcar como hecha'}
                      onClick={() =>
                        void ideas
                          .update(idea.id, {
                            status: done ? 'idea' : 'hecha',
                            done_at: done ? null : new Date().toISOString(),
                          })
                          .catch((e) => toast.error(friendlyError(e)))
                      }
                      className={done ? 'text-good' : ''}
                    >
                      <Check className="size-4" />
                    </IconButton>
                    <IconButton label="Editar" onClick={() => openEdit(idea)}>
                      <Pencil className="size-4" />
                    </IconButton>
                    <IconButton label="Borrar" onClick={() => void remove(idea)}>
                      <Trash2 className="size-4" />
                    </IconButton>
                  </div>
                </div>
              </Card>
            )
          })}
        </ul>
      )}
        </>
      )}

      {/* --- Edición --------------------------------------------------------- */}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Editar idea"
        description={`${current.emoji} ${current.label}`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={() => void save()}>
              Guardar
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Título">
            <Input
              autoFocus
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            />
          </Field>

          {editing?.group_key === 'ver' && editing.url && (
            <a
              href={editing.url}
              target="_blank"
              rel="noreferrer noopener"
              className="flex items-center gap-3 rounded-2xl border border-line bg-surface-2 p-2.5 transition-colors hover:border-accent"
            >
              {editing.image_url && (
                <img src={editing.image_url} alt="" className="h-14 w-24 rounded-xl object-cover" />
              )}
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-bold text-accent">Abrir en YouTube ↗</span>
                <span className="block truncate text-[11px] text-ink-3">{editing.url}</span>
              </span>
            </a>
          )}

          <Field
            label="Notas"
            hint={
              editing?.group_key === 'ver'
                ? 'Por qué lo guardaste, qué te interesa de él.'
                : 'El enfoque, el gancho, lo que quieras recordar.'
            }
          >
            <Textarea
              rows={4}
              value={draft.notes}
              onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
            />
          </Field>

          <Field label="Proyecto" hint="En qué estás trabajando con esto.">
            <Select
              value={draft.project_id}
              onChange={(e) => setDraft({ ...draft, project_id: e.target.value })}
            >
              <option value="">Sin proyecto</option>
              {projects.rows.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Tecnología">
              <Select
                value={draft.tech}
                onChange={(e) => setDraft({ ...draft, tech: e.target.value })}
              >
                <option value="">Ninguna</option>
                {TECHNOLOGIES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Estado">
              <Select
                value={draft.status}
                onChange={(e) => setDraft({ ...draft, status: e.target.value as IdeaStatus })}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {IDEA_STATUS_LABEL[s]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          {/* Los vídeos por ver no van a los objetivos semanales. */}
          {editing && editing.group_key !== 'ver' && !inThisWeek.has(editing.id) && editing.status !== 'hecha' && (
            <Button
              variant="outline"
              className="w-full"
              icon={<CalendarPlus className="size-4" />}
              onClick={() => {
                void toThisWeek(editing)
                setOpen(false)
              }}
            >
              Llevar a la semana del {weekLabel(weekStart())}
            </Button>
          )}

          {formError && <ErrorNote>{formError}</ErrorNote>}
        </div>
      </Modal>
    </div>
  )
}
