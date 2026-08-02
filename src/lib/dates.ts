import {
  addDays,
  differenceInCalendarDays,
  endOfWeek,
  format,
  isToday,
  isTomorrow,
  isYesterday,
  parseISO,
  startOfWeek,
  subDays,
} from 'date-fns'
import { es } from 'date-fns/locale'

const WEEK_OPTS = { weekStartsOn: 1 as const, locale: es }

/** 'yyyy-MM-dd' — el formato `date` de Postgres, sin líos de zona horaria. */
export function toISODate(d: Date): string {
  return format(d, 'yyyy-MM-dd')
}

export function fromISODate(s: string): Date {
  return parseISO(s)
}

export const today = () => toISODate(new Date())

/**
 * Día local de un `timestamptz`. Cortar la cadena a 10 caracteres daría el día
 * en UTC, y en España eso adelanta la medianoche una o dos horas: una tarea
 * cerrada a las 00:30 contaría como del día anterior.
 */
export function localDateOf(timestamp: string | null | undefined): string | null {
  return timestamp ? toISODate(new Date(timestamp)) : null
}

/** Lunes de la semana a la que pertenece `d`. */
export function weekStart(d: Date = new Date()): string {
  return toISODate(startOfWeek(d, WEEK_OPTS))
}

export function weekEnd(d: Date = new Date()): string {
  return toISODate(endOfWeek(d, WEEK_OPTS))
}

export function shiftWeek(isoWeekStart: string, weeks: number): string {
  return toISODate(addDays(parseISO(isoWeekStart), weeks * 7))
}

/** "13 – 19 ene 2026" */
export function weekLabel(isoWeekStart: string): string {
  const from = parseISO(isoWeekStart)
  const to = addDays(from, 6)
  const sameMonth = from.getMonth() === to.getMonth()
  const left = format(from, sameMonth ? 'd' : "d 'de' MMM", { locale: es })
  const right = format(to, "d 'de' MMM yyyy", { locale: es })
  return `${left} – ${right}`
}

export function weekNumberLabel(isoWeekStart: string): string {
  return `Semana ${format(parseISO(isoWeekStart), 'w', WEEK_OPTS)}`
}

/** "Hoy", "Mañana", "Ayer" o "lun 13 ene". */
export function humanDate(iso: string | null | undefined): string {
  if (!iso) return 'Sin fecha'
  const d = parseISO(iso)
  if (isToday(d)) return 'Hoy'
  if (isTomorrow(d)) return 'Mañana'
  if (isYesterday(d)) return 'Ayer'
  return format(d, "EEE d 'de' MMM", { locale: es })
}

export function longDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return format(parseISO(iso), "d 'de' MMMM 'de' yyyy", { locale: es })
}

export function shortDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return format(parseISO(iso), 'd MMM', { locale: es })
}

/** Negativo = atrasada. 0 = hoy. */
export function daysUntil(iso: string): number {
  return differenceInCalendarDays(parseISO(iso), new Date())
}

export function isOverdue(iso: string | null): boolean {
  return Boolean(iso) && daysUntil(iso!) < 0
}

/** Los últimos `n` días en ISO, del más antiguo al más reciente. */
export function lastNDays(n: number): string[] {
  const out: string[] = []
  for (let i = n - 1; i >= 0; i--) out.push(toISODate(subDays(new Date(), i)))
  return out
}

/** Los últimos `n` lunes, del más antiguo al más reciente. */
export function lastNWeeks(n: number): string[] {
  const current = weekStart()
  const out: string[] = []
  for (let i = n - 1; i >= 0; i--) out.push(shiftWeek(current, -i))
  return out
}

export const dayInitial = (iso: string) =>
  format(parseISO(iso), 'EEEEE', { locale: es }).toUpperCase()

export const dayShort = (iso: string) => format(parseISO(iso), 'EEE', { locale: es })

export function greeting(): string {
  const h = new Date().getHours()
  if (h < 6) return 'Buenas noches'
  if (h < 13) return 'Buenos días'
  if (h < 21) return 'Buenas tardes'
  return 'Buenas noches'
}
