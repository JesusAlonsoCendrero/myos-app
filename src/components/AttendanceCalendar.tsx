import { useMemo, useState } from 'react'
import { addMonths, eachDayOfInterval, endOfMonth, format, isSameMonth, startOfMonth } from 'date-fns'
import { es } from 'date-fns/locale'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Card, cx, IconButton } from './ui'
import { toISODate, today } from '@/lib/dates'

const WEEKDAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

/**
 * Calendario mensual de asistencia. Los días con sesión se pintan; el resto
 * quedan apagados. Se puede navegar mes a mes hacia atrás.
 */
export default function AttendanceCalendar({
  attended,
  onPickDay,
}: {
  /** Fechas ISO con sesión registrada. */
  attended: Set<string>
  onPickDay?: (iso: string) => void
}) {
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()))
  const iso = today()

  const { cells, monthCount, monthTotal } = useMemo(() => {
    const first = startOfMonth(cursor)
    const last = endOfMonth(cursor)
    const days = eachDayOfInterval({ start: first, end: last })

    // Hueco inicial para que el 1 caiga en su día de la semana (lunes primero).
    const lead = (first.getDay() + 6) % 7
    const blanks = Array.from({ length: lead }, () => null)

    const count = days.filter((d) => attended.has(toISODate(d))).length
    return {
      cells: [...blanks, ...days],
      monthCount: count,
      monthTotal: days.length,
    }
  }, [cursor, attended])

  const atCurrentMonth = isSameMonth(cursor, new Date())

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-lg leading-tight font-bold capitalize">
            {format(cursor, 'LLLL yyyy', { locale: es })}
          </h3>
          <p className="tnum text-[13px] text-ink-3">
            {monthCount} {monthCount === 1 ? 'sesión' : 'sesiones'} ·{' '}
            {Math.round((monthCount / monthTotal) * 100)}% de los días
          </p>
        </div>
        <div className="flex shrink-0 items-center">
          <IconButton label="Mes anterior" onClick={() => setCursor((c) => addMonths(c, -1))}>
            <ChevronLeft className="size-5" />
          </IconButton>
          <IconButton
            label="Mes siguiente"
            disabled={atCurrentMonth}
            onClick={() => setCursor((c) => addMonths(c, 1))}
          >
            <ChevronRight className="size-5" />
          </IconButton>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1.5">
        {WEEKDAYS.map((d, i) => (
          <div
            key={i}
            className="pb-1 text-center text-[11px] font-bold tracking-wide text-ink-3 uppercase"
          >
            {d}
          </div>
        ))}

        {cells.map((day, i) => {
          if (!day) return <div key={`b${i}`} />

          const key = toISODate(day)
          const hit = attended.has(key)
          const isToday = key === iso
          const future = key > iso

          return (
            <button
              key={key}
              disabled={future || !onPickDay}
              onClick={() => onPickDay?.(key)}
              title={`${format(day, "d 'de' MMMM", { locale: es })}${hit ? ' — entrenaste' : ''}`}
              className={cx(
                'grid aspect-square place-items-center rounded-xl text-[13px] font-bold transition-all duration-200',
                hit
                  ? 'text-accent-ink shadow-glow [background:var(--grad)] hover:scale-105'
                  : future
                    ? 'text-ink-3/40'
                    : 'bg-surface-2 text-ink-3 hover:scale-105 hover:bg-surface-3',
                isToday && !hit && 'ring-2 ring-accent ring-inset',
                onPickDay && !future && 'cursor-pointer',
              )}
            >
              <span className="tnum">{format(day, 'd')}</span>
            </button>
          )
        })}
      </div>
    </Card>
  )
}
