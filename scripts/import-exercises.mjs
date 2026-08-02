/**
 * Importa el catalogo de ejercicios de WorkoutX a tu Supabase.
 *
 *   npm run import-exercises            -> metadatos + GIF de los 200 mas usados
 *   npm run import-exercises -- --gifs=0     -> solo metadatos
 *   npm run import-exercises -- --gifs=400   -> mas GIF (si te queda cuota)
 *   npm run import-exercises -- --only-gifs  -> saltar metadatos, seguir con GIF
 *
 * Por que existe: los GIF de WorkoutX exigen la clave de API, asi que no se
 * pueden poner directamente en el navegador sin filtrarla. Este script los copia
 * una vez a tu bucket de Supabase y la app los sirve desde ahi.
 *
 * La cuota gratis es de 500 peticiones al mes y CADA GIF cuenta como una. El
 * script se detiene solo antes de agotarla y es resumible: al volver a lanzarlo
 * continua por donde iba, saltando lo que ya esta subido.
 */
import { createClient } from '@supabase/supabase-js'

const API = 'https://api.workoutxapp.com/v1'
const PAGE = 10 // el plan gratuito no devuelve mas de 10 por peticion
const QUOTA_FLOOR = 15 // margen que dejamos sin gastar

const key = process.env.WORKOUTX_API_KEY
const supabaseUrl = process.env.VITE_SUPABASE_URL
const secret = process.env.SUPABASE_SECRET_KEY

const args = new Map(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=')
    return [k, v ?? 'true']
  }),
)
const gifTarget = args.has('gifs') ? Number(args.get('gifs')) : 200
const onlyGifs = args.has('only-gifs')

function bail(message) {
  console.error(`\n✗ ${message}\n`)
  process.exit(1)
}

if (!key) bail('Falta WORKOUTX_API_KEY en el archivo .env')
if (!supabaseUrl) bail('Falta VITE_SUPABASE_URL en el archivo .env')
if (!secret) {
  bail(
    'Falta SUPABASE_SECRET_KEY en el archivo .env.\n' +
      '  Copiala de Supabase → Settings → API Keys → Secret keys (sb_secret_...).\n' +
      '  Hace falta para escribir en el catalogo comun, que es de solo lectura para la app.',
  )
}

const db = createClient(supabaseUrl, secret, { auth: { persistSession: false } })

let quotaLeft = Infinity
let lastCall = 0

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// WorkoutX corta a 30 peticiones por minuto, así que espaciamos algo más de 2s.
const MIN_GAP_MS = 2100

/**
 * Llama a la API respetando el ritmo, reintentando si aun así salta el 429 y
 * llevando la cuenta de la cuota mensual.
 */
async function api(path, attempt = 0) {
  const wait = lastCall + MIN_GAP_MS - Date.now()
  if (wait > 0) await sleep(wait)
  lastCall = Date.now()

  const res = await fetch(`${API}${path}`, { headers: { 'X-WorkoutX-Key': key } })
  const remaining = res.headers.get('X-Quota-Remaining')
  if (remaining !== null) quotaLeft = Number(remaining)

  if (res.status === 429 && attempt < 5) {
    const body = await res.json().catch(() => ({}))
    const secs = Number(body.retryAfter) || 35
    process.stdout.write(`\n  · límite por minuto alcanzado, espero ${secs}s…  `)
    await sleep((secs + 2) * 1000)
    return api(path, attempt + 1)
  }

  if (!res.ok) throw new Error(`${res.status} en ${path}: ${await res.text()}`)
  return res
}

const enough = () => quotaLeft > QUOTA_FLOOR

/* -------------------------------------------------------------------------- */
/*  1. Metadatos                                                               */
/* -------------------------------------------------------------------------- */

async function importMetadata() {
  // Reanudamos donde lo dejamos: volver a pedir lo ya guardado gastaria cuota.
  const { count } = await db.from('exercises').select('*', { count: 'exact', head: true })
  const already = count ?? 0

  console.log(
    already
      ? `\n▸ Continuando el catalogo desde el ejercicio ${already}…`
      : '\n▸ Descargando el catalogo en espanol…',
  )

  let offset = Math.floor(already / PAGE) * PAGE
  let total = Infinity
  let saved = already

  while (offset < total && enough()) {
    const res = await api(`/exercises?lang=es&limit=${PAGE}&offset=${offset}`)
    const body = await res.json()
    total = body.total ?? 0

    const rows = (body.data ?? []).map((e) => ({
      id: e.id,
      name: e.name,
      body_part: e.bodyPart ?? null,
      target: e.target ?? null,
      equipment: e.equipment ?? null,
      gif_url: e.gifUrl ?? null,
      instructions: e.instructions ?? [],
      difficulty: e.difficulty ?? null,
      calories_per_min: e.caloriesPerMinute ?? null,
      secondary_muscles: e.secondaryMuscles ?? [],
      popularity_rank: e.popularityRank ?? null,
      source: 'workoutx',
      updated_at: new Date().toISOString(),
    }))

    if (rows.length) {
      const { error } = await db.from('exercises').upsert(rows, { onConflict: 'id' })
      if (error) bail(`Guardando ejercicios: ${error.message}`)
      saved += rows.length
    }

    offset += PAGE
    process.stdout.write(`\r  ${saved}/${total} ejercicios · cuota restante ${quotaLeft}   `)
  }

  console.log(`\n  ✓ ${saved} ejercicios guardados`)
  if (!enough()) {
    console.log('  ⚠ Cuota casi agotada: vuelve a lanzarlo el mes que viene para completar.')
  }
}

/* -------------------------------------------------------------------------- */
/*  2. GIF                                                                     */
/* -------------------------------------------------------------------------- */

async function syncGifs(limit) {
  if (limit <= 0) return
  console.log(`\n▸ Copiando GIF a tu Supabase (maximo ${limit})…`)

  // Prioridad: primero los que ya usas en tus rutinas, luego los mas populares.
  const { data: used } = await db
    .from('routine_exercises')
    .select('exercise_id')
    .not('exercise_id', 'is', null)
  const priority = [...new Set((used ?? []).map((r) => r.exercise_id))]

  const { data: pending, error } = await db
    .from('exercises')
    .select('id, name, popularity_rank')
    .is('gif_path', null)
    .order('popularity_rank', { ascending: true, nullsFirst: false })
    .limit(limit * 2)
  if (error) bail(`Leyendo el catalogo: ${error.message}`)

  const queue = [
    ...(pending ?? []).filter((e) => priority.includes(e.id)),
    ...(pending ?? []).filter((e) => !priority.includes(e.id)),
  ].slice(0, limit)

  if (!queue.length) {
    console.log('  ✓ No hay GIF pendientes.')
    return
  }

  let done = 0
  for (const ex of queue) {
    if (!enough()) {
      console.log(`\n  ⚠ Cuota agotada. Copiados ${done}. Vuelve a lanzarlo cuando se renueve.`)
      break
    }
    try {
      const res = await api(`/gifs/${ex.id}.gif`)
      const bytes = Buffer.from(await res.arrayBuffer())
      const path = `${ex.id}.gif`

      const { error: upErr } = await db.storage
        .from('exercise-gifs')
        .upload(path, bytes, { contentType: 'image/gif', upsert: true })
      if (upErr) throw new Error(upErr.message)

      const { error: rowErr } = await db.from('exercises').update({ gif_path: path }).eq('id', ex.id)
      if (rowErr) throw new Error(rowErr.message)

      done++
      process.stdout.write(`\r  ${done}/${queue.length} · cuota restante ${quotaLeft}   `)
    } catch (e) {
      console.warn(`\n  · ${ex.name}: ${e.message}`)
    }
  }

  console.log(`\n  ✓ ${done} GIF disponibles en tu Supabase`)
}

/* -------------------------------------------------------------------------- */

console.log('MyOS · importador del catalogo de ejercicios')
if (!onlyGifs) await importMetadata()
await syncGifs(gifTarget)

const { count } = await db.from('exercises').select('*', { count: 'exact', head: true })
console.log(`\n✓ Listo. ${count ?? 0} ejercicios en el catalogo. Cuota restante: ${quotaLeft}\n`)
