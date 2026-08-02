/**
 * Paleta categórica para gráficos.
 *
 * Verificada con el validador del skill `dataviz` en modo claro y oscuro:
 *   lightness OK · chroma OK · separación daltónica OK · contraste OK
 * Dos avisos quedan abiertos a propósito (azul↔violeta ΔE 6.1 en deuteranopía,
 * y el violeta a 2.88:1 sobre superficie oscura). El remedio exigido es
 * codificación secundaria: por eso TODOS los gráficos de esta app llevan
 * leyenda visible y etiquetas directas — nunca identidad solo por color.
 *
 * El orden es FIJO. La serie 3 siempre es violeta, filtres lo que filtres.
 */
export const CHART_COLORS = [
  '#0D9488', // 1 · teal
  '#A16207', // 2 · oro
  '#8B2FD6', // 3 · violeta
  '#0E7CC4', // 4 · azul
  '#B45309', // 5 · naranja
  '#DB2777', // 6 · rosa
  '#657C12', // 7 · oliva
] as const

/** Color de una serie por su índice. La 8ª serie se agrupa en "Otros". */
export const seriesColor = (i: number) => CHART_COLORS[i % CHART_COLORS.length]

/** Colores de estado: reservados, nunca se usan como "serie 4". */
export const STATUS_COLORS = {
  good: 'var(--good)',
  warn: 'var(--warn)',
  bad: 'var(--bad)',
} as const

/** Paleta que se ofrece al crear categorías de tareas. */
export const CATEGORY_SWATCHES = [
  '#0D9488',
  '#0F766E',
  '#0E7CC4',
  '#8B2FD6',
  '#DB2777',
  '#B45309',
  '#A16207',
  '#657C12',
  '#BE123C',
  '#4338CA',
] as const

/** Un color estable para una cadena, para que la misma categoría no cambie de tono. */
export function colorForKey(key: string): string {
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0
  return CHART_COLORS[h % CHART_COLORS.length]
}

/** Color legible sobre un fondo dado (para texto encima de un chip de color). */
export function readableInk(hex: string): string {
  const c = hex.replace('#', '')
  const n =
    c.length === 3
      ? c
          .split('')
          .map((x) => x + x)
          .join('')
      : c
  const r = parseInt(n.slice(0, 2), 16) / 255
  const g = parseInt(n.slice(2, 4), 16) / 255
  const b = parseInt(n.slice(4, 6), 16) / 255
  const lin = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
  return L > 0.45 ? '#141210' : '#ffffff'
}

/** Mismo color con transparencia, para fondos suaves de chips. */
export function withAlpha(hex: string, alpha: number): string {
  const a = Math.round(alpha * 255)
    .toString(16)
    .padStart(2, '0')
  return `${hex}${a}`
}
