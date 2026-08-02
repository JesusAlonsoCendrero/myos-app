import { useCallback, useEffect, useRef, useState } from 'react'
import { db, friendlyError } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'

/**
 * Lectura de una tabla con estado local editable.
 *
 * `shape` recibe la consulta base ya filtrada por usuario cuando procede y
 * permite encadenar filtros y orden. Devuelve además helpers que actualizan la
 * lista en memoria al insertar/editar/borrar, para que la UI responda al
 * instante sin esperar a un refetch completo.
 */
export function useCollection<T extends { id: string }>(
  table: string,
  options: {
    select?: string
    /** Encadena filtros/orden sobre la consulta. */
    shape?: (query: any) => any
    /** Vuelve a consultar cuando cambie alguno de estos valores. */
    deps?: unknown[]
    /** Añade `.eq('user_id', uid)` automáticamente. Desactívalo en tablas hijas. */
    scopeToUser?: boolean
    /** No consultar todavía (por ejemplo, falta un id padre). */
    skip?: boolean
  } = {},
) {
  const { select = '*', shape, deps = [], scopeToUser = true, skip = false } = options
  const { user } = useAuth()
  const [rows, setRows] = useState<T[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Evita que una respuesta lenta pise a otra más reciente.
  const requestId = useRef(0)

  const load = useCallback(async () => {
    if (skip || !user) {
      setRows([])
      setLoading(false)
      return
    }
    const id = ++requestId.current
    setLoading(true)
    setError(null)
    try {
      let query: any = db().from(table).select(select)
      if (scopeToUser) query = query.eq('user_id', user.id)
      if (shape) query = shape(query)
      const { data, error: err } = await query
      if (id !== requestId.current) return
      if (err) throw err
      setRows((data ?? []) as T[])
    } catch (e) {
      if (id !== requestId.current) return
      setError(friendlyError(e))
      setRows([])
    } finally {
      if (id === requestId.current) setLoading(false)
    }
    // shape se recrea en cada render; las deps explícitas mandan.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, select, user?.id, skip, ...deps])

  useEffect(() => {
    void load()
  }, [load])

  return {
    rows,
    setRows,
    loading,
    error,
    reload: load,

    /** Inserta y devuelve la fila creada (ya añadida al estado local). */
    async insert(values: Record<string, unknown>): Promise<T> {
      const payload = scopeToUser ? { ...values, user_id: user!.id } : values
      const { data, error: err } = await db()
        .from(table)
        .insert(payload)
        .select(select)
        .single()
      if (err) throw err
      const row = data as unknown as T
      setRows((prev) => [...prev, row])
      return row
    },

    /** Actualiza en el servidor y en memoria. */
    async update(id: string, patch: Record<string, unknown>): Promise<void> {
      const { data, error: err } = await db()
        .from(table)
        .update(patch)
        .eq('id', id)
        .select(select)
        .single()
      if (err) throw err
      setRows((prev) => prev.map((r) => (r.id === id ? (data as unknown as T) : r)))
    },

    /** Borra en el servidor y en memoria. */
    async remove(id: string): Promise<void> {
      const { error: err } = await db().from(table).delete().eq('id', id)
      if (err) throw err
      setRows((prev) => prev.filter((r) => r.id !== id))
    },
  }
}
