import { useEffect, useRef, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { Checkbox, cx } from '@/components/ui'
import type { Subtask } from '@/lib/types'

const nuevoId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2)

/**
 * Los subpuntos de una tarea. Cada cambio (marcar, añadir, borrar, terminar de
 * escribir) se guarda al momento con `onChange`, sin esperar al botón Guardar.
 */
export default function Subtareas({
  value,
  onChange,
}: {
  value: Subtask[]
  onChange: (next: Subtask[]) => void
}) {
  // Copia local para poder escribir sin guardar a cada tecla.
  const [items, setItems] = useState<Subtask[]>(value)
  const [nueva, setNueva] = useState('')
  const nuevaRef = useRef<HTMLInputElement>(null)

  useEffect(() => setItems(value), [value])

  const guardar = (next: Subtask[]) => {
    setItems(next)
    onChange(next)
  }

  const hechas = items.filter((s) => s.done).length

  function anadir() {
    const text = nueva.trim()
    if (!text) return
    guardar([...items, { id: nuevoId(), text, done: false }])
    setNueva('')
    nuevaRef.current?.focus()
  }

  return (
    <div>
      {items.length > 0 && (
        <div className="mb-2 flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full transition-[width] duration-300"
              style={{ width: `${(hechas / items.length) * 100}%`, background: 'var(--grad)' }}
            />
          </div>
          <span className="tnum text-[12px] text-ink-3">
            {hechas}/{items.length}
          </span>
        </div>
      )}

      <ul className="space-y-1">
        {items.map((s, i) => (
          <li key={s.id} className="group flex items-center gap-2 rounded-xl px-1 py-0.5 hover:bg-surface-2">
            <Checkbox
              checked={s.done}
              onChange={(done) => guardar(items.map((x) => (x.id === s.id ? { ...x, done } : x)))}
            />
            <input
              value={s.text}
              aria-label={`Subtarea ${i + 1}`}
              onChange={(e) =>
                setItems(items.map((x) => (x.id === s.id ? { ...x, text: e.target.value } : x)))
              }
              onBlur={() => {
                const actual = items.find((x) => x.id === s.id)
                const antes = value.find((x) => x.id === s.id)
                if (!actual || actual.text === antes?.text) return
                // Vaciarla de texto es borrarla.
                guardar(actual.text.trim() ? items : items.filter((x) => x.id !== s.id))
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  ;(e.target as HTMLInputElement).blur()
                  nuevaRef.current?.focus()
                }
              }}
              className={cx(
                'min-w-0 flex-1 bg-transparent py-1 text-sm outline-none',
                s.done && 'text-ink-3 line-through',
              )}
            />
            <button
              type="button"
              aria-label={`Quitar ${s.text}`}
              onClick={() => guardar(items.filter((x) => x.id !== s.id))}
              className="rounded-lg p-1 text-ink-3 opacity-0 transition-opacity group-hover:opacity-100 hover:text-bad focus:opacity-100"
            >
              <X className="size-4" />
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-1 flex items-center gap-2 px-1">
        <Plus className="size-5 shrink-0 text-ink-3" />
        <input
          ref={nuevaRef}
          value={nueva}
          onChange={(e) => setNueva(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              anadir()
            }
          }}
          onBlur={anadir}
          placeholder="Añadir subtarea"
          className="min-w-0 flex-1 bg-transparent py-1.5 text-sm outline-none placeholder:text-ink-3"
        />
      </div>
    </div>
  )
}
