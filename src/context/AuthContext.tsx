import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { autoLogin, supabase } from '@/lib/supabase'

interface AuthValue {
  session: Session | null
  user: User | null
  loading: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthValue>({
  session: null,
  user: null,
  loading: true,
  signOut: async () => {},
})

export const useAuth = () => useContext(AuthContext)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  // StrictMode monta dos veces en desarrollo: sin esto habría dos intentos de login.
  const attempted = useRef(false)

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      return
    }

    let alive = true

    ;(async () => {
      const { data } = await supabase.auth.getSession()
      if (!alive) return

      if (data.session) {
        setSession(data.session)
        setLoading(false)
        return
      }

      // Sin sesión guardada: si hay credenciales en el .env, entramos solos.
      // Si falla, no insistimos: la pantalla de login se encarga y enseña el motivo.
      if (autoLogin && !attempted.current) {
        attempted.current = true
        const { data: signed, error } = await supabase.auth.signInWithPassword(autoLogin)
        if (!alive) return
        if (!error) setSession(signed.session)
      }

      setLoading(false)
    })()

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
    })

    return () => {
      alive = false
      sub.subscription.unsubscribe()
    }
  }, [])

  const value = useMemo<AuthValue>(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      signOut: async () => {
        await supabase?.auth.signOut()
        setSession(null)
      },
    }),
    [session, loading],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
