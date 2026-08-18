import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { autoLogin, friendlyError, supabase } from '@/lib/supabase'

interface AuthValue {
  session: Session | null
  user: User | null
  loading: boolean
  /** Motivo por el que la entrada automática no ha podido completarse. */
  error: string | null
  /** Vuelve a intentarlo (lo usa la pantalla de conexión). */
  retry: () => void
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthValue>({
  session: null,
  user: null,
  loading: true,
  error: null,
  retry: () => {},
  signOut: async () => {},
})

export const useAuth = () => useContext(AuthContext)

/** Espera creciente entre reintentos: 2s, 4s, 8s… hasta 30s. */
const espera = (intento: number) => Math.min(2000 * 2 ** intento, 30000)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [intento, setIntento] = useState(0)

  // StrictMode monta dos veces en desarrollo: sin esto habría dos entradas.
  const enCurso = useRef(false)

  const retry = useCallback(() => {
    enCurso.current = false
    setIntento((n) => n + 1)
  }, [])

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      return
    }
    if (enCurso.current) return
    enCurso.current = true

    let alive = true
    let timer: ReturnType<typeof setTimeout>

    ;(async () => {
      setError(null)

      const { data } = await supabase.auth.getSession()
      if (!alive) return

      if (data.session) {
        setSession(data.session)
        setLoading(false)
        return
      }

      if (!autoLogin) {
        setLoading(false)
        return
      }

      // MyOS es de un solo usuario: entramos solos, sin preguntar nada.
      const { data: signed, error: err } = await supabase.auth.signInWithPassword(autoLogin)
      if (!alive) return

      if (!err) {
        setSession(signed.session)
        setLoading(false)
        return
      }

      setError(friendlyError(err))
      setLoading(false)

      // Los fallos de red suelen ser pasajeros (o la base de datos despertando):
      // reintentamos solos en vez de dejar al usuario mirando un error.
      if (/conexión|conexion|red/i.test(friendlyError(err))) {
        timer = setTimeout(() => alive && retry(), espera(intento))
      }
    })()

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      if (next) setSession(next)
    })

    return () => {
      alive = false
      clearTimeout(timer)
      sub.subscription.unsubscribe()
    }
  }, [intento, retry])

  const value = useMemo<AuthValue>(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      error,
      retry,
      signOut: async () => {
        await supabase?.auth.signOut()
        setSession(null)
      },
    }),
    [session, loading, error, retry],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
