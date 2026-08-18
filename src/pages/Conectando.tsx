import { motion } from 'motion/react'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui'
import { useAuth } from '@/context/AuthContext'

/**
 * Sustituye a la pantalla de login. MyOS es de un solo usuario y entra sola, así
 * que aquí no se pide nada: o está conectando, o algo va mal y se explica qué.
 *
 * El caso más común con un proyecto gratuito de Supabase es que la base de datos
 * esté dormida (se pausa tras unos días sin uso) y tarde un par de minutos en
 * despertar. Por eso la app reintenta sola en lugar de rendirse.
 */
export default function Conectando() {
  const { error, retry } = useAuth()

  const dormida = Boolean(error && /conexión|conexion|red/i.test(error))

  return (
    <div className="relative isolate grid min-h-dvh place-items-center overflow-hidden px-6">
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

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-md text-center"
      >
        <span
          className="mx-auto grid size-16 place-items-center rounded-3xl font-display text-2xl font-bold tracking-tight text-accent-ink shadow-glow [background:var(--grad)]"
          aria-hidden
        >
          JA
        </span>
        <h1 className="mt-6 font-display text-4xl leading-tight font-bold">MyOS</h1>

        {!error ? (
          <>
            <p className="mt-3 text-[15px] text-ink-2">Abriendo tu semana…</p>
            <span className="mt-6 flex justify-center gap-1.5" aria-hidden>
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="size-2.5 animate-beat rounded-full bg-accent"
                  style={{ animationDelay: `${i * 0.18}s` }}
                />
              ))}
            </span>
          </>
        ) : (
          <>
            <p className="mt-3 text-[15px] leading-relaxed text-ink-2">
              {dormida
                ? 'Tu base de datos estaba dormida y está despertando. Suele tardar un par de minutos.'
                : error}
            </p>

            {dormida && (
              <p className="mt-3 text-[13px] leading-relaxed text-ink-3">
                Supabase pausa los proyectos gratuitos tras unos días sin usarlos. Tus datos están
                intactos. Seguimos reintentando solos.
              </p>
            )}

            <Button
              variant="primary"
              className="mt-7"
              icon={<RefreshCw className="size-4" />}
              onClick={retry}
            >
              Reintentar ahora
            </Button>
          </>
        )}
      </motion.div>
    </div>
  )
}
