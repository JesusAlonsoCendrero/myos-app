import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Respaldo del proyecto de Supabase.
 *
 * Estos dos valores son públicos por diseño: la `publishable key` está pensada
 * para viajar en el navegador y quien protege los datos es Row Level Security,
 * que exige haber iniciado sesión. Van aquí para que la app funcione aunque el
 * hosting no tenga configuradas las variables de entorno, que es la causa número
 * uno de despliegues rotos con Vite (las variables se incrustan al compilar, no
 * se leen al abrir la web).
 *
 * Las variables de entorno, si existen, siempre mandan sobre esto.
 */
const FALLBACK_URL = 'https://iqkchwnidgyzdncssggd.supabase.co'
const FALLBACK_ANON_KEY = 'sb_publishable_WA_Czw81Qkut4kGAzXh6rQ_aycGdTor'

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || FALLBACK_URL
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || FALLBACK_ANON_KEY

/** true cuando el archivo .env está relleno con valores reales. */
export const isConfigured = Boolean(
  url && anonKey && url.startsWith('http') && !url.includes('xxxxxxxx'),
)

/**
 * Credenciales de entrada automática. MyOS es de un solo usuario: si están
 * puestas, la app entra sola y nunca enseña la pantalla de login.
 *
 * Vienen SOLO de variables de entorno, nunca escritas aquí. Este repositorio es
 * público y una contraseña no debe vivir en el código fuente.
 *
 *   · En local  → archivo .env (que está en .gitignore)
 *   · En Netlify → Site configuration → Environment variables
 *
 * Aun así, ten presente que al compilar acaban dentro del JavaScript que
 * descarga el navegador: quien abra la URL del sitio entra como el dueño. Es una
 * decisión consciente para una app personal cuya dirección no se comparte. Si
 * quieres cerrarla, borra esas dos variables del hosting y volverá a pedir la
 * contraseña una sola vez por dispositivo (la sesión queda guardada).
 */
export const autoLogin = (() => {
  const email = import.meta.env.VITE_AUTO_EMAIL as string | undefined
  const password = import.meta.env.VITE_AUTO_PASSWORD as string | undefined
  return email && password ? { email, password } : null
})()

// Si falta configuración devolvemos null y la app enseña la pantalla de Setup
// en vez de reventar con un error críptico al arrancar.
export const supabase: SupabaseClient | null = isConfigured
  ? createClient(url!, anonKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'myos:auth',
      },
    })
  : null

/** Igual que `supabase` pero lanza si no hay cliente: para usar dentro de páginas. */
export function db(): SupabaseClient {
  if (!supabase) throw new Error('Supabase no está configurado. Revisa tu archivo .env')
  return supabase
}

/** Traduce los errores de Supabase a algo que se entienda en español. */
export function friendlyError(error: unknown): string {
  // Los errores de PostgREST no son instancias de Error: son objetos con message.
  const raw =
    typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message: unknown }).message)
      : String(error ?? '')
  const map: Array<[RegExp, string]> = [
    [/invalid login credentials/i, 'Email o contraseña incorrectos.'],
    [/email not confirmed/i, 'Confirma tu email antes de entrar (revisa tu bandeja).'],
    [/user already registered/i, 'Ese email ya tiene cuenta. Entra en vez de registrarte.'],
    [/password should be at least/i, 'La contraseña debe tener al menos 6 caracteres.'],
    [
      /email rate limit|over_email_send/i,
      'Supabase ha cortado el envío de emails de confirmación por exceso (el límite es por hora). ' +
        'Crea el usuario a mano en Authentication → Users → Add user, con "Auto Confirm User" marcado.',
    ],
    [
      /you can only request this after/i,
      'Supabase pide esperar unos segundos entre intentos. Prueba otra vez en un momento.',
    ],
    [/signups? (are )?disabled/i, 'Los registros están desactivados en Supabase (Authentication → Sign In / Providers → Email → Allow new users to sign up).'],
    [/rate limit|too many requests/i, 'Demasiados intentos seguidos. Espera un poco antes de reintentar.'],
    [/failed to fetch|networkerror/i, 'Sin conexión con Supabase. Comprueba tu red y la URL.'],
    [
      /relation .* does not exist/i,
      'Faltan las tablas: ejecuta supabase/schema.sql en el SQL Editor.',
    ],
    [/row-level security/i, 'Permiso denegado por RLS. ¿Has iniciado sesión?'],
  ]
  for (const [re, msg] of map) if (re.test(raw)) return msg
  return raw || 'Ha ocurrido un error inesperado.'
}
