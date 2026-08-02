import { useMemo, useRef, useState } from 'react'
import {
  ImagePlus,
  LayoutGrid,
  MapPin,
  Pencil,
  Plane,
  Plus,
  Trash2,
  Wallet,
  X,
} from 'lucide-react'
import {
  Badge,
  Button,
  Card,
  cx,
  Drawer,
  EmptyState,
  ErrorNote,
  Field,
  IconButton,
  Input,
  Modal,
  ProgressBar,
  SectionTitle,
  Segmented,
  Spinner,
  Textarea,
  useConfirm,
  useToast,
} from '@/components/ui'
import WorldMap, { type MapPin as Pin } from '@/components/WorldMap'
import Canvas from '@/components/Canvas'
import { useCollection } from '@/hooks/useCollection'
import { db, friendlyError } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import AnimatedNumber from '@/components/AnimatedNumber'
import { daysUntil, longDate, shortDate } from '@/lib/dates'
import { locate } from '@/lib/places'
import { TRIP_STATUS_EMOJI, TRIP_STATUS_LABEL, type Trip, type TripStatus } from '@/lib/types'
import { CHART_COLORS } from '@/lib/palette'

const STATUSES = Object.keys(TRIP_STATUS_LABEL) as TripStatus[]

const STATUS_COLOR: Record<TripStatus, string> = {
  idea: CHART_COLORS[1],
  planificado: CHART_COLORS[3],
  reservado: CHART_COLORS[0],
}

const emptyDraft = {
  destination: '',
  country: '',
  status: 'idea' as TripStatus,
  start_date: '',
  end_date: '',
  budget: '',
  spent: '',
  companions: '',
  notes: '',
  image_url: '',
  lat: null as number | null,
  lon: null as number | null,
}

const euro = (n: number) =>
  n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })

export default function Viajes() {
  const { user } = useAuth()
  const toast = useToast()
  const confirm = useConfirm()

  const [filter, setFilter] = useState<TripStatus | 'todos'>('todos')
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Trip | null>(null)
  const [draft, setDraft] = useState(emptyDraft)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [canvasTrip, setCanvasTrip] = useState<Trip | null>(null)
  const [highlight, setHighlight] = useState<string | null>(null)
  // Si has puesto el punto a mano, escribir el destino ya no te lo mueve.
  const [pinnedByHand, setPinnedByHand] = useState(false)

  /**
   * Sitúa el viaje solo a partir de lo que escribes. Antes había que acordarse
   * de pulsar el mapa, y los destinos se quedaban sin coordenadas.
   */
  function setPlace(next: typeof emptyDraft) {
    if (pinnedByHand) return setDraft(next)
    const found = locate(next.destination, next.country)
    setDraft(found ? { ...next, lat: found[0], lon: found[1] } : next)
  }

  const trips = useCollection<Trip>('trips', {
    shape: (q) => q.order('start_date', { ascending: true, nullsFirst: false }),
  })

  const counts = useMemo(() => {
    const map = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<TripStatus, number>
    for (const t of trips.rows) map[t.status]++
    return map
  }, [trips.rows])

  const nextTrip = useMemo(() => {
    const upcoming = trips.rows
      .filter((t) => t.start_date && daysUntil(t.start_date) >= 0)
      .sort((a, b) => a.start_date!.localeCompare(b.start_date!))
    return upcoming[0] ?? null
  }, [trips.rows])

  const visible = useMemo(
    () => (filter === 'todos' ? trips.rows : trips.rows.filter((t) => t.status === filter)),
    [trips.rows, filter],
  )

  const pins: Pin[] = useMemo(
    () =>
      trips.rows
        .filter((t) => t.lat !== null && t.lon !== null)
        .map((t) => ({
          id: t.id,
          lat: Number(t.lat),
          lon: Number(t.lon),
          label: `${TRIP_STATUS_EMOJI[t.status]} ${t.destination}`,
          color: STATUS_COLOR[t.status],
          active: t.id === (highlight ?? nextTrip?.id),
        })),
    [trips.rows, highlight, nextTrip],
  )

  function openNew() {
    setEditing(null)
    setDraft(emptyDraft)
    setPinnedByHand(false)
    setFormError(null)
    setOpen(true)
  }

  function openEdit(t: Trip) {
    setEditing(t)
    // Si ya tiene coordenadas las respetamos; si no, intentamos deducirlas ahora.
    const known = t.lat !== null && t.lon !== null
    const guess = known ? null : locate(t.destination, t.country)
    setPinnedByHand(known)
    setDraft({
      destination: t.destination,
      country: t.country ?? '',
      status: t.status,
      start_date: t.start_date ?? '',
      end_date: t.end_date ?? '',
      budget: t.budget?.toString() ?? '',
      spent: t.spent?.toString() ?? '',
      companions: t.companions ?? '',
      notes: t.notes ?? '',
      image_url: t.image_url ?? '',
      lat: known ? Number(t.lat) : (guess?.[0] ?? null),
      lon: known ? Number(t.lon) : (guess?.[1] ?? null),
    })
    setFormError(null)
    setOpen(true)
  }

  async function save() {
    if (!draft.destination.trim()) return setFormError('¿A dónde quieres ir?')
    if (draft.start_date && draft.end_date && draft.end_date < draft.start_date) {
      return setFormError('La vuelta no puede ser anterior a la ida.')
    }
    setSaving(true)
    setFormError(null)
    try {
      const values = {
        destination: draft.destination.trim(),
        country: draft.country.trim() || null,
        status: draft.status,
        start_date: draft.start_date || null,
        end_date: draft.end_date || null,
        budget: draft.budget ? Number(draft.budget) : null,
        spent: draft.spent ? Number(draft.spent) : null,
        companions: draft.companions.trim() || null,
        notes: draft.notes.trim() || null,
        image_url: draft.image_url || null,
        lat: draft.lat,
        lon: draft.lon,
      }
      if (editing) await trips.update(editing.id, values)
      else await trips.insert(values)
      setOpen(false)
      toast.success(editing ? 'Viaje actualizado' : 'Viaje añadido')
    } catch (e) {
      setFormError(friendlyError(e))
    } finally {
      setSaving(false)
    }
  }

  async function removeTrip(t: Trip) {
    const ok = await confirm({
      title: '¿Borrar viaje?',
      message: `Se eliminará “${t.destination}” con su lienzo y sus preparativos.`,
      confirmLabel: 'Borrar',
      danger: true,
    })
    if (!ok) return
    try {
      await trips.remove(t.id)
      toast.success('Viaje borrado')
    } catch (e) {
      toast.error(friendlyError(e))
    }
  }

  return (
    <div className="animate-rise">
      <SectionTitle
        hint="Ideas sueltas y planes cerrados. Marca en el mapa a dónde quieres ir."
        action={
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={openNew}>
            <span className="hidden sm:inline">Nuevo destino</span>
            <span className="sm:hidden">Nuevo</span>
          </Button>
        }
      >
        Viajes
      </SectionTitle>

      {/* --- Mapa ---------------------------------------------------------- */}
      <Card className="mb-5 overflow-hidden p-3">
        <WorldMap
          pins={pins}
          onPinClick={(id) => {
            setHighlight(id)
            document.getElementById(`trip-${id}`)?.scrollIntoView({ block: 'center' })
          }}
        />
        <div className="flex flex-wrap items-center justify-between gap-3 px-2 pt-3">
          <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
            {STATUSES.map((s) => (
              <li key={s} className="flex items-center gap-1.5 text-[12px] text-ink-2">
                <span
                  className="size-2.5 rounded-full"
                  style={{ backgroundColor: STATUS_COLOR[s] }}
                  aria-hidden
                />
                {TRIP_STATUS_LABEL[s]}
              </li>
            ))}
          </ul>
          <p className="text-[12px] text-ink-3">
            {pins.length} de {trips.rows.length} destinos situados en el mapa
          </p>
        </div>
      </Card>

      {/* --- Próximo viaje -------------------------------------------------- */}
      {nextTrip && (
        <Card className="card-hover relative mb-5 overflow-hidden">
          {/* La foto del destino como fondo de todo el hero, con velo de lectura. */}
          {nextTrip.image_url && (
            <>
              <img
                src={nextTrip.image_url}
                alt=""
                className="absolute inset-0 size-full object-cover"
              />
              <div
                aria-hidden
                className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/45 to-black/20"
              />
            </>
          )}
          <div
            className={cx(
              'relative flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6',
              nextTrip.image_url && 'text-white',
            )}
          >
            <div className="flex min-w-0 items-center gap-4">
              {!nextTrip.image_url && (
                <span className="grid size-16 shrink-0 animate-float place-items-center rounded-2xl bg-joy-soft text-3xl">
                  ✈️
                </span>
              )}
              <div className="min-w-0">
                <p
                  className={cx(
                    'text-[11px] font-bold tracking-[0.14em] uppercase',
                    nextTrip.image_url ? 'text-white/80' : 'text-joy',
                  )}
                >
                  Próximo viaje
                </p>
                <h3 className="truncate font-display text-3xl leading-tight font-bold sm:text-4xl">
                  {nextTrip.destination}
                </h3>
                <p
                  className={cx(
                    'mt-0.5 text-[13px]',
                    nextTrip.image_url ? 'text-white/75' : 'text-ink-3',
                  )}
                >
                  {shortDate(nextTrip.start_date)}
                  {nextTrip.end_date ? ` — ${shortDate(nextTrip.end_date)}` : ''}
                </p>
              </div>
            </div>
            <div
              className={cx(
                'shrink-0 rounded-2xl px-5 py-3 text-center',
                nextTrip.image_url ? 'glass' : 'bg-joy-soft',
              )}
            >
              <p
                className={cx(
                  'tnum font-display text-4xl leading-none font-bold',
                  nextTrip.image_url ? '' : 'text-joy',
                )}
              >
                <AnimatedNumber value={daysUntil(nextTrip.start_date!)} />
              </p>
              <p className={cx('text-[12px]', nextTrip.image_url ? 'opacity-80' : 'text-ink-2')}>
                {daysUntil(nextTrip.start_date!) === 1 ? 'día' : 'días'}
              </p>
            </div>
          </div>
        </Card>
      )}

      <Segmented
        className="mb-5 flex max-w-full"
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'todos', label: 'Todos', count: trips.rows.length },
          ...STATUSES.map((s) => ({
            value: s,
            label: `${TRIP_STATUS_EMOJI[s]} ${TRIP_STATUS_LABEL[s]}`,
            count: counts[s],
          })),
        ]}
      />

      {trips.error && <ErrorNote>{trips.error}</ErrorNote>}

      {trips.loading ? (
        <Spinner />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={<Plane className="size-8" />}
          title={filter === 'todos' ? 'Ningún destino todavía' : 'Nada en este estado'}
          description="Apunta sitios aunque sean solo una idea vaga. Cuando llegue el momento ya estará medio pensado."
          action={
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={openNew}>
              Añadir destino
            </Button>
          }
        />
      ) : (
        <ul className="stagger grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((t) => {
            const budget = Number(t.budget ?? 0)
            const spent = Number(t.spent ?? 0)
            const over = budget > 0 && spent > budget

            return (
              <Card
                as="li"
                key={t.id}
                id={`trip-${t.id}`}
                className={cx(
                  'card-hover flex flex-col overflow-hidden',
                  highlight === t.id && 'ring-2 ring-accent',
                )}
              >
                <div className="relative h-36 shrink-0 bg-surface-2">
                  {t.image_url ? (
                    <img src={t.image_url} alt="" className="size-full object-cover" />
                  ) : (
                    <div className="grid size-full place-items-center text-5xl opacity-40">
                      {TRIP_STATUS_EMOJI[t.status]}
                    </div>
                  )}
                  <div className="absolute top-3 left-3">
                    <Badge color={STATUS_COLOR[t.status]} className="bg-surface/90 backdrop-blur">
                      {TRIP_STATUS_LABEL[t.status]}
                    </Badge>
                  </div>
                  <div className="absolute top-2 right-2 flex gap-0.5">
                    <IconButton
                      label="Editar"
                      onClick={() => openEdit(t)}
                      className="bg-surface/85 backdrop-blur"
                    >
                      <Pencil className="size-4" />
                    </IconButton>
                    <IconButton
                      label="Borrar"
                      onClick={() => void removeTrip(t)}
                      className="bg-surface/85 backdrop-blur"
                    >
                      <Trash2 className="size-4" />
                    </IconButton>
                  </div>
                </div>

                <div className="flex flex-1 flex-col p-4">
                  <h3 className="font-display text-xl leading-snug font-bold">{t.destination}</h3>
                  {t.country && (
                    <p className="mt-0.5 inline-flex items-center gap-1 text-[13px] text-ink-3">
                      <MapPin className="size-3.5" />
                      {t.country}
                    </p>
                  )}
                  {t.start_date && (
                    <p className="mt-2 text-[13px] text-ink-2">
                      {longDate(t.start_date)}
                      {t.end_date ? ` — ${shortDate(t.end_date)}` : ''}
                    </p>
                  )}
                  {t.notes && (
                    <p className="mt-2 line-clamp-2 text-[13px] leading-relaxed text-ink-3">
                      {t.notes}
                    </p>
                  )}

                  <div className="mt-auto pt-4">
                    {budget > 0 && (
                      <>
                        <div className="mb-1.5 flex items-center justify-between text-[12px]">
                          <span className="inline-flex items-center gap-1 text-ink-3">
                            <Wallet className="size-3.5" />
                            Presupuesto
                          </span>
                          <span className={cx('tnum font-bold', over && 'text-bad')}>
                            {euro(spent)} / {euro(budget)}
                          </span>
                        </div>
                        <ProgressBar
                          value={(spent / budget) * 100}
                          color={over ? 'var(--bad)' : STATUS_COLOR[t.status]}
                          height={6}
                        />
                      </>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-3 w-full"
                      icon={<LayoutGrid className="size-4" />}
                      onClick={() => setCanvasTrip(t)}
                    >
                      Vuelos, reservas y notas
                    </Button>
                  </div>
                </div>
              </Card>
            )
          })}
        </ul>
      )}

      {/* --- Lienzo del viaje ---------------------------------------------- */}
      <Drawer
        open={Boolean(canvasTrip)}
        onClose={() => setCanvasTrip(null)}
        width="lg"
        title={canvasTrip?.destination ?? ''}
        subtitle="Vuelos, alojamiento, reservas y lo que quieras ver allí"
      >
        {canvasTrip && (
          <Canvas
            parentType="trip"
            parentId={canvasTrip.id}
            emptyHint="Números de vuelo, confirmaciones de hotel, sitios que quieres ver, presupuesto por días… todo junto y a mano."
          />
        )}
      </Drawer>

      {/* --- Alta / edición ------------------------------------------------- */}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        size="lg"
        title={editing ? 'Editar viaje' : 'Nuevo destino'}
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
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Destino">
              <Input
                autoFocus
                value={draft.destination}
                onChange={(e) => setPlace({ ...draft, destination: e.target.value })}
                placeholder="Kioto"
              />
            </Field>
            <Field label="País">
              <Input
                value={draft.country}
                onChange={(e) => setPlace({ ...draft, country: e.target.value })}
                placeholder="Japón"
              />
            </Field>
          </div>

          <Field label="Estado">
            <div className="flex gap-2">
              {STATUSES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setDraft({ ...draft, status: s })}
                  className={cx(
                    'flex-1 rounded-2xl border px-3 py-2.5 text-[13px] font-semibold transition-colors',
                    draft.status === s
                      ? 'border-accent bg-accent-soft text-accent'
                      : 'border-line bg-surface-2 text-ink-3 hover:text-ink',
                  )}
                >
                  <span className="mr-1" aria-hidden>
                    {TRIP_STATUS_EMOJI[s]}
                  </span>
                  {TRIP_STATUS_LABEL[s]}
                </button>
              ))}
            </div>
          </Field>

          <ImagePicker
            value={draft.image_url}
            userId={user?.id}
            onChange={(url) => setDraft({ ...draft, image_url: url })}
          />

          {/* Situar en el mapa: un clic y ya. Sin buscar coordenadas a mano. */}
          <Field
            label="En el mapa"
            hint={
              draft.lat === null
                ? 'No reconozco ese sitio. Pulsa en el mapa, más o menos donde esté.'
                : pinnedByHand
                  ? 'Lo has colocado tú. Pulsa otra vez para corregir.'
                  : 'Situado a partir del destino. Si no cuadra, pulsa donde toque.'
            }
          >
            <div className="overflow-hidden rounded-2xl border border-line">
              <WorldMap
                pins={
                  draft.lat !== null
                    ? [
                        {
                          id: 'draft',
                          lat: draft.lat,
                          lon: draft.lon!,
                          label: draft.destination || 'Aquí',
                          color: STATUS_COLOR[draft.status],
                          active: true,
                        },
                      ]
                    : []
                }
                onPick={(lat, lon) => {
                  setPinnedByHand(true)
                  setDraft({
                    ...draft,
                    lat: Math.round(lat * 10) / 10,
                    lon: Math.round(lon * 10) / 10,
                  })
                }}
              />
            </div>
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Ida">
              <Input
                type="date"
                value={draft.start_date}
                onChange={(e) => setDraft({ ...draft, start_date: e.target.value })}
              />
            </Field>
            <Field label="Vuelta">
              <Input
                type="date"
                value={draft.end_date}
                onChange={(e) => setDraft({ ...draft, end_date: e.target.value })}
              />
            </Field>
            <Field label="Presupuesto (€)">
              <Input
                type="number"
                min={0}
                value={draft.budget}
                onChange={(e) => setDraft({ ...draft, budget: e.target.value })}
                placeholder="1800"
              />
            </Field>
            <Field label="Gastado (€)">
              <Input
                type="number"
                min={0}
                value={draft.spent}
                onChange={(e) => setDraft({ ...draft, spent: e.target.value })}
                placeholder="0"
              />
            </Field>
          </div>

          <Field label="Con quién">
            <Input
              value={draft.companions}
              onChange={(e) => setDraft({ ...draft, companions: e.target.value })}
              placeholder="Solo / pareja / amigos"
            />
          </Field>

          <Field label="Notas">
            <Textarea
              value={draft.notes}
              onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
              placeholder="Qué te apetece ver, mejor época…"
            />
          </Field>

          {formError && <ErrorNote>{formError}</ErrorNote>}
        </div>
      </Modal>
    </div>
  )
}

/* -------------------------------------------------------------------------- */

/** Sube la foto a tu Supabase, o acepta una URL pegada. */
function ImagePicker({
  value,
  userId,
  onChange,
}: {
  value: string
  userId?: string
  onChange: (url: string) => void
}) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  async function upload(file: File) {
    if (!userId) return
    if (file.size > 5 * 1024 * 1024) {
      toast.error('La imagen no puede pasar de 5 MB.')
      return
    }
    setBusy(true)
    try {
      const ext = file.name.split('.').pop() || 'jpg'
      const path = `${userId}/${Date.now()}.${ext}`
      const { error } = await db().storage.from('trip-images').upload(path, file, { upsert: true })
      if (error) throw error
      const { data } = db().storage.from('trip-images').getPublicUrl(path)
      onChange(data.publicUrl)
    } catch (e) {
      toast.error(friendlyError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Field label="Foto" hint="Sube una imagen o pega la dirección de una.">
      <div className="flex items-center gap-3">
        <div className="relative size-20 shrink-0 overflow-hidden rounded-2xl border border-line bg-surface-2">
          {value ? (
            <>
              <img src={value} alt="" className="size-full object-cover" />
              <button
                type="button"
                onClick={() => onChange('')}
                aria-label="Quitar la foto"
                className="absolute top-1 right-1 grid size-6 place-items-center rounded-full bg-black/60 text-white"
              >
                <X className="size-3.5" />
              </button>
            </>
          ) : (
            <div className="grid size-full place-items-center text-ink-3">
              <ImagePlus className="size-6" />
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          <input
            ref={input}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void upload(f)
              e.target.value = ''
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            loading={busy}
            onClick={() => input.current?.click()}
          >
            Subir imagen
          </Button>
          <Input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="…o pega una URL"
            className="h-9 py-0 text-[13px]"
          />
        </div>
      </div>
    </Field>
  )
}
