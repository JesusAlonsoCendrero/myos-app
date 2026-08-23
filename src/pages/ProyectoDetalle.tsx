import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  CalendarDays,
  FileText,
  LayoutGrid,
  ListChecks,
  Sun,
  Trash2,
} from 'lucide-react'
import {
  Badge,
  Button,
  Card,
  cx,
  ErrorNote,
  IconButton,
  ProgressBar,
  Segmented,
  Spinner,
  useConfirm,
  useToast,
} from '@/components/ui'
import Canvas from '@/components/Canvas'
import Documento from '@/components/Documento'
import { useCollection } from '@/hooks/useCollection'
import { friendlyError } from '@/lib/supabase'
import { longDate, today } from '@/lib/dates'
import {
  BANK_GROUPS,
  IDEA_STATUS_LABEL,
  PROJECT_AREA_LABEL,
  PROJECT_STATUS_EMOJI,
  PROJECT_STATUS_LABEL,
  TECH_COLOR,
  type Idea,
  type Project,
  type ProjectStatus,
  type Task,
} from '@/lib/types'

const STATUSES = Object.keys(PROJECT_STATUS_LABEL) as ProjectStatus[]
type Pestana = 'documento' | 'lienzo' | 'tareas'

/**
 * La ficha de una cosa del apartado Proyectos. Sirve igual para un proyecto de
 * verdad que para una idea de cualquier frente del banco: lo que cambia es la
 * cabecera, el documento y el lienzo son los mismos.
 */
export default function ProyectoDetalle({ tipo }: { tipo: 'project' | 'idea' }) {
  const { id = '' } = useParams()
  const navegar = useNavigate()
  const toast = useToast()
  const confirm = useConfirm()
  const [tab, setTab] = useState<Pestana>('documento')

  const esProyecto = tipo === 'project'

  const projects = useCollection<Project>('projects', { skip: !esProyecto })
  const ideas = useCollection<Idea>('ideas', { skip: esProyecto })
  const tasks = useCollection<Task>('tasks', { skip: !esProyecto })

  const coleccion = esProyecto ? projects : ideas
  const proyecto = esProyecto ? (projects.rows.find((p) => p.id === id) ?? null) : null
  const idea = esProyecto ? null : (ideas.rows.find((i) => i.id === id) ?? null)

  const suyas = useMemo(
    () => tasks.rows.filter((t) => t.project_id === id).sort((a, b) => a.sort_order - b.sort_order),
    [tasks.rows, id],
  )
  const hechas = suyas.filter((t) => t.status === 'done').length

  const titulo = proyecto?.name ?? idea?.title ?? ''
  const descripcion = proyecto?.description ?? idea?.notes ?? null
  const documento = proyecto?.document ?? idea?.document ?? null

  const guardarDoc = async (texto: string | null) => {
    await coleccion.update(id, { document: texto })
  }

  const parche = (valores: Record<string, unknown>) =>
    void coleccion.update(id, valores).catch((e) => toast.error(friendlyError(e)))

  async function borrar() {
    const ok = await confirm({
      title: esProyecto ? '¿Borrar el proyecto?' : '¿Borrar la idea?',
      message: `Se eliminará “${titulo}”, su documento y su lienzo.`,
      confirmLabel: 'Borrar',
      danger: true,
    })
    if (!ok) return
    try {
      await coleccion.remove(id)
      toast.success(esProyecto ? 'Proyecto borrado' : 'Idea borrada')
      navegar('/proyectos')
    } catch (e) {
      toast.error(friendlyError(e))
    }
  }

  if (coleccion.loading) return <Spinner label="Abriendo…" />

  if (!proyecto && !idea) {
    return (
      <div className="animate-rise">
        <Link to="/proyectos">
          <Button variant="ghost" icon={<ArrowLeft className="size-4" />}>
            Volver a Proyectos
          </Button>
        </Link>
        <ErrorNote>Eso ya no existe.</ErrorNote>
      </div>
    )
  }

  const frente = idea ? BANK_GROUPS.find((g) => g.key === idea.group_key) : undefined
  const enMiDia = proyecto?.my_day_date === today()
  const color = proyecto?.technologies[0]
    ? TECH_COLOR[proyecto.technologies[0]]
    : idea?.tech
      ? TECH_COLOR[idea.tech]
      : 'var(--accent)'

  return (
    <div className="animate-rise">
      <Link to="/proyectos" className="inline-block">
        <Button variant="ghost" size="sm" icon={<ArrowLeft className="size-4" />}>
          Proyectos
        </Button>
      </Link>

      {/* --- Cabecera --------------------------------------------------------- */}
      <Card className="relative mt-3 mb-5 overflow-hidden p-5 sm:p-6">
        <span aria-hidden className="absolute inset-y-0 left-0 w-1.5" style={{ background: color }} />

        <div className="flex flex-wrap items-start justify-between gap-4 pl-3">
          <div className="min-w-0">
            <h1 className="font-display text-2xl leading-tight font-bold sm:text-4xl">{titulo}</h1>
            {descripcion && (
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-2">{descripcion}</p>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-2">
              {frente && (
                <Badge>
                  <span aria-hidden>{frente.emoji}</span>
                  {frente.label}
                </Badge>
              )}
              {idea && <Badge>{IDEA_STATUS_LABEL[idea.status]}</Badge>}
              {idea?.publish_date && (
                <Link to="/calendario">
                  <Badge tone="accent">
                    <CalendarDays className="size-3" />
                    Sale el {longDate(idea.publish_date)}
                  </Badge>
                </Link>
              )}
              {proyecto && (
                <>
                  <Badge>{PROJECT_AREA_LABEL[proyecto.area]}</Badge>
                  {proyecto.technologies.map((t) => (
                    <Badge key={t} color={TECH_COLOR[t]}>
                      {t}
                    </Badge>
                  ))}
                </>
              )}
              {(idea?.tech ?? null) && <Badge color={TECH_COLOR[idea!.tech!]}>{idea!.tech}</Badge>}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            {proyecto && (
              <IconButton
                label={enMiDia ? 'Quitar de Mi día' : 'Poner en Mi día'}
                onClick={() => parche({ my_day_date: enMiDia ? null : today() })}
                className={enMiDia ? 'text-joy' : ''}
              >
                <Sun className={cx('size-4', enMiDia && 'fill-current')} />
              </IconButton>
            )}
            <IconButton label="Borrar" onClick={() => void borrar()}>
              <Trash2 className="size-4" />
            </IconButton>
          </div>
        </div>

        {/* --- Estado y avance, solo para proyectos de verdad ---------------- */}
        {proyecto && (
          <div className="mt-5 space-y-4 pl-3">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {STATUSES.map((st) => {
                const on = proyecto.status === st
                return (
                  <button
                    key={st}
                    onClick={() =>
                      parche({
                        status: st,
                        ...(st === 'completado' && proyecto.progress < 100 ? { progress: 100 } : {}),
                        updated_at: new Date().toISOString(),
                      })
                    }
                    className={cx(
                      'flex flex-col items-center gap-1 rounded-2xl px-2 py-3 text-[12px] font-bold transition-colors',
                      on
                        ? 'text-accent-ink shadow-glow [background:var(--grad)]'
                        : 'bg-surface-2 text-ink-3 hover:text-ink',
                    )}
                  >
                    <span className="text-base" aria-hidden>
                      {PROJECT_STATUS_EMOJI[st]}
                    </span>
                    {PROJECT_STATUS_LABEL[st]}
                  </button>
                )
              })}
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between text-[13px]">
                <span className="text-ink-3">Avance</span>
                <span className="tnum font-bold">{proyecto.progress}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={proyecto.progress}
                onChange={(e) =>
                  parche({ progress: Number(e.target.value), updated_at: new Date().toISOString() })
                }
                className="w-full accent-[var(--accent)]"
                aria-label="Avance del proyecto"
              />
              <ProgressBar value={proyecto.progress} height={6} />
            </div>
          </div>
        )}
      </Card>

      {/* --- Pestañas --------------------------------------------------------- */}
      <Segmented
        className="mb-5 flex max-w-full"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'documento', label: 'Documento' },
          { value: 'lienzo', label: 'Lienzo' },
          ...(esProyecto
            ? [{ value: 'tareas' as const, label: 'Tareas', count: suyas.length }]
            : []),
        ]}
      />

      {tab === 'documento' && (
        <Documento
          value={documento}
          onSave={guardarDoc}
          placeholder={
            esProyecto
              ? 'De qué va, qué problema resuelve, cómo lo montarías, qué te falta por decidir…'
              : 'El planteamiento, el guion, los puntos que quieres tocar, los enlaces que te sirvieron…'
          }
        />
      )}

      {tab === 'lienzo' && (
        <Canvas
          grande
          parentType={tipo}
          parentId={id}
          emptyHint="Tarjetas sueltas para lo que no cabe en el documento: enlaces, listas, recordatorios."
        />
      )}

      {tab === 'tareas' && esProyecto && (
        <>
          {suyas.length === 0 ? (
            <p className="rounded-3xl border border-dashed border-line-strong px-4 py-12 text-center text-sm text-ink-3">
              Sin tareas todavía. Créalas desde Tareas eligiendo este proyecto.
            </p>
          ) : (
            <>
              <p className="mb-2 flex items-center gap-1.5 px-1 text-[12px] text-ink-3">
                <ListChecks className="size-3.5" />
                <span className="tnum">
                  {hechas} de {suyas.length} completadas
                </span>
              </p>
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
            </>
          )}
        </>
      )}

      {/* Pistas de lo que hay en cada pestaña, para no tener que abrirlas. */}
      <p className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[12px] text-ink-3">
        <span className="inline-flex items-center gap-1.5">
          <FileText className="size-3.5" />
          El documento se guarda solo mientras escribes.
        </span>
        <span className="inline-flex items-center gap-1.5">
          <LayoutGrid className="size-3.5" />
          El lienzo son tarjetas sueltas.
        </span>
      </p>
    </div>
  )
}
