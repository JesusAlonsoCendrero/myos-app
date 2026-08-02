// Comprobacion del estado de la base de datos.
//   npm run check-catalog
import { createClient } from '@supabase/supabase-js'

const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
})

const { count: total } = await db.from('exercises').select('*', { count: 'exact', head: true })
const { count: withGif } = await db
  .from('exercises')
  .select('*', { count: 'exact', head: true })
  .not('gif_path', 'is', null)

console.log(`Ejercicios en el catalogo : ${total}`)
console.log(`Con animacion descargada  : ${withGif}`)

// Cada comprobacion toca una tabla o columna concreta de su migracion.
const checks = [
  ['v2 · lienzos', () => db.from('canvas_blocks').select('id').limit(1)],
  ['v2 · objetivos por frente', () => db.from('weekly_goals').select('group_key, tech').limit(1)],
  ['v2 · tareas enlazadas', () => db.from('tasks').select('goal_id, project_id').limit(1)],
  ['v2 · viajes en el mapa', () => db.from('trips').select('lat, lon, image_url').limit(1)],
  ['v3 · gymbros', () => db.from('buddies').select('id, emoji').limit(1)],
  ['v3 · series por persona', () => db.from('workout_sets').select('buddy_id').limit(1)],
  ['v4 · proyectos en Mi dia', () => db.from('projects').select('my_day_date').limit(1)],
  ['v6 · proyecto como objetivo', () => db.from('weekly_goals').select('project_id').limit(1)],
]

console.log('\nMigraciones:')
let fallos = 0
for (const [label, run] of checks) {
  const { error } = await run()
  if (error) fallos++
  console.log(`  ${error ? '✗' : '✓'} ${label}${error ? ` — ${error.message}` : ''}`)
}

// v5: el estado "pausado" ya no debe existir ni admitirse.
const { data: pausados } = await db.from('projects').select('id').eq('status', 'pausado')
console.log(
  `  ${pausados?.length ? '✗' : '✓'} v5 · sin estado "Pausado"` +
    (pausados?.length ? ` — quedan ${pausados.length}` : ''),
)

console.log(fallos ? `\n✗ ${fallos} comprobacion(es) fallidas\n` : '\n✓ Todo en orden\n')
