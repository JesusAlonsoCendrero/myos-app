import { useEffect, useMemo, useState, type HTMLAttributes, type Ref } from 'react'
import { createPortal } from 'react-dom'
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MeasuringStrategy,
  MouseSensor,
  TouchSensor,
  defaultDropAnimationSideEffects,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type KeyboardCoordinateGetter,
} from '@dnd-kit/core'
import {
  addDays,
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
} from 'date-fns'
import { es } from 'date-fns/locale'
import { CalendarX2, Check, ChevronLeft, ChevronRight, CircleAlert, Plus, Search } from 'lucide-react'
import { Card, cx, IconButton } from '@/components/ui'
import { toISODate, weekLabel, weekNumberLabel, weekStart } from '@/lib/dates'
import { BANK_GROUPS, type BankGroup, type Idea } from '@/lib/types'

/** Un color estable por frente, para reconocerlos de un vistazo en la rejilla. */
export const GROUP_COLOR: Record<BankGroup, string> = {
  youtube: '#B4245C',
  linkedin: '#0E7CC4',
  proyectos: '#7C3AED',
  estudio: '#657C12',
  ver: '#6B7280',
}

export type VistaPlanner = 'semana' | 'mes'

const WEEKDAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
const SEMANA = { weekStartsOn: 1 } as const
/** Cuántas caben en una celda del mes antes de plegar el resto en "+N más". */
const MAX_EN_CELDA = 3
/** Lo que hay que sostener una idea sobre una flecha para cambiar de página. */
const ESPERA_PAGINA = 700

const ID_COLA = 'cola'
const idDia = (iso: string) => `dia:${iso}`

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`

/** El destino en palabras, para los avisos del lector de pantalla. */
function nombreDestino(id: string | number): string {
  const s = String(id)
  if (s === ID_COLA) return 'Por programar'
  if (s.startsWith('dia:')) return format(parseISO(s.slice(4)), "EEEE d 'de' MMMM", { locale: es })
  return s === 'nav:1' ? 'la página siguiente' : 'la página anterior'
}

/**
 * Con ratón o dedo manda el puntero: la celda es la que tienes debajo, no la que
 * más solape con la tarjeta. Con teclado no hay puntero: hace de puntero la
 * esquina de la tarjeta, porque la copia que viaja es más ancha que una celda.
 */
const colision: CollisionDetection = (args) =>
  pointerWithin(
    args.pointerCoordinates
      ? args
      : {
          ...args,
          pointerCoordinates: { x: args.collisionRect.left + 8, y: args.collisionRect.top + 8 },
        },
  )

/** Con el teclado, cada flecha salta una celda entera. */
const saltoDeCelda: KeyboardCoordinateGetter = (event, { currentCoordinates }) => {
  const paso = (
    { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] } as Record<
      string,
      [number, number]
    >
  )[event.code]
  const celda = document.querySelector('[data-celda]')?.getBoundingClientRect()
  if (!paso || !celda) return undefined
  event.preventDefault()
  return {
    x: currentCoordinates.x + paso[0] * (celda.width + 6),
    y: currentCoordinates.y + paso[1] * (celda.height + 6),
  }
}

export function CalendarioPlanner({
  vista,
  cursor,
  onCursor,
  ideas,
  porDia,
  sinFecha,
  hoy,
  onMover,
  onAbrirDia,
}: {
  vista: VistaPlanner
  cursor: Date
  onCursor: (next: (c: Date) => Date) => void
  /** Todas, para encontrar la que se arrastra aunque el filtro la oculte. */
  ideas: Idea[]
  porDia: Map<string, Idea[]>
  sinFecha: Idea[]
  hoy: string
  onMover: (idea: Idea, fecha: string | null) => void
  onAbrirDia: (iso: string) => void
}) {
  const [activaId, setActivaId] = useState<string | null>(null)
  const [sobre, setSobre] = useState<string | null>(null)

  const sensors = useSensors(
    // Moverla 6 píxeles la coge; un clic seco sigue abriendo el día.
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    // Con el dedo hay que mantener pulsado, para que deslizar siga siendo scroll.
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: saltoDeCelda }),
  )

  const pasar = (dir: 1 | -1) =>
    onCursor((c) => (vista === 'mes' ? addMonths(c, dir) : addDays(c, 7 * dir)))

  // Sostener la idea sobre una flecha va pasando de mes o de semana.
  useEffect(() => {
    if (sobre !== 'nav:1' && sobre !== 'nav:-1') return
    const dir = sobre === 'nav:1' ? 1 : -1
    const t = window.setInterval(
      () => onCursor((c) => (vista === 'mes' ? addMonths(c, dir) : addDays(c, 7 * dir))),
      ESPERA_PAGINA,
    )
    return () => window.clearInterval(t)
  }, [sobre, vista, onCursor])

  const dias = useMemo(
    () =>
      vista === 'mes'
        ? eachDayOfInterval({
            // Semanas completas: así puedes soltar en los días del mes de al lado.
            start: startOfWeek(startOfMonth(cursor), SEMANA),
            end: endOfWeek(endOfMonth(cursor), SEMANA),
          })
        : eachDayOfInterval({
            start: startOfWeek(cursor, SEMANA),
            end: endOfWeek(cursor, SEMANA),
          }),
    [vista, cursor],
  )

  const resumen = useMemo(() => {
    const periodo = vista === 'mes' ? dias.filter((d) => isSameMonth(d, cursor)) : dias
    const items = periodo.flatMap((d) => porDia.get(toISODate(d)) ?? [])
    const hechas = items.filter((i) => i.status === 'hecha').length
    const atrasadas = items.filter(
      (i) => i.status !== 'hecha' && (i.publish_date ?? '') < hoy,
    ).length
    return { total: items.length, hechas, atrasadas }
  }, [dias, vista, cursor, porDia, hoy])

  const activa = activaId ? (ideas.find((i) => i.id === activaId) ?? null) : null
  const tituloDe = (id: string | number) =>
    ideas.find((i) => i.id === String(id))?.title ?? 'Publicación'

  const limpiar = () => {
    setActivaId(null)
    setSobre(null)
  }

  function onDragEnd(e: DragEndEvent) {
    const idea = ideas.find((i) => i.id === String(e.active.id))
    const destino = e.over ? String(e.over.id) : null
    limpiar()
    if (!idea || !destino) return
    if (destino === ID_COLA) {
      if (idea.publish_date) onMover(idea, null)
    } else if (destino.startsWith('dia:')) {
      const iso = destino.slice(4)
      if (iso !== idea.publish_date) onMover(idea, iso)
    }
  }

  const destinoTexto =
    sobre === ID_COLA
      ? 'Quitar fecha'
      : sobre?.startsWith('dia:')
        ? format(parseISO(sobre.slice(4)), 'EEE d MMM', { locale: es })
        : null

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={colision}
      // Al pasar de mes aparecen celdas nuevas: hay que medirlas durante el arrastre.
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      accessibility={{
        screenReaderInstructions: {
          draggable:
            'Pulsa espacio para coger la publicación, muévela con las flechas y pulsa espacio otra vez para soltarla. Escape cancela.',
        },
        announcements: {
          onDragStart: ({ active }) => `Cogida: ${tituloDe(active.id)}`,
          onDragOver: ({ over }) => (over ? `Sobre ${nombreDestino(over.id)}` : 'Fuera del calendario'),
          onDragEnd: ({ active, over }) =>
            over ? `${tituloDe(active.id)}, soltada en ${nombreDestino(over.id)}` : 'Sin cambios',
          onDragCancel: () => 'Movimiento cancelado',
        },
      }}
      onDragStart={(e) => setActivaId(String(e.active.id))}
      onDragOver={(e) => setSobre(e.over ? String(e.over.id) : null)}
      onDragEnd={onDragEnd}
      onDragCancel={limpiar}
    >
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <Card className="min-w-0 p-3 sm:p-5">
          <header className="mb-4 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="font-display text-xl leading-tight font-bold capitalize sm:text-2xl">
                {vista === 'mes'
                  ? format(cursor, 'LLLL yyyy', { locale: es })
                  : weekNumberLabel(weekStart(cursor))}
              </h2>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px] text-ink-3">
                {vista === 'semana' && <span>{weekLabel(weekStart(cursor))}</span>}
                {resumen.total === 0 ? (
                  <span>Nada programado</span>
                ) : (
                  <>
                    <span>{plural(resumen.total, 'publicación', 'publicaciones')}</span>
                    <span className="text-good">
                      {plural(resumen.hechas, 'hecha', 'hechas')}
                    </span>
                    {resumen.atrasadas > 0 && (
                      <span className="font-semibold text-bad">
                        {plural(resumen.atrasadas, 'atrasada', 'atrasadas')}
                      </span>
                    )}
                  </>
                )}
              </p>
            </div>
            <div className="flex shrink-0 gap-1">
              <FlechaPagina
                dir={-1}
                label={vista === 'mes' ? 'Mes anterior' : 'Semana anterior'}
                onClick={() => pasar(-1)}
              />
              <FlechaPagina
                dir={1}
                label={vista === 'mes' ? 'Mes siguiente' : 'Semana siguiente'}
                onClick={() => pasar(1)}
              />
            </div>
          </header>

          {vista === 'mes' ? (
            <>
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
                {dias.map((d) => {
                  const iso = toISODate(d)
                  return (
                    <CeldaMes
                      key={iso}
                      dia={d}
                      iso={iso}
                      hoy={hoy}
                      fuera={!isSameMonth(d, cursor)}
                      items={porDia.get(iso) ?? []}
                      arrastrando={Boolean(activa)}
                      onAbrir={() => onAbrirDia(iso)}
                    />
                  )
                })}
              </div>
            </>
          ) : (
            <div className="grid gap-2 md:grid-cols-7 md:gap-1.5">
              {dias.map((d) => {
                const iso = toISODate(d)
                return (
                  <ColumnaSemana
                    key={iso}
                    dia={d}
                    iso={iso}
                    hoy={hoy}
                    items={porDia.get(iso) ?? []}
                    onAbrir={() => onAbrirDia(iso)}
                  />
                )
              })}
            </div>
          )}
        </Card>

        <ColaPorProgramar
          items={sinFecha}
          hoy={hoy}
          recibeFechada={Boolean(activa?.publish_date)}
        />
      </div>

      {/* Al body: `animate-rise` deja un transform en la página y descolocaría la capa. */}
      {createPortal(
        <DragOverlay
          dropAnimation={{
            duration: 200,
            easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
            sideEffects: defaultDropAnimationSideEffects({
              styles: { active: { opacity: '0' } },
            }),
          }}
        >
          {activa && (
            <div className="w-44 cursor-grabbing rounded-xl bg-surface p-1 shadow-lift">
              <Tarjeta idea={activa} variante="mes" hoy={hoy} />
              {destinoTexto && (
                <p className="mt-1 truncate px-1 text-[11px] font-bold text-accent first-letter:uppercase">
                  → {destinoTexto}
                </p>
              )}
            </div>
          )}
        </DragOverlay>,
        document.body,
      )}
    </DndContext>
  )
}

/* -------------------------------------------------------------------------- */

function FlechaPagina({
  dir,
  label,
  onClick,
}: {
  dir: 1 | -1
  label: string
  onClick: () => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `nav:${dir}` })
  const Icono = dir === 1 ? ChevronRight : ChevronLeft
  return (
    <span
      ref={setNodeRef}
      className={cx('rounded-xl transition-colors', isOver && 'bg-accent-soft text-accent')}
    >
      <IconButton label={label} onClick={onClick}>
        <Icono className="size-5" />
      </IconButton>
    </span>
  )
}

function CeldaMes({
  dia,
  iso,
  hoy,
  fuera,
  items,
  arrastrando,
  onAbrir,
}: {
  dia: Date
  iso: string
  hoy: string
  fuera: boolean
  items: Idea[]
  arrastrando: boolean
  onAbrir: () => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: idDia(iso) })
  const [desplegada, setDesplegada] = useState(false)
  const esHoy = iso === hoy
  const finde = dia.getDay() === 0 || dia.getDay() === 6
  const visibles = desplegada ? items : items.slice(0, MAX_EN_CELDA)

  // Un solo fondo elegido a propósito: dos bg-* en la misma clase se pisan.
  const fondo = isOver
    ? 'bg-accent-soft'
    : esHoy
      ? 'bg-accent-soft/40'
      : fuera
        ? 'bg-transparent'
        : finde
          ? 'bg-surface-2/25'
          : 'bg-surface-2/60'

  return (
    <div
      ref={setNodeRef}
      data-celda
      onClick={onAbrir}
      className={cx(
        'group flex min-h-24 min-w-0 cursor-pointer flex-col gap-1 rounded-xl border p-1 transition-[background-color,border-color,box-shadow] duration-150 sm:p-1.5 lg:min-h-[6.75rem]',
        fondo,
        isOver
          ? 'border-accent shadow-[0_0_0_2px_var(--accent)]'
          : esHoy
            ? 'border-accent'
            : fuera
              ? 'border-line/50'
              : 'border-line hover:border-line-strong',
        arrastrando && !isOver && 'border-dashed',
      )}
    >
      <div className="flex items-center justify-between">
        <button
          type="button"
          aria-label={`Abrir ${format(dia, "EEEE d 'de' MMMM", { locale: es })}`}
          className={cx(
            'tnum inline-flex h-6 min-w-6 items-center justify-center gap-1 rounded-full px-1 text-[12px] font-bold whitespace-nowrap',
            esHoy
              ? 'bg-accent text-accent-ink'
              : fuera || iso < hoy
                ? 'text-ink-3/70'
                : 'text-ink-2',
          )}
        >
          {format(dia, 'd')}
          {dia.getDate() === 1 && (
            <span className="hidden sm:inline">{format(dia, 'MMM', { locale: es })}</span>
          )}
        </button>
        <Plus
          aria-hidden
          className="size-3.5 text-ink-3 opacity-0 transition-opacity group-hover:opacity-100"
        />
      </div>

      {visibles.map((it) => (
        <IdeaArrastrable key={it.id} idea={it} variante="mes" hoy={hoy} />
      ))}

      {items.length > MAX_EN_CELDA && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            setDesplegada((v) => !v)
          }}
          aria-label={desplegada ? 'Ver menos' : `Ver ${items.length - MAX_EN_CELDA} más`}
          className="rounded px-1 text-left text-[11px] font-bold whitespace-nowrap text-ink-3 hover:text-ink"
        >
          {desplegada ? (
            'Menos'
          ) : (
            <>
              +{items.length - MAX_EN_CELDA}
              <span className="hidden sm:inline"> más</span>
            </>
          )}
        </button>
      )}
    </div>
  )
}

function ColumnaSemana({
  dia,
  iso,
  hoy,
  items,
  onAbrir,
}: {
  dia: Date
  iso: string
  hoy: string
  items: Idea[]
  onAbrir: () => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: idDia(iso) })
  const esHoy = iso === hoy
  return (
    <div
      ref={setNodeRef}
      data-celda
      onClick={onAbrir}
      className={cx(
        'group flex min-h-24 min-w-0 cursor-pointer flex-col gap-1.5 rounded-2xl border p-2 transition-[background-color,border-color,box-shadow] duration-150 md:min-h-[30rem]',
        isOver
          ? 'border-accent bg-accent-soft shadow-[0_0_0_2px_var(--accent)]'
          : esHoy
            ? 'border-accent bg-accent-soft/40'
            : 'border-line bg-surface-2/50 hover:border-line-strong',
      )}
    >
      <button
        type="button"
        aria-label={`Abrir ${format(dia, "EEEE d 'de' MMMM", { locale: es })}`}
        className="flex items-center justify-between pb-1 text-left"
      >
        <span>
          <span className="block text-[11px] font-bold tracking-wide text-ink-3 uppercase">
            {format(dia, 'EEE', { locale: es })}
          </span>
          <span
            className={cx(
              'tnum font-display text-xl leading-none font-bold',
              esHoy ? 'text-accent' : iso < hoy ? 'text-ink-3' : 'text-ink',
            )}
          >
            {format(dia, 'd')}
          </span>
        </span>
        <Plus
          aria-hidden
          className="size-4 text-ink-3 opacity-0 transition-opacity group-hover:opacity-100"
        />
      </button>
      {items.map((it) => (
        <IdeaArrastrable key={it.id} idea={it} variante="semana" hoy={hoy} />
      ))}
    </div>
  )
}

function ColaPorProgramar({
  items,
  hoy,
  recibeFechada,
}: {
  items: Idea[]
  hoy: string
  /** Se está arrastrando algo con fecha: aquí se le puede quitar. */
  recibeFechada: boolean
}) {
  const { setNodeRef, isOver } = useDroppable({ id: ID_COLA })
  const [busca, setBusca] = useState('')
  const q = busca.trim().toLowerCase()
  const filtradas = q ? items.filter((i) => i.title.toLowerCase().includes(q)) : items

  return (
    <div ref={setNodeRef} className="min-w-0 lg:sticky lg:top-6">
      <Card
        className={cx(
          'flex flex-col p-4 lg:max-h-[calc(100dvh-3rem)]',
          isOver && recibeFechada && 'shadow-[0_0_0_2px_var(--accent)]',
        )}
      >
        <div className="mb-1 flex items-baseline justify-between gap-2">
          <h2 className="font-display text-lg font-bold">Por programar</h2>
          <span className="tnum text-[12px] font-bold text-ink-3">{items.length}</span>
        </div>

        {recibeFechada ? (
          <p
            className={cx(
              'my-2 flex items-center justify-center gap-2 rounded-xl border border-dashed px-3 py-4 text-[13px] font-semibold',
              isOver ? 'border-accent bg-accent-soft text-accent' : 'border-line-strong text-ink-2',
            )}
          >
            <CalendarX2 className="size-4" />
            Suelta aquí para quitarle la fecha
          </p>
        ) : (
          <p className="mb-3 text-[12px] leading-relaxed text-ink-3">
            Ideas sin día. Arrástralas a la fecha que quieras.
          </p>
        )}

        {items.length > 6 && (
          <label className="mb-2 flex items-center gap-2 rounded-xl border border-line bg-surface-2 px-2.5 py-1.5 focus-within:border-accent">
            <Search aria-hidden className="size-3.5 shrink-0 text-ink-3" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar idea…"
              aria-label="Buscar idea por programar"
              className="w-full min-w-0 bg-transparent text-[13px] outline-none placeholder:text-ink-3"
            />
          </label>
        )}

        {filtradas.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line-strong px-3 py-6 text-center text-[13px] text-ink-3">
            {q ? 'Ninguna idea coincide.' : 'Nada suelto. Todo lo que tienes en marcha ya tiene fecha.'}
          </p>
        ) : (
          <ul className="-mr-1 min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1">
            {filtradas.map((i) => (
              <li key={i.id}>
                <IdeaArrastrable idea={i} variante="cola" hoy={hoy} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}

/* -------------------------------------------------------------------------- */

type Variante = 'mes' | 'semana' | 'cola'

function IdeaArrastrable({ idea, variante, hoy }: { idea: Idea; variante: Variante; hoy: string }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: idea.id,
    attributes: { roleDescription: 'publicación arrastrable' },
  })
  return (
    <Tarjeta
      ref={setNodeRef}
      idea={idea}
      variante={variante}
      hoy={hoy}
      fantasma={isDragging}
      {...attributes}
      {...listeners}
    />
  )
}

function Tarjeta({
  idea,
  variante,
  hoy,
  fantasma,
  ref,
  className,
  ...rest
}: {
  idea: Idea
  variante: Variante
  hoy: string
  /** Es la de origen mientras viaja la copia: queda como hueco. */
  fantasma?: boolean
  ref?: Ref<HTMLDivElement>
} & HTMLAttributes<HTMLDivElement>) {
  const color = GROUP_COLOR[idea.group_key]
  const grupo = BANK_GROUPS.find((g) => g.key === idea.group_key)
  const hecha = idea.status === 'hecha'
  const atrasada = !hecha && Boolean(idea.publish_date) && idea.publish_date! < hoy
  const estado = hecha ? ' (hecha)' : atrasada ? ' (se te pasó)' : ''

  const marca = hecha ? (
    <Check aria-hidden className="size-3 shrink-0 text-good" strokeWidth={3} />
  ) : atrasada ? (
    <CircleAlert aria-hidden className="size-3 shrink-0 text-bad" strokeWidth={2.5} />
  ) : null

  const base = cx(
    'min-w-0 cursor-grab touch-manipulation select-none outline-none transition-opacity focus-visible:ring-2 focus-visible:ring-accent active:cursor-grabbing',
    fantasma && 'opacity-25',
    !fantasma && hecha && 'opacity-60',
    className,
  )

  if (variante === 'cola') {
    return (
      <div
        ref={ref}
        title={idea.title}
        {...rest}
        className={cx(
          base,
          'flex items-center gap-2 rounded-xl border border-line bg-surface-2 px-2.5 py-2 hover:border-line-strong',
        )}
      >
        <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
        <span className="min-w-0 flex-1 truncate text-[13px]">{idea.title}</span>
      </div>
    )
  }

  const fondo = { background: `color-mix(in srgb, ${color} 24%, var(--surface))`, borderLeftColor: color }

  if (variante === 'semana') {
    return (
      <div
        ref={ref}
        title={`${idea.title}${estado}`}
        {...rest}
        style={{ ...rest.style, ...fondo }}
        className={cx(base, 'rounded-xl border-l-[3px] px-2 py-1.5 text-ink')}
      >
        <span
          className={cx(
            'line-clamp-4 text-[12.5px] leading-snug font-semibold',
            hecha && 'line-through decoration-1',
          )}
        >
          {idea.title}
        </span>
        <span className="mt-1 flex items-center gap-1 text-[11px] text-ink-2">
          <span aria-hidden>{grupo?.emoji}</span>
          <span className="truncate">{grupo?.short}</span>
          <span className="ml-auto">{marca}</span>
        </span>
      </div>
    )
  }

  return (
    <div
      ref={ref}
      title={`${idea.title}${estado}`}
      {...rest}
      style={{ ...rest.style, ...fondo }}
      className={cx(
        base,
        'flex items-center gap-1 rounded-md border-l-[3px] px-1.5 py-1 text-[11px] leading-tight font-semibold text-ink',
      )}
    >
      {marca}
      <span className={cx('truncate', hecha && 'line-through decoration-1')}>{idea.title}</span>
    </div>
  )
}
