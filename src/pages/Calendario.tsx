import { useMemo, useState, type FormEvent } from 'react'
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  format,
  isSameMonth,
  startOfMonth,
} from 'date-fns'
import { es } from 'date-fns/locale'
import { CalendarDays, Check, ChevronLeft, ChevronRight, Plus, X } from 'lucide-react'
import {
  Button,
  Card,
  cx,
  Drawer,
  ErrorNote,
  Field,
  IconButton,
  Input,
  SectionTitle,
  Select,
  Spinner,
  useToast,
} from '@/components/ui'
import { useCollection } from '@/hooks/useCollection'
import { friendlyError } from '@/lib/supabase'
import { longDate, toISODate, today } from '@/lib/dates'
import { BANK_GROUPS, type BankGroup, type Idea } from '@/lib/types'

const WEEKDAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

/** Un color estable por frente, para reconocerlos de un vistazo en la rejilla. */
const GROUP_COLOR: Record<BankGroup, string> = {
  youtube: '#B4245C',
  linkedin: '#0E7CC4',
  proyectos: '#7C3AED',
  estudio: '#657C12',
  ver: '#6B7280',
}

/** "Por ver" no se publica: es lo que quieres ver tú, no lo que sacas. */
const PUBLICABLES = BANK_GROUPS.filter((g) => g.key !== 'ver')

export default function Calendario() {
  const toast = useToast()
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()))
  const [dia, setDia] = useState<string | null>(null)
  const [frente, setFrente] = useState<BankGroup | 'todos'>('todos')

  const ideas = useCollection<Idea>('ideas', { shape: (q) => q.order('sort_order') })

  const hoy = today()

  /** Lo que hay programado cada día, ya filtrado por frente. */
  const porDia = useMemo(() => {
    const map = new Map<string, Idea[]>()
    for (const i of ideas.rows) {
      if (!i.publish_date) continue
      if (frente !== 'todos' && i.group_key !== frente) continue
      const lista = map.get(i.publish_date) ?? []
      lista.push(i)
      map.set(i.publish_date, lista)
    }
    return map
  }, [ideas.rows, frente])

  /** Lo que aún no tiene día: la cola de la que vas tirando. */
  const sinFecha = useMemo(
    () =>
      ideas.rows.filter(
        (i) =>
          !i.publish_date &&
          i.status !== 'hecha' &&
          i.group_key !== 'ver' &&
          (frente === 'todos' || i.group_key === frente),
      ),
    [ideas.rows, frente],
  )

  const celdas = useMemo(() => {
    const primero = startOfMonth(cursor)
    const dias = eachDayOfInterval({ start: primero, end: endOfMonth(cursor) })
    // Hueco inicial para que el 1 caiga en su día de la semana (lunes primero).
    const hueco = (primero.getDay() + 6) % 7
    return [...Array.from({ length: hueco }, () => null), ...dias]
  }, [cursor])

  const delMes = useMemo(
    () =>
      ideas.rows.filter(
        (i) => i.publish_date && isSameMonth(new Date(`${i.publish_date}T12:00:00`), cursor),
      ),
    [ideas.rows, cursor],
  )

  const programar = (idea: Idea, fecha: string | null) =>
    void ideas
      .update(idea.id, { publish_date: fecha })
      .catch((e) => toast.error(friendlyError(e)))

  const publicar = (idea: Idea, hecha: boolean) =>
    void ideas
      .update(idea.id, {
        status: hecha ? 'hecha' : 'en_curso',
        done_at: hecha ? new Date().toISOString() : null,
      })
      .catch((e) => toast.error(friendlyError(e)))

  return (
    <div className="animate-rise">
      <SectionTitle
        hint="Cuándo sale cada cosa. Arrastra la cola de la derecha a un día, o pulsa el día para colocar algo."
        action={
          <Button variant="outline" onClick={() => setCursor(startOfMonth(new Date()))}>
            Este mes
          </Button>
        }
      >
        Calendario
      </SectionTitle>

      {/* --- Filtro por frente ------------------------------------------------ */}
      <div className="mb-4 flex flex-wrap gap-2">
        <button
          onClick={() => setFrente('todos')}
          className={cx(
            'rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition-colors',
            frente === 'todos'
              ? 'border-transparent bg-accent-soft text-accent'
              : 'border-line bg-surface text-ink-2 hover:border-line-strong',
          )}
        >
          Todo
        </button>
        {PUBLICABLES.map((g) => {
          const on = frente === g.key
          return (
            <button
              key={g.key}
              onClick={() => setFrente(on ? 'todos' : g.key)}
              className={cx(
                'inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition-colors',
                on ? 'border-transparent text-white' : 'border-line bg-surface text-ink-2 hover:border-line-strong',
              )}
              style={on ? { backgroundColor: GROUP_COLOR[g.key] } : undefined}
            >
              <span aria-hidden>{g.emoji}</span>
              {g.short}
            </button>
          )
        })}
      </div>

      {ideas.error && <ErrorNote>{ideas.error}</ErrorNote>}

      {ideas.loading ? (
        <Spinner label="Abriendo el calendario…" />
      ) : (
        <div className="grid gap-5 lg:grid-cols-[1fr_20rem] [&>*]:min-w-0">
          {/* --- La rejilla del mes ------------------------------------------ */}
          <Card className="p-4 sm:p-5">
            <header className="mb-4 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h2 className="font-display text-xl leading-tight font-bold capitalize sm:text-2xl">
                  {format(cursor, 'LLLL yyyy', { locale: es })}
                </h2>
                <p className="text-[12px] text-ink-3">
                  {delMes.length === 0
                    ? 'Nada programado este mes'
                    : `${delMes.length} publicación(es) este mes`}
                </p>
              </div>
              <div className="flex shrink-0">
                <IconButton label="Mes anterior" onClick={() => setCursor((c) => addMonths(c, -1))}>
                  <ChevronLeft className="size-5" />
                </IconButton>
                <IconButton
                  label="Mes siguiente"
                  onClick={() => setCursor((c) => addMonths(c, 1))}
                >
                  <ChevronRight className="size-5" />
                </IconButton>
              </div>
            </header>

            <div className="mb-1.5 grid grid-cols-7 gap-1 sm:gap-1.5">
              {WEEKDAYS.map((d) => (
                <span
                  key={d}
                  className="text-center text-[11px] font-bold tracking-wide text-ink-3 uppercase"
                >
                  {d}
                </span>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
              {celdas.map((d, i) => {
                if (!d) return <span key={`h${i}`} />
                const iso = toISODate(d)
                const items = porDia.get(iso) ?? []
                const esHoy = iso === hoy

                return (
                  <button
                    key={iso}
                    onClick={() => setDia(iso)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault()
                      const id = e.dataTransfer.getData('text/plain')
                      const idea = ideas.rows.find((x) => x.id === id)
                      if (idea) programar(idea, iso)
                    }}
                    className={cx(
                      'flex min-h-20 flex-col gap-1 rounded-xl border p-1.5 text-left transition-colors sm:min-h-24',
                      esHoy
                        ? 'border-accent bg-accent-soft/50'
                        : 'border-line bg-surface-2/50 hover:border-line-strong',
                    )}
                  >
                    <span
                      className={cx(
                        'tnum text-[12px] font-bold',
                        esHoy ? 'text-accent' : 'text-ink-3',
                      )}
                    >
                      {format(d, 'd')}
                    </span>
                    {items.slice(0, 3).map((it) => (
                      <span
                        key={it.id}
                        title={it.title}
                        className={cx(
                          'block truncate rounded-md px-1.5 py-0.5 text-[10px] leading-tight font-semibold text-white',
                          it.status === 'hecha' && 'opacity-45 line-through',
                        )}
                        style={{ backgroundColor: GROUP_COLOR[it.group_key] }}
                      >
                        {it.title}
                      </span>
                    ))}
                    {items.length > 3 && (
                      <span className="text-[10px] font-bold text-ink-3">
                        +{items.length - 3} más
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </Card>

          {/* --- La cola: lo que falta por colocar ---------------------------- */}
          <Card className="h-fit p-4">
            <h2 className="mb-1 font-display text-lg font-bold">Por programar</h2>
            <p className="mb-3 text-[12px] leading-relaxed text-ink-3">
              Ideas de tu banco que todavía no tienen día. Arrástralas a la fecha que quieras.
            </p>

            {sinFecha.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-line-strong px-3 py-6 text-center text-[13px] text-ink-3">
                Nada suelto. Todo lo que tienes en marcha ya tiene fecha.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {sinFecha.map((i) => (
                  <li
                    key={i.id}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData('text/plain', i.id)}
                    className="flex cursor-grab items-center gap-2 rounded-xl border border-line bg-surface-2 px-2.5 py-2 active:cursor-grabbing"
                  >
                    <span
                      aria-hidden
                      className="size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: GROUP_COLOR[i.group_key] }}
                    />
                    <span className="min-w-0 flex-1 truncate text-[13px]">{i.title}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}

      <DiaDrawer
        iso={dia}
        items={dia ? (porDia.get(dia) ?? []) : []}
        candidatas={sinFecha}
        onClose={() => setDia(null)}
        onProgramar={programar}
        onPublicar={publicar}
        onCrear={async (title, group_key) => {
          if (!dia) return
          try {
            await ideas.insert({
              title,
              group_key,
              status: 'idea',
              publish_date: dia,
              sort_order: ideas.rows.length,
            })
          } catch (e) {
            toast.error(friendlyError(e))
          }
        }}
      />
    </div>
  )
}

/* -------------------------------------------------------------------------- */

function DiaDrawer({
  iso,
  items,
  candidatas,
  onClose,
  onProgramar,
  onPublicar,
  onCrear,
}: {
  iso: string | null
  items: Idea[]
  candidatas: Idea[]
  onClose: () => void
  onProgramar: (idea: Idea, fecha: string | null) => void
  onPublicar: (idea: Idea, hecha: boolean) => void
  onCrear: (title: string, group: BankGroup) => Promise<void>
}) {
  const [titulo, setTitulo] = useState('')
  const [grupo, setGrupo] = useState<BankGroup>('youtube')
  const [creando, setCreando] = useState(false)

  if (!iso) return null

  async function crear(e: FormEvent) {
    e.preventDefault()
    if (!titulo.trim()) return
    setCreando(true)
    await onCrear(titulo.trim(), grupo)
    setTitulo('')
    setCreando(false)
  }

  return (
    <Drawer
      open
      onClose={onClose}
      title={longDate(iso)}
      subtitle={
        <span className="flex items-center gap-1.5">
          <CalendarDays className="size-3.5" />
          {items.length === 0 ? 'Sin nada programado' : `${items.length} publicación(es)`}
        </span>
      }
    >
      <div className="space-y-6">
        {/* --- Lo que ya está puesto ese día ------------------------------- */}
        {items.length > 0 && (
          <ul className="space-y-2">
            {items.map((i) => {
              const g = BANK_GROUPS.find((x) => x.key === i.group_key)
              const hecha = i.status === 'hecha'
              return (
                <Card as="li" key={i.id} className="flex items-center gap-3 p-3">
                  <span
                    aria-hidden
                    className="grid size-8 shrink-0 place-items-center rounded-xl text-base"
                    style={{ backgroundColor: `${GROUP_COLOR[i.group_key]}22` }}
                  >
                    {g?.emoji}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={cx(
                        'block truncate text-sm font-medium',
                        hecha && 'text-ink-3 line-through decoration-2',
                      )}
                    >
                      {i.title}
                    </span>
                    <span className="block text-[12px] text-ink-3">{g?.short}</span>
                  </span>
                  <IconButton
                    label={hecha ? 'Marcar como no publicada' : 'Marcar como publicada'}
                    onClick={() => onPublicar(i, !hecha)}
                    className={hecha ? 'text-good' : ''}
                  >
                    <Check className="size-4" />
                  </IconButton>
                  <IconButton label="Quitar de este día" onClick={() => onProgramar(i, null)}>
                    <X className="size-4" />
                  </IconButton>
                </Card>
              )
            })}
          </ul>
        )}

        {/* --- Traer una idea que ya tienes -------------------------------- */}
        {candidatas.length > 0 && (
          <div>
            <p className="mb-2 text-[12px] font-bold tracking-wide text-ink-3 uppercase">
              Traer del banco
            </p>
            <ul className="space-y-1.5">
              {candidatas.map((i) => {
                const g = BANK_GROUPS.find((x) => x.key === i.group_key)
                return (
                  <li key={i.id}>
                    <button
                      onClick={() => onProgramar(i, iso)}
                      className="flex w-full items-center gap-2.5 rounded-2xl border border-line bg-surface-2 px-3 py-2.5 text-left transition-colors hover:border-accent hover:bg-accent-soft"
                    >
                      <Plus className="size-4 shrink-0 text-accent" />
                      <span aria-hidden>{g?.emoji}</span>
                      <span className="min-w-0 flex-1 truncate text-sm">{i.title}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        {/* --- O escribir algo nuevo directamente aquí ---------------------- */}
        <form onSubmit={crear} className="space-y-3 border-t border-line pt-5">
          <p className="text-[12px] font-bold tracking-wide text-ink-3 uppercase">
            O apuntar algo nuevo
          </p>
          <Field label="Qué publicas">
            <Input
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Vídeo sobre las skills de Power Platform…"
            />
          </Field>
          <Field label="Dónde">
            <Select value={grupo} onChange={(e) => setGrupo(e.target.value as BankGroup)}>
              {PUBLICABLES.map((g) => (
                <option key={g.key} value={g.key}>
                  {g.emoji} {g.label}
                </option>
              ))}
            </Select>
          </Field>
          <Button type="submit" variant="primary" className="w-full" loading={creando}>
            Añadir a este día
          </Button>
          <p className="text-[12px] leading-relaxed text-ink-3">
            Queda también en su frente del banco, en Proyectos, con la fecha puesta.
          </p>
        </form>
      </div>
    </Drawer>
  )
}
