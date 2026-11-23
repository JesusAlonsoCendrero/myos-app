import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { CalendarDays, Check, Plus, Undo2, X } from 'lucide-react'
import { CalendarioPlanner, GROUP_COLOR } from '@/components/CalendarioPlanner'
import {
  Badge,
  Button,
  Card,
  Checkbox,
  cx,
  Drawer,
  ErrorNote,
  Field,
  IconButton,
  Input,
  ProgressBar,
  SectionTitle,
  Segmented,
  Select,
  Spinner,
  useToast,
} from '@/components/ui'
import { useCollection } from '@/hooks/useCollection'
import { friendlyError } from '@/lib/supabase'
import {
  dayShort,
  longDate,
  today,
  weekLabel,
  weekNumberLabel,
  weekStart,
} from '@/lib/dates'
import { BANK_GROUPS, type BankGroup, type Idea } from '@/lib/types'

/** "Por ver" no se publica: es lo que quieres ver tú, no lo que sacas. */
const PUBLICABLES = BANK_GROUPS.filter((g) => g.key !== 'ver')

/** Lo que dura a la vista el aviso con el botón de deshacer. */
const DURA_DESHACER = 7000

/** Guardado de la fecha de una idea: lo último confirmado y lo último pedido. */
interface Escritura {
  confirmada: string | null
  deseada: string | null
  cola: Promise<void>
}

export default function Calendario() {
  const toast = useToast()
  // En el móvil el mes no deja leer los títulos: se empieza por la semana.
  const [vista, setVista] = useState<'semana' | 'mes' | 'lista'>(() =>
    window.matchMedia('(max-width: 767px)').matches ? 'semana' : 'mes',
  )
  const [cursor, setCursor] = useState(() => new Date())
  const [dia, setDia] = useState<string | null>(null)
  const [frente, setFrente] = useState<BankGroup | 'todos'>('todos')
  const [deshacer, setDeshacer] = useState<{
    id: string
    titulo: string
    antes: string | null
    despues: string | null
  } | null>(null)
  const escrituras = useRef(new Map<string, Escritura>())

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

  /**
   * Todo lo programado, repartido por semanas y ordenado por día. La lista no
   * depende del mes que estés mirando: enseña el calendario entero para que no
   * se te escape nada por estar en otra página.
   */
  const porSemana = useMemo(() => {
    const map = new Map<string, Idea[]>()
    for (const i of ideas.rows) {
      if (!i.publish_date) continue
      if (frente !== 'todos' && i.group_key !== frente) continue
      const lunes = weekStart(new Date(`${i.publish_date}T12:00:00`))
      const lista = map.get(lunes) ?? []
      lista.push(i)
      map.set(lunes, lista)
    }
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([semana, items]) => ({
        semana,
        items: items.sort((a, b) => (a.publish_date ?? '').localeCompare(b.publish_date ?? '')),
      }))
  }, [ideas.rows, frente])

  useEffect(() => {
    if (!deshacer) return
    const t = window.setTimeout(() => setDeshacer(null), DURA_DESHACER)
    return () => window.clearTimeout(t)
  }, [deshacer])

  const pintarFecha = (id: string, fecha: string | null) =>
    ideas.setRows((prev) => prev.map((r) => (r.id === id ? { ...r, publish_date: fecha } : r)))

  /**
   * La tarjeta cambia de día al soltarla y se guarda por detrás. Las escrituras
   * de una misma idea van en fila y solo se envía la última fecha pedida, para
   * que dos movimientos seguidos no puedan llegar al revés. Si falla, vuelve a
   * la última fecha que el servidor confirmó.
   */
  function moverIdea(idea: Idea, fecha: string | null) {
    const e = escrituras.current.get(idea.id) ?? {
      confirmada: idea.publish_date,
      deseada: idea.publish_date,
      cola: Promise.resolve(),
    }
    escrituras.current.set(idea.id, e)
    e.deseada = fecha
    pintarFecha(idea.id, fecha)

    e.cola = e.cola.then(async () => {
      if (e.deseada === e.confirmada) return
      const destino = e.deseada
      try {
        await ideas.update(idea.id, { publish_date: destino })
        e.confirmada = destino
        // La respuesta pinta lo guardado; si ya la has vuelto a mover, manda eso.
        if (e.deseada !== destino) pintarFecha(idea.id, e.deseada)
      } catch (err) {
        e.deseada = e.confirmada
        pintarFecha(idea.id, e.confirmada)
        setDeshacer(null)
        toast.error(friendlyError(err))
      }
    })
  }

  const programar = (idea: Idea, fecha: string | null) => {
    if (idea.publish_date === fecha) return
    setDeshacer({ id: idea.id, titulo: idea.title, antes: idea.publish_date, despues: fecha })
    moverIdea(idea, fecha)
  }

  const deshacerMovimiento = () => {
    if (!deshacer) return
    const idea = ideas.rows.find((i) => i.id === deshacer.id)
    if (idea) moverIdea(idea, deshacer.antes)
    setDeshacer(null)
  }

  const publicar = (idea: Idea, hecha: boolean) =>
    void ideas
      .update(idea.id, {
        status: hecha ? 'hecha' : 'en_curso',
        done_at: hecha ? new Date().toISOString() : null,
      })
      .catch((e) => toast.error(friendlyError(e)))

  return (
    <div className="animate-rise">
      <SectionTitle hint="Arrastra cualquier publicación a otro día. Suéltala en Por programar para quitarle la fecha.">
        Calendario
      </SectionTitle>

      {/* --- Filtro por frente y vista ---------------------------------------- */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="order-last ml-auto flex items-center gap-2 max-sm:ml-0 max-sm:w-full max-sm:justify-between">
          <Segmented
            value={vista}
            onChange={setVista}
            options={[
              { value: 'semana', label: 'Semana' },
              { value: 'mes', label: 'Mes' },
              { value: 'lista', label: 'Lista' },
            ]}
          />
          {vista !== 'lista' && (
            <Button variant="outline" onClick={() => setCursor(new Date())}>
              Hoy
            </Button>
          )}
        </div>
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
      ) : vista === 'lista' ? (
        <ListaPorSemanas
          semanas={porSemana}
          sinFecha={sinFecha}
          onPublicar={publicar}
          onQuitarFecha={(i) => programar(i, null)}
        />
      ) : (
        <CalendarioPlanner
          vista={vista}
          cursor={cursor}
          onCursor={setCursor}
          ideas={ideas.rows}
          porDia={porDia}
          sinFecha={sinFecha}
          hoy={hoy}
          onMover={programar}
          onAbrirDia={setDia}
        />
      )}

      {/* Al body: `animate-rise` deja un transform y romperia el position:fixed. */}
      {deshacer &&
        createPortal(
          <div
            role="status"
            className="fixed bottom-24 left-1/2 z-50 flex w-[min(30rem,calc(100vw-2rem))] -translate-x-1/2 items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-2.5 shadow-lift sm:bottom-6"
          >
            <p className="min-w-0 flex-1 text-[13px] text-ink-2">
              <span className="block truncate font-semibold text-ink">{deshacer.titulo}</span>
              {deshacer.despues
                ? `Movida al ${format(parseISO(deshacer.despues), "EEEE d 'de' MMMM", { locale: es })}`
                : 'Ahora está sin fecha'}
            </p>
            <Button variant="outline" onClick={deshacerMovimiento}>
              <Undo2 className="size-4" />
              Deshacer
            </Button>
          </div>,
          document.body,
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

/**
 * La misma información del mes, pero en columna y partida por semanas. Aquí no
 * se coloca nada: se va tachando lo que ya has sacado.
 */
function ListaPorSemanas({
  semanas,
  sinFecha,
  onPublicar,
  onQuitarFecha,
}: {
  semanas: Array<{ semana: string; items: Idea[] }>
  sinFecha: Idea[]
  onPublicar: (idea: Idea, hecha: boolean) => void
  onQuitarFecha: (idea: Idea) => void
}) {
  const estaSemana = weekStart(new Date())

  if (semanas.length === 0) {
    return (
      <Card className="px-5 py-12 text-center">
        <p className="text-sm leading-relaxed text-ink-3">
          Todavía no has puesto fecha a nada. Cambia a la vista de Mes y arrastra una idea a un
          día.
        </p>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {semanas.map(({ semana, items }) => {
        const hechas = items.filter((i) => i.status === 'hecha').length
        const actual = semana === estaSemana
        const pasada = semana < estaSemana

        return (
          <section key={semana}>
            <header className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 px-1">
              <h2
                className={cx(
                  'font-display text-lg font-bold',
                  pasada && hechas < items.length && 'text-bad',
                )}
              >
                {weekNumberLabel(semana)}
              </h2>
              <span className="text-[13px] text-ink-3">{weekLabel(semana)}</span>
              {actual && <Badge tone="accent">Esta semana</Badge>}
              {pasada && hechas < items.length && <Badge tone="bad">Se te pasó</Badge>}
              <span className="tnum ml-auto text-[12px] font-bold text-ink-3">
                {hechas}/{items.length}
              </span>
              <div className="w-20 shrink-0">
                <ProgressBar value={items.length ? (hechas / items.length) * 100 : 0} height={5} />
              </div>
            </header>

            <ul className="space-y-2">
              {items.map((i) => {
                const g = BANK_GROUPS.find((x) => x.key === i.group_key)
                const hecha = i.status === 'hecha'
                const dia = new Date(`${i.publish_date}T12:00:00`)

                return (
                  <Card
                    as="li"
                    key={i.id}
                    className={cx(
                      'flex items-center gap-3 p-3 transition-shadow duration-200 hover:shadow-lift',
                      hecha && 'opacity-60',
                    )}
                  >
                    <Checkbox
                      checked={hecha}
                      onChange={(v) => onPublicar(i, v)}
                      color={GROUP_COLOR[i.group_key]}
                    />

                    {/* El día, para no tener que mirar la fecha entera. */}
                    <span className="grid w-11 shrink-0 place-items-center rounded-xl bg-surface-2 py-1">
                      <span className="text-[10px] font-bold text-ink-3 uppercase">
                        {dayShort(i.publish_date!)}
                      </span>
                      <span className="tnum font-display text-[15px] leading-none font-bold">
                        {format(dia, 'd')}
                      </span>
                    </span>

                    <Link to={`/ideas/${i.id}`} className="min-w-0 flex-1">
                      <span
                        className={cx(
                          'block truncate text-sm font-medium underline-offset-4 hover:underline',
                          hecha && 'text-ink-3 line-through decoration-2',
                        )}
                      >
                        {i.title}
                      </span>
                      <span className="mt-0.5 flex items-center gap-1.5 text-[12px] text-ink-3">
                        <span aria-hidden>{g?.emoji}</span>
                        {g?.short}
                      </span>
                    </Link>

                    <IconButton label="Quitarle la fecha" onClick={() => onQuitarFecha(i)}>
                      <X className="size-4" />
                    </IconButton>
                  </Card>
                )
              })}
            </ul>
          </section>
        )
      })}

      {sinFecha.length > 0 && (
        <section>
          <header className="mb-2 flex items-center gap-3 px-1">
            <h2 className="font-display text-lg font-bold text-ink-3">Sin fecha</h2>
            <span className="tnum text-[12px] font-bold text-ink-3">{sinFecha.length}</span>
          </header>
          <ul className="space-y-2">
            {sinFecha.map((i) => {
              const g = BANK_GROUPS.find((x) => x.key === i.group_key)
              return (
                <Card as="li" key={i.id} className="flex items-center gap-3 p-3">
                  <span
                    aria-hidden
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: GROUP_COLOR[i.group_key] }}
                  />
                  <Link to={`/ideas/${i.id}`} className="min-w-0 flex-1">
                    <span className="block truncate text-sm underline-offset-4 hover:underline">
                      {i.title}
                    </span>
                    <span className="mt-0.5 block text-[12px] text-ink-3">
                      {g?.emoji} {g?.short}
                    </span>
                  </Link>
                </Card>
              )
            })}
          </ul>
        </section>
      )}
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
