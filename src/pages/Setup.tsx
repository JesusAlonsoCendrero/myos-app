import type { ReactNode } from 'react'
import { Compass, Database, KeyRound, Terminal } from 'lucide-react'
import { Card } from '@/components/ui'

const STEPS = [
  {
    icon: Database,
    title: 'Crea el proyecto en Supabase',
    body: (
      <>
        Entra en <Code>supabase.com</Code>, crea una cuenta gratuita y pulsa{' '}
        <Code>New project</Code>. Elige la región de Europa (Frankfurt o Londres) para que vaya
        rápido desde España.
      </>
    ),
  },
  {
    icon: Terminal,
    title: 'Ejecuta el esquema',
    body: (
      <>
        En el menú lateral abre <Code>SQL Editor</Code>, pega el contenido completo del archivo{' '}
        <Code>supabase/schema.sql</Code> de este proyecto y pulsa <Code>Run</Code>. Eso crea las
        tablas y activa la seguridad por usuario.
      </>
    ),
  },
  {
    icon: KeyRound,
    title: 'Copia los dos valores',
    body: (
      <>
        En <Code>Settings → Data API</Code> copia la <Code>Project URL</Code>. En{' '}
        <Code>Settings → API Keys</Code> copia la <Code>Publishable key</Code> (empieza por{' '}
        <Code>sb_publishable_</Code>). Duplica <Code>.env.example</Code> como <Code>.env</Code>,
        pega ahí los dos valores y reinicia <Code>npm run dev</Code>.
      </>
    ),
  },
]

function Code({ children }: { children: ReactNode }) {
  return (
    <code className="rounded-md border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[0.85em] text-ink">
      {children}
    </code>
  )
}

export default function Setup() {
  return (
    <div className="relative z-10 mx-auto flex min-h-dvh max-w-2xl flex-col justify-center px-5 py-14">
      <div className="mb-10 flex items-center gap-3">
        <Compass className="size-6 text-accent" />
        <span className="font-display text-3xl leading-none font-bold">MyOS</span>
      </div>

      <h1 className="text-4xl leading-[1.1] text-balance">
        Falta un paso: <em className="text-accent not-italic">conectar tu base de datos.</em>
      </h1>
      <p className="mt-3 text-[15px] leading-relaxed text-ink-2">
        La app guarda todo en tu propio proyecto de Supabase, así que los datos son tuyos y se
        sincronizan entre el móvil y el ordenador. Son tres minutos.
      </p>

      <ol className="mt-9 space-y-3">
        {STEPS.map(({ icon: Icon, title, body }, i) => (
          <Card
            as="li"
            key={title}
            className="flex animate-rise gap-4 p-5"
            style={{ animationDelay: `${i * 100}ms` }}
          >
            <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
              <Icon className="size-5" />
            </div>
            <div className="min-w-0">
              <p className="flex items-baseline gap-2 font-semibold text-ink">
                <span className="tnum text-[13px] text-accent">{i + 1}</span>
                {title}
              </p>
              <p className="mt-1 text-sm leading-relaxed text-ink-2">{body}</p>
            </div>
          </Card>
        ))}
      </ol>

      <p className="mt-8 text-[13px] leading-relaxed text-ink-3">
        La <Code>publishable key</Code> es pública por diseño: quien protege tus datos es Row Level
        Security, que ya viene activada en el esquema. Nunca pongas aquí la{' '}
        <Code>secret key</Code>.
      </p>
    </div>
  )
}
