import { useEffect, useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { Button, cx, Input, Modal, Spinner } from './ui'
import { db, friendlyError } from '@/lib/supabase'
import type { Exercise } from '@/lib/types'

const BUCKET = 'exercise-gifs'

/** URL pública del GIF copiado a tu Supabase, o null si aún no está sincronizado. */
export function gifSrc(ex: Pick<Exercise, 'gif_path'>): string | null {
  if (!ex.gif_path) return null
  try {
    return db().storage.from(BUCKET).getPublicUrl(ex.gif_path).data.publicUrl
  } catch {
    return null
  }
}

/** La animación del ejercicio, con un hueco digno si todavía no se ha bajado. */
export function ExerciseGif({
  exercise,
  className,
}: {
  exercise: Pick<Exercise, 'gif_path' | 'name' | 'body_part'>
  className?: string
}) {
  const src = gifSrc(exercise)
  return (
    <div
      className={cx(
        'grid shrink-0 place-items-center overflow-hidden rounded-2xl bg-white',
        className,
      )}
    >
      {src ? (
        <img src={src} alt={`Animación de ${exercise.name}`} className="size-full object-contain" />
      ) : (
        <span className="px-2 text-center text-[10px] leading-tight font-semibold text-ink-3">
          {exercise.body_part ?? 'Sin animación'}
        </span>
      )}
    </div>
  )
}

/**
 * Buscador del catálogo de ejercicios. Consulta a Supabase, no a WorkoutX, así
 * que no gasta cuota de API por mucho que busques.
 */
export default function ExercisePicker({
  open,
  onClose,
  onPick,
}: {
  open: boolean
  onClose: () => void
  onPick: (exercise: Exercise) => void
}) {
  const [query, setQuery] = useState('')
  const [bodyPart, setBodyPart] = useState<string>('')
  const [rows, setRows] = useState<Exercise[]>([])
  const [parts, setParts] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [empty, setEmpty] = useState(false)

  // Zonas del cuerpo disponibles, una sola vez al abrir.
  useEffect(() => {
    if (!open || parts.length) return
    void (async () => {
      const { data } = await db().from('exercises').select('body_part').limit(2000)
      const unique = [...new Set((data ?? []).map((r) => r.body_part).filter(Boolean))] as string[]
      setParts(unique.sort())
      setEmpty(unique.length === 0)
    })()
  }, [open, parts.length])

  // Búsqueda con freno: no lanzamos una consulta por cada tecla.
  useEffect(() => {
    if (!open) return
    setLoading(true)
    const timer = setTimeout(async () => {
      try {
        let q = db().from('exercises').select('*')
        if (query.trim()) q = q.ilike('name', `%${query.trim()}%`)
        if (bodyPart) q = q.eq('body_part', bodyPart)
        const { data, error: err } = await q
          .order('popularity_rank', { ascending: true, nullsFirst: false })
          .limit(60)
        if (err) throw err
        setRows((data ?? []) as Exercise[])
        setError(null)
      } catch (e) {
        setError(friendlyError(e))
      } finally {
        setLoading(false)
      }
    }, 250)
    return () => clearTimeout(timer)
  }, [open, query, bodyPart])

  const title = useMemo(
    () => (rows.length ? `${rows.length} ejercicios` : 'Buscar ejercicio'),
    [rows.length],
  )

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Añadir ejercicio"
      description={title}
      footer={
        <Button variant="ghost" onClick={onClose}>
          Cerrar
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="relative">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3" />
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="press banca, sentadilla, curl…"
            className="pl-9"
          />
        </div>

        {parts.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            <Chip active={!bodyPart} onClick={() => setBodyPart('')}>
              Todo
            </Chip>
            {parts.map((p) => (
              <Chip key={p} active={bodyPart === p} onClick={() => setBodyPart(bodyPart === p ? '' : p)}>
                {p}
              </Chip>
            ))}
          </div>
        )}

        {empty && (
          <div className="rounded-2xl border border-warn/40 bg-warn/8 p-4 text-[13px] leading-relaxed text-ink-2">
            <p className="font-bold text-warn">El catálogo está vacío</p>
            <p className="mt-1">
              Ejecuta <code className="rounded bg-surface-2 px-1">npm run import-exercises</code>{' '}
              una vez para traer los 1.327 ejercicios con sus animaciones. Mientras tanto puedes
              escribir el nombre a mano.
            </p>
          </div>
        )}

        {error && <p className="text-sm text-bad">{error}</p>}

        {loading ? (
          <Spinner label="Buscando…" />
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {rows.map((ex) => (
              <li key={ex.id}>
                <button
                  onClick={() => {
                    onPick(ex)
                    onClose()
                  }}
                  className="flex w-full items-center gap-3 rounded-2xl border border-line bg-surface-2 p-2.5 text-left transition-colors hover:border-accent hover:bg-accent-soft"
                >
                  <ExerciseGif exercise={ex} className="size-14" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-bold">{ex.name}</span>
                    <span className="block truncate text-[11px] text-ink-3">
                      {[ex.target, ex.equipment].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  )
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={cx(
        'rounded-full border px-3 py-1 text-[12px] font-medium transition-colors',
        active
          ? 'border-transparent bg-accent text-accent-ink'
          : 'border-line bg-surface text-ink-2 hover:border-line-strong',
      )}
    >
      {children}
    </button>
  )
}
