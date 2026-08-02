import { useState, type FormEvent } from 'react'
import { motion } from 'motion/react'
import { ArrowRight, Check, Dumbbell, Plane, Target } from 'lucide-react'
import { Button, ErrorNote, Field, Input } from '@/components/ui'
import { autoLogin, db, friendlyError } from '@/lib/supabase'

type Mode = 'signin' | 'signup'

/**
 * Tarjetitas flotantes del panel izquierdo: un vistazo del producto antes de
 * entrar, como los escaparates de Linear o Superlist. Son decorativas, pero
 * cuentan qué hace la app mejor que cualquier lista de puntos.
 */
const SHOWCASE = [
  {
    icon: Target,
    title: 'Semana 31',
    body: '3 de 4 objetivos cumplidos',
    progress: 75,
    float: '0s',
  },
  {
    icon: Dumbbell,
    title: 'Racha de gimnasio',
    body: '12 días seguidos 🔥',
    progress: null,
    float: '1.2s',
  },
  {
    icon: Plane,
    title: 'Kioto',
    body: 'Faltan 45 días',
    progress: null,
    float: '2.4s',
  },
]

function Logo({ size = 'md' }: { size?: 'md' | 'lg' }) {
  return (
    <div className="flex items-center gap-3">
      <span
        className={
          (size === 'lg' ? 'size-12 rounded-3xl text-xl ' : 'size-10 rounded-2xl text-base ') +
          'grid shrink-0 place-items-center font-display font-bold tracking-tight text-accent-ink shadow-glow [background:var(--grad)]'
        }
        aria-hidden
      >
        JA
      </span>
      <span
        className={
          (size === 'lg' ? 'text-4xl ' : 'text-3xl ') +
          'font-display leading-none font-bold tracking-tight'
        }
      >
        MyOS
      </span>
    </div>
  )
}

export default function Login() {
  const [mode, setMode] = useState<Mode>('signin')
  // Si hay entrada automática configurada, al menos ahorramos escribir el email.
  const [email, setEmail] = useState(autoLogin?.email ?? '')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setNotice(null)
    try {
      if (mode === 'signin') {
        const { error: err } = await db().auth.signInWithPassword({ email, password })
        if (err) throw err
      } else {
        const { data, error: err } = await db().auth.signUp({ email, password })
        if (err) throw err
        if (!data.session) {
          setNotice('Cuenta creada. Confirma el email que te hemos enviado y vuelve a entrar.')
          setMode('signin')
        }
      }
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative isolate grid min-h-dvh place-items-center overflow-hidden px-4 py-10">
      {/* ---- Aurora de fondo: dos manchas de color que respiran ---- */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 -left-32 -z-10 size-[36rem] animate-breathe rounded-full opacity-30 blur-3xl"
        style={{ background: 'radial-gradient(circle, var(--accent), transparent 65%)' }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-40 -bottom-48 -z-10 size-[38rem] animate-breathe rounded-full opacity-25 blur-3xl"
        style={{
          background: 'radial-gradient(circle, var(--accent-2), transparent 65%)',
          animationDelay: '3s',
        }}
      />

      <div className="grid w-full max-w-5xl items-center gap-10 lg:grid-cols-[1.1fr_1fr]">
        {/* ---------------- Escaparate (solo escritorio) ---------------- */}
        <section className="hidden lg:block">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          >
            <Logo size="lg" />
            <h1 className="mt-8 font-display text-5xl leading-[1.06] font-bold text-balance">
              Tu vida entera,
              <br />
              <span className="text-grad">en una sola pantalla.</span>
            </h1>
            <p className="mt-4 max-w-md text-[15px] leading-relaxed text-ink-2">
              Objetivos que se renuevan cada lunes, tu día tarea a tarea, el gimnasio con rutinas
              guiadas, y tus proyectos y viajes en el mismo sitio.
            </p>
          </motion.div>

          {/* Tarjetas flotando a distintos ritmos. */}
          <div className="mt-10 flex flex-wrap gap-4">
            {SHOWCASE.map(({ icon: Icon, title, body, progress, float }, i) => (
              <motion.div
                key={title}
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25 + i * 0.12, duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
              >
                <div
                  className="animate-float w-52 rounded-3xl bg-surface p-4 shadow-lift"
                  style={{ animationDelay: float }}
                >
                  <div className="flex items-center gap-2.5">
                    <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
                      <Icon className="size-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-display text-[14px] leading-tight font-bold">
                        {title}
                      </p>
                      <p className="truncate text-[12px] text-ink-3">{body}</p>
                    </div>
                  </div>
                  {progress !== null && (
                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-3">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${progress}%` }}
                        transition={{ delay: 0.9, duration: 1, ease: [0.22, 1, 0.36, 1] }}
                        className="h-full rounded-full [background:var(--grad)]"
                      />
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        </section>

        {/* ---------------- Formulario ---------------- */}
        <motion.section
          initial={{ opacity: 0, y: 24, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ delay: 0.1, duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          className="glass mx-auto w-full max-w-md rounded-[2rem] p-7 shadow-lift sm:p-9"
        >
          <div className="mb-8 lg:hidden">
            <Logo />
          </div>

          <h2 className="text-3xl leading-tight">
            {mode === 'signin' ? 'Bienvenido de vuelta' : 'Crea tu cuenta'}
          </h2>
          <p className="mt-1.5 text-sm text-ink-3">
            {mode === 'signin'
              ? 'Tu semana te espera, sincronizada en todos tus dispositivos.'
              : 'Con una cuenta tus datos viajan contigo a cualquier dispositivo.'}
          </p>

          <form onSubmit={onSubmit} className="mt-7 space-y-4">
            <Field label="Email">
              <Input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@email.com"
              />
            </Field>

            <Field label="Contraseña" hint={mode === 'signup' ? 'Mínimo 6 caracteres.' : undefined}>
              <Input
                type="password"
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </Field>

            {error && <ErrorNote>{error}</ErrorNote>}

            {/* El error más habitual al empezar: la cuenta existe pero está sin
                confirmar. Hay dos salidas y ninguna es obvia. */}
            {error && /confirma tu email/i.test(error) && (
              <div className="rounded-2xl border border-warn/40 bg-warn/8 px-4 py-3 text-[13px] leading-relaxed text-ink-2">
                <p className="font-bold text-warn">Dos formas de resolverlo</p>
                <ul className="mt-1.5 space-y-1">
                  <li>
                    <b>A.</b> Abre el correo de confirmación que te ha enviado Supabase y pulsa el
                    enlace.
                  </li>
                  <li>
                    <b>B.</b> En el panel de Supabase: <b>Authentication → Users</b>, menú <b>⋯</b>{' '}
                    de tu usuario → <b>Confirm email</b>.
                  </li>
                </ul>
              </div>
            )}
            {notice && (
              <p className="flex items-start gap-2 rounded-2xl bg-accent-soft px-4 py-3 text-sm text-accent">
                <Check className="mt-0.5 size-4 shrink-0" />
                {notice}
              </p>
            )}

            <Button type="submit" variant="primary" size="lg" loading={loading} className="w-full">
              {mode === 'signin' ? 'Entrar' : 'Crear cuenta'}
              <ArrowRight className="size-4" />
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-ink-3">
            {mode === 'signin' ? '¿Todavía no tienes cuenta?' : '¿Ya tienes cuenta?'}{' '}
            <button
              type="button"
              onClick={() => {
                setMode(mode === 'signin' ? 'signup' : 'signin')
                setError(null)
                setNotice(null)
              }}
              className="font-bold text-accent underline-offset-4 hover:underline"
            >
              {mode === 'signin' ? 'Regístrate' : 'Inicia sesión'}
            </button>
          </p>
        </motion.section>
      </div>
    </div>
  )
}
