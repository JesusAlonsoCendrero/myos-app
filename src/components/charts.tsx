import { useState, type ReactNode } from 'react'
import { Table2 } from 'lucide-react'
import AnimatedNumber from './AnimatedNumber'
import { Card, cx, IconButton } from './ui'

/* --------------------------------------------------------------------------
   Piezas compartidas por todos los gráficos.

   Reglas que se cumplen aquí y no se negocian:
   · Leyenda siempre visible cuando hay 2+ series (con 1 serie manda el título).
   · Etiquetas directas sobre las marcas: la identidad nunca depende solo del color.
     Hace falta porque la paleta tiene dos avisos abiertos del validador
     (azul↔violeta en deuteranopía, y violeta a 2.88:1 sobre fondo oscuro).
   · Un solo eje. Nunca dos escalas Y en el mismo gráfico.
   · Rejilla y ejes discretos; el dato es lo que se ve.
   · Toda tarjeta ofrece la vista de tabla como alternativa accesible.
   -------------------------------------------------------------------------- */

export const AXIS_PROPS = {
  stroke: 'var(--ink-3)',
  fontSize: 11,
  tickLine: false,
  axisLine: false,
} as const

export const GRID_PROPS = {
  stroke: 'var(--line)',
  strokeDasharray: '2 4',
  vertical: false,
} as const

export const LABEL_STYLE = {
  fill: 'var(--ink-2)',
  fontSize: 11,
  fontWeight: 600,
} as const

/** Tooltip con la tipografía y superficies de la app. */
export function ChartTooltip({
  active,
  payload,
  label,
  unit = '',
}: {
  active?: boolean
  payload?: Array<{ name?: string; value?: number | string; color?: string }>
  label?: string | number
  unit?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl border border-line bg-surface px-3 py-2 shadow-card">
      {label !== undefined && (
        <p className="mb-1 text-[12px] font-semibold text-ink">{String(label)}</p>
      )}
      {payload.map((p, i) => (
        <p key={i} className="flex items-center gap-2 text-[12px] text-ink-2">
          {p.color && (
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: p.color }}
              aria-hidden
            />
          )}
          {p.name && <span>{p.name}</span>}
          <span className="tnum font-semibold text-ink">
            {p.value}
            {unit}
          </span>
        </p>
      ))}
    </div>
  )
}

/**
 * Tarjeta de gráfico con vista de tabla conmutable.
 * `columns` describe la tabla equivalente al gráfico.
 */
export function ChartCard<T extends Record<string, unknown>>({
  title,
  subtitle,
  data,
  columns,
  height = 220,
  children,
  className,
}: {
  title: string
  subtitle?: string
  data: T[]
  columns: Array<{ key: keyof T & string; label: string; format?: (v: unknown) => string }>
  height?: number
  children: ReactNode
  className?: string
}) {
  const [asTable, setAsTable] = useState(false)

  return (
    <Card className={cx('flex flex-col p-5', className)}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
          {subtitle && <p className="mt-0.5 text-[12px] text-ink-3">{subtitle}</p>}
        </div>
        <IconButton
          label={asTable ? 'Ver gráfico' : 'Ver los datos en tabla'}
          onClick={() => setAsTable((v) => !v)}
          className={asTable ? 'text-accent' : ''}
        >
          <Table2 className="size-4" />
        </IconButton>
      </div>

      {asTable ? (
        <div className="max-h-[var(--h)] overflow-auto" style={{ ['--h' as string]: `${height}px` }}>
          <table className="w-full text-left text-[13px]">
            <thead className="sticky top-0 bg-surface">
              <tr className="border-b border-line">
                {columns.map((c) => (
                  <th key={c.key} className="py-1.5 pr-3 font-semibold text-ink-2">
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((row, i) => (
                <tr key={i} className="border-b border-line/60 last:border-0">
                  {columns.map((c) => (
                    <td key={c.key} className="py-1.5 pr-3 tnum">
                      {c.format ? c.format(row[c.key]) : String(row[c.key] ?? '—')}
                    </td>
                  ))}
                </tr>
              ))}
              {data.length === 0 && (
                <tr>
                  <td colSpan={columns.length} className="py-6 text-center text-ink-3">
                    Sin datos todavía.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ height }}>{children}</div>
      )}
    </Card>
  )
}

/** Leyenda propia: siempre presente cuando hay dos o más series. */
export function Legend({
  items,
  className,
}: {
  items: Array<{ label: string; color: string }>
  className?: string
}) {
  return (
    <ul className={cx('flex flex-wrap items-center gap-x-4 gap-y-1.5', className)}>
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5 text-[12px] text-ink-2">
          <span
            className="size-2.5 shrink-0 rounded-[3px]"
            style={{ backgroundColor: i.color }}
            aria-hidden
          />
          {i.label}
        </li>
      ))}
    </ul>
  )
}

/**
 * Número protagonista. Cuando el dato es uno solo, un gráfico sobra.
 */
export function StatTile({
  label,
  value,
  unit,
  hint,
  tone = 'neutral',
  icon,
}: {
  label: string
  value: string | number
  unit?: string
  hint?: string
  tone?: 'neutral' | 'good' | 'warn' | 'bad'
  icon?: ReactNode
}) {
  const toneColor = {
    neutral: 'var(--ink)',
    good: 'var(--good)',
    warn: 'var(--warn)',
    bad: 'var(--bad)',
  }[tone]

  return (
    <Card className="card-hover p-4">
      <p className="flex items-center gap-1.5 text-[11px] font-bold tracking-[0.1em] text-ink-3 uppercase">
        {icon}
        {label}
      </p>
      <p
        className="mt-2 font-display text-4xl leading-none font-bold tnum"
        style={{ color: toneColor }}
      >
        {typeof value === 'number' ? <AnimatedNumber value={value} /> : value}
        {unit && <span className="ml-1 font-sans text-[13px] font-medium text-ink-3">{unit}</span>}
      </p>
      {hint && <p className="mt-1.5 text-[12px] leading-snug text-ink-3">{hint}</p>}
    </Card>
  )
}
