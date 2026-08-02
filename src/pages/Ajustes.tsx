import { useState } from 'react'
import { Download, LogOut, Moon, Smartphone, Sun, Tags, User } from 'lucide-react'
import { Button, Card, ErrorNote, SectionTitle, useToast } from '@/components/ui'
import { useAuth } from '@/context/AuthContext'
import { useTheme } from '@/context/ThemeContext'
import { autoLogin, db, friendlyError } from '@/lib/supabase'
import { today } from '@/lib/dates'

const TABLES = [
  'tasks',
  'weekly_goals',
  'canvas_blocks',
  'routines',
  'workouts',
  'projects',
  'trips',
] as const

export default function Ajustes() {
  const { user, signOut } = useAuth()
  const { theme, toggle } = useTheme()
  const toast = useToast()
  const [exporting, setExporting] = useState(false)
  const [seeding, setSeeding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /** Descarga un JSON con todo lo tuyo. Tus datos, tuyos. */
  async function exportData() {
    setExporting(true)
    setError(null)
    try {
      const client = db()
      const dump: Record<string, unknown> = {
        exportado: new Date().toISOString(),
        cuenta: user?.email,
      }

      for (const table of TABLES) {
        const { data, error: err } = await client.from(table).select('*').eq('user_id', user!.id)
        if (err) throw err
        dump[table] = data
      }

      // Las tablas hijas no tienen user_id: se recuperan por su padre vía RLS.
      for (const [child, parent, fk] of [
        ['routine_exercises', 'routines', 'routine_id'],
        ['workout_sets', 'workouts', 'workout_id'],
        ['trip_items', 'trips', 'trip_id'],
      ] as const) {
        const parentIds = (dump[parent] as Array<{ id: string }>).map((r) => r.id)
        if (!parentIds.length) {
          dump[child] = []
          continue
        }
        const { data, error: err } = await client.from(child).select('*').in(fk, parentIds)
        if (err) throw err
        dump[child] = data
      }

      const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `brujula-${today()}.json`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Copia descargada')
    } catch (e) {
      setError(friendlyError(e))
    } finally {
      setExporting(false)
    }
  }

  /** Para cuentas creadas antes de instalar el trigger de categorías. */
  async function seedCategories() {
    setSeeding(true)
    setError(null)
    try {
      const { error: err } = await db().rpc('seed_categories_for_me')
      if (err) throw err
      toast.success('Categorías por defecto añadidas')
    } catch (e) {
      setError(friendlyError(e))
    } finally {
      setSeeding(false)
    }
  }

  return (
    <div className="animate-rise max-w-2xl">
      <SectionTitle hint="Tu cuenta, el aspecto de la app y tus datos.">Ajustes</SectionTitle>

      {error && <ErrorNote>{error}</ErrorNote>}

      <div className="stagger mt-4 space-y-3">
        <Card className="card-hover flex items-center gap-4 p-5">
          <div className="grid size-11 shrink-0 place-items-center rounded-2xl text-accent-ink shadow-glow [background:var(--grad)]">
            <User className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-semibold tracking-wide text-ink-3 uppercase">Cuenta</p>
            <p className="truncate text-sm font-medium">{user?.email}</p>
            {autoLogin && (
              <p className="mt-0.5 text-[12px] text-ink-3">
                Entrada automática activada en el archivo .env
              </p>
            )}
          </div>
          {!autoLogin && (
            <Button
              variant="outline"
              icon={<LogOut className="size-4" />}
              onClick={() => void signOut()}
            >
              Salir
            </Button>
          )}
        </Card>

        <Card className="card-hover flex items-center gap-4 p-5">
          <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-accent-soft text-accent">
            {theme === 'dark' ? <Moon className="size-5" /> : <Sun className="size-5" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-semibold tracking-wide text-ink-3 uppercase">Aspecto</p>
            <p className="text-sm font-medium">Tema {theme === 'dark' ? 'oscuro' : 'claro'}</p>
          </div>
          <Button variant="outline" onClick={toggle}>
            Cambiar
          </Button>
        </Card>

        <Card className="card-hover flex items-center gap-4 p-5">
          <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-accent-soft text-accent">
            <Tags className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-semibold tracking-wide text-ink-3 uppercase">
              Categorías
            </p>
            <p className="text-sm leading-snug text-ink-2">
              Recupera las categorías por defecto (Consultoría, Post LinkedIn, Vídeo YouTube,
              Estudio, Investigación…). No duplica las que ya tengas.
            </p>
          </div>
          <Button variant="outline" loading={seeding} onClick={() => void seedCategories()}>
            Restaurar
          </Button>
        </Card>

        <Card className="card-hover flex items-center gap-4 p-5">
          <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-accent-soft text-accent">
            <Download className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-semibold tracking-wide text-ink-3 uppercase">
              Copia de seguridad
            </p>
            <p className="text-sm leading-snug text-ink-2">
              Descarga todos tus datos en un archivo JSON.
            </p>
          </div>
          <Button variant="outline" loading={exporting} onClick={() => void exportData()}>
            Exportar
          </Button>
        </Card>

        <Card className="card-hover flex gap-4 p-5">
          <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-accent-soft text-accent">
            <Smartphone className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-semibold tracking-wide text-ink-3 uppercase">
              Instalar en el móvil
            </p>
            <p className="mt-1 text-sm leading-relaxed text-ink-2">
              <b>Android / Chrome:</b> menú ⋮ → «Añadir a pantalla de inicio».
              <br />
              <b>iPhone / Safari:</b> botón Compartir → «Añadir a pantalla de inicio».
            </p>
            <p className="mt-2 text-[12px] text-ink-3">
              Una vez instalada se abre a pantalla completa y funciona sin conexión para consultar lo
              ya cargado.
            </p>
          </div>
        </Card>
      </div>

      <p className="mt-8 text-center text-[12px] text-ink-3">
        MyOS · tu sistema operativo personal · hecho a medida
      </p>
    </div>
  )
}
