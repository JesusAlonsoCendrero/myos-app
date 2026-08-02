/**
 * Ejecuta las migraciones SQL contra tu proyecto de Supabase.
 *
 *   npm run migrate           -> lanza las que falten, en orden
 *   npm run migrate -- --dry  -> solo dice cuales lanzaria
 *
 * Necesita en el .env:
 *   SUPABASE_ACCESS_TOKEN  -> token personal (empieza por sbp_)
 *                             supabase.com/dashboard/account/tokens
 *   SUPABASE_PROJECT_REF   -> el identificador del proyecto (sale en su URL)
 *
 * Se puede relanzar sin miedo: todos los archivos son idempotentes.
 */
import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const token = process.env.SUPABASE_ACCESS_TOKEN
const ref =
  process.env.SUPABASE_PROJECT_REF ??
  (process.env.VITE_SUPABASE_URL ?? '').replace('https://', '').split('.')[0]

const dry = process.argv.includes('--dry')

if (!token) {
  console.error(
    '\n✗ Falta SUPABASE_ACCESS_TOKEN en el .env\n' +
      '  Crealo en supabase.com/dashboard/account/tokens (empieza por sbp_).\n' +
      '  Es revocable: cuando terminemos puedes borrarlo desde ahi.\n',
  )
  process.exit(1)
}
if (!ref) {
  console.error('\n✗ No se puede deducir el proyecto. Pon SUPABASE_PROJECT_REF en el .env\n')
  process.exit(1)
}

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'supabase')

/** Lanza un bloque de SQL y devuelve la respuesta ya interpretada. */
async function run(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${res.status} — ${text.slice(0, 400)}`)
  return text
}

// schema.sql primero; el resto por numero de version.
const files = (await readdir(dir))
  .filter((f) => f.endsWith('.sql'))
  .sort((a, b) => {
    if (a === 'schema.sql') return -1
    if (b === 'schema.sql') return 1
    const n = (s) => Number(s.match(/v(\d+)/)?.[1] ?? 0)
    return n(a) - n(b)
  })

console.log(`\nProyecto: ${ref}`)
console.log(`Migraciones encontradas: ${files.join(', ')}\n`)

if (dry) {
  console.log('(--dry) No se ha ejecutado nada.\n')
  process.exit(0)
}

for (const file of files) {
  const sql = await readFile(join(dir, file), 'utf8')
  process.stdout.write(`  ${file.padEnd(22)} `)
  try {
    await run(sql)
    console.log('✓')
  } catch (e) {
    console.log('✗')
    console.error(`\n  ${e.message}\n`)
    process.exit(1)
  }
}

console.log('\n✓ Todas las migraciones aplicadas.\n')
