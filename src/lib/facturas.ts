// Facturas de autónomo: tipos, cuentas y trimestres.
// Refleja supabase/migration-v13.sql. Si tocas el SQL, toca esto también.

import { addDays, format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'

/* -------------------------------------------------------------------------- */
/*  Tipos                                                                      */
/* -------------------------------------------------------------------------- */

export type InvoiceStatus = 'borrador' | 'emitida' | 'cobrada'

export interface FiscalProfile {
  user_id: string
  name: string
  tagline: string | null
  nif: string
  address: string | null
  email: string | null
  phone: string | null
  iban: string | null
  iva_rate: number
  iva_exempt: boolean
  iva_note: string | null
  irpf_rate: number
  irpf_note: string | null
  payment_days: number
}

/** Lo que se congela dentro de cada factura al emitirla. */
export type Issuer = Pick<
  FiscalProfile,
  'name' | 'tagline' | 'nif' | 'address' | 'email' | 'phone' | 'iban'
>

export interface Client {
  id: string
  user_id: string
  name: string
  nif: string | null
  address: string | null
  email: string | null
  notes: string | null
  created_at: string
}

export interface InvoiceLine {
  concept: string
  detail: string
  qty: number
  unit: string
  price: number
}

export interface Invoice {
  id: string
  user_id: string
  number: string
  status: InvoiceStatus
  issue_date: string
  service_date: string | null
  due_date: string | null
  paid_date: string | null
  client_id: string | null
  client_name: string
  client_nif: string | null
  client_address: string | null
  issuer: Partial<Issuer>
  lines: InvoiceLine[]
  iva_rate: number
  iva_exempt: boolean
  iva_note: string | null
  irpf_rate: number
  irpf_note: string | null
  base: number
  iva_amount: number
  irpf_amount: number
  total: number
  notes: string | null
  created_at: string
}

export interface Expense {
  id: string
  user_id: string
  date: string
  supplier: string
  supplier_nif: string | null
  concept: string
  category: ExpenseCategory
  base: number
  iva_rate: number
  iva_amount: number
  iva_deductible: boolean
  total: number
  notes: string | null
  created_at: string
}

export const STATUS_LABEL: Record<InvoiceStatus, string> = {
  borrador: 'Borrador',
  emitida: 'Pendiente de cobro',
  cobrada: 'Cobrada',
}

export const STATUS_TONE: Record<InvoiceStatus, 'neutral' | 'warn' | 'good'> = {
  borrador: 'neutral',
  emitida: 'warn',
  cobrada: 'good',
}

export type ExpenseCategory =
  | 'cuota'
  | 'software'
  | 'material'
  | 'formacion'
  | 'telefono'
  | 'gestoria'
  | 'desplazamiento'
  | 'otros'

export const EXPENSE_CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  cuota: 'Cuota de autónomos',
  software: 'Software y suscripciones',
  material: 'Equipos y material',
  formacion: 'Formación',
  telefono: 'Teléfono e internet',
  gestoria: 'Gestoría y banco',
  desplazamiento: 'Desplazamientos',
  otros: 'Otros',
}

export const IVA_RATES = [21, 10, 4, 0] as const
export const IRPF_RATES = [7, 15, 0] as const
export const UNITS = ['h', 'ud', 'día', 'sesión', 'mes', ''] as const

/* -------------------------------------------------------------------------- */
/*  Valores por defecto                                                        */
/* -------------------------------------------------------------------------- */

export const DEFAULT_IVA_NOTE =
  'El servicio de formación está exento de I.V.A. según el art. 20. uno. 9º de la Ley del I.V.A.'

export const DEFAULT_IRPF_NOTE =
  'Retención del 7 % por inicio de actividad profesional (art. 101.5 de la Ley 35/2006 y art. 95.1 del Reglamento del IRPF).'

export const EMPTY_PROFILE: Omit<FiscalProfile, 'user_id'> = {
  name: '',
  tagline: '',
  nif: '',
  address: '',
  email: '',
  phone: '',
  iban: '',
  iva_rate: 0,
  iva_exempt: true,
  iva_note: DEFAULT_IVA_NOTE,
  irpf_rate: 7,
  irpf_note: DEFAULT_IRPF_NOTE,
  payment_days: 30,
}

export const emptyLine = (): InvoiceLine => ({
  concept: '',
  detail: '',
  qty: 1,
  unit: 'h',
  price: 0,
})

/**
 * Datos personales que NO viajan a GitHub: si existe `src/lib/privado.local.ts`
 * (está en .gitignore) se usan para rellenar tus datos la primera vez y para
 * ofrecer importar tu primera factura. En el hosting no existe y no pasa nada.
 */
interface Privado {
  perfil?: Partial<Omit<FiscalProfile, 'user_id'>>
  clientes?: Array<Partial<Client>>
  facturas?: Array<Partial<Invoice>>
}
const modulos = import.meta.glob<Privado>('./privado.local.ts', { eager: true, import: 'default' })
export const PRIVADO: Privado = Object.values(modulos)[0] ?? {}

/* -------------------------------------------------------------------------- */
/*  Cuentas                                                                    */
/* -------------------------------------------------------------------------- */

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

export const lineAmount = (l: InvoiceLine) => round2((Number(l.qty) || 0) * (Number(l.price) || 0))

export function computeTotals(
  lines: InvoiceLine[],
  ivaRate: number,
  ivaExempt: boolean,
  irpfRate: number,
) {
  const base = round2(lines.reduce((s, l) => s + lineAmount(l), 0))
  const iva = ivaExempt ? 0 : round2((base * (Number(ivaRate) || 0)) / 100)
  const irpf = round2((base * (Number(irpfRate) || 0)) / 100)
  return { base, iva, irpf, total: round2(base + iva - irpf) }
}

/** Siguiente número de la serie del año: 2026-001, 2026-002… */
export function nextNumber(invoices: Pick<Invoice, 'number'>[], year: number): string {
  const prefix = `${year}-`
  const max = invoices
    .filter((i) => i.number.startsWith(prefix))
    .map((i) => parseInt(i.number.slice(prefix.length), 10))
    .filter((n) => Number.isFinite(n))
    .reduce((m, n) => Math.max(m, n), 0)
  return `${prefix}${String(max + 1).padStart(3, '0')}`
}

/* -------------------------------------------------------------------------- */
/*  Formato                                                                    */
/* -------------------------------------------------------------------------- */

const EUR = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  useGrouping: 'always' as unknown as boolean,
})
const NUM = new Intl.NumberFormat('es-ES', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  useGrouping: 'always' as unknown as boolean,
})

export const eur = (n: number) => EUR.format(Number(n) || 0)
export const num2 = (n: number) => NUM.format(Number(n) || 0)
/** "7 %" / "21 %" sin decimales sobrantes. */
export const pct = (n: number) => `${Number(n).toLocaleString('es-ES')} %`

export const longEs = (iso: string | null | undefined) =>
  iso ? format(parseISO(iso), "d 'de' MMMM 'de' yyyy", { locale: es }) : '—'

export const shortEs = (iso: string | null | undefined) =>
  iso ? format(parseISO(iso), 'dd/MM/yyyy') : '—'

export const addDaysISO = (iso: string, days: number) =>
  format(addDays(parseISO(iso), days), 'yyyy-MM-dd')

export const formatIban = (iban: string | null | undefined) =>
  (iban ?? '').replace(/\s+/g, '').toUpperCase().replace(/(.{4})/g, '$1 ').trim()

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('')

/* -------------------------------------------------------------------------- */
/*  Trimestres                                                                 */
/* -------------------------------------------------------------------------- */

export type Quarter = 1 | 2 | 3 | 4

export const quarterOf = (iso: string): Quarter =>
  (Math.floor((parseInt(iso.slice(5, 7), 10) - 1) / 3) + 1) as Quarter

export const yearOf = (iso: string) => parseInt(iso.slice(0, 4), 10)

export function quarterRange(year: number, q: Quarter) {
  const startMonth = (q - 1) * 3 + 1
  const endMonth = startMonth + 2
  const lastDay = new Date(year, endMonth, 0).getDate()
  const mm = (m: number) => String(m).padStart(2, '0')
  return {
    from: `${year}-${mm(startMonth)}-01`,
    to: `${year}-${mm(endMonth)}-${lastDay}`,
  }
}

/** Plazo de presentación del 303 y el 130. */
export function quarterDeadline(year: number, q: Quarter): string {
  return q === 4 ? `30 de enero de ${year + 1}` : `20 de ${['abril', 'julio', 'octubre'][q - 1]} de ${year}`
}

export const QUARTER_MONTHS: Record<Quarter, string> = {
  1: 'enero – marzo',
  2: 'abril – junio',
  3: 'julio – septiembre',
  4: 'octubre – diciembre',
}

const inRange = (iso: string, from: string, to: string) => iso >= from && iso <= to

/** Las facturas que cuentan para Hacienda: todo menos los borradores. */
export const countable = (i: Invoice) => i.status !== 'borrador'

/** Coste de un gasto para el IRPF: si el IVA no se deduce, también es gasto. */
export const expenseCost = (e: Expense) =>
  round2(Number(e.base) + (e.iva_deductible ? 0 : Number(e.iva_amount)))

/* -------------------------------- Modelo 303 ---------------------------------- */

export interface Modelo303 {
  /** Por tipo: base y cuota devengada. */
  devengado: Array<{ rate: number; base: number; cuota: number; casillas: string }>
  totalDevengado: number
  exentas: number
  soportadoBase: number
  soportadoCuota: number
  resultado: number
  facturas: Invoice[]
  gastos: Expense[]
}

const CASILLAS_303: Record<number, string> = { 4: '01 · 02 · 03', 10: '04 · 05 · 06', 21: '07 · 08 · 09' }

export function modelo303(
  invoices: Invoice[],
  expenses: Expense[],
  year: number,
  q: Quarter,
): Modelo303 {
  const { from, to } = quarterRange(year, q)
  const facturas = invoices.filter((i) => countable(i) && inRange(i.issue_date, from, to))
  const gastos = expenses.filter((e) => inRange(e.date, from, to))

  const porTipo = new Map<number, { base: number; cuota: number }>()
  let exentas = 0
  for (const f of facturas) {
    if (f.iva_exempt || Number(f.iva_rate) === 0) {
      exentas += Number(f.base)
      continue
    }
    const r = Number(f.iva_rate)
    const acc = porTipo.get(r) ?? { base: 0, cuota: 0 }
    acc.base += Number(f.base)
    acc.cuota += Number(f.iva_amount)
    porTipo.set(r, acc)
  }
  const devengado = [...porTipo.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([rate, v]) => ({
      rate,
      base: round2(v.base),
      cuota: round2(v.cuota),
      casillas: CASILLAS_303[rate] ?? '',
    }))
  const totalDevengado = round2(devengado.reduce((s, d) => s + d.cuota, 0))

  const deducibles = gastos.filter((g) => g.iva_deductible && Number(g.iva_amount) > 0)
  const soportadoBase = round2(deducibles.reduce((s, g) => s + Number(g.base), 0))
  const soportadoCuota = round2(deducibles.reduce((s, g) => s + Number(g.iva_amount), 0))

  return {
    devengado,
    totalDevengado,
    exentas: round2(exentas),
    soportadoBase,
    soportadoCuota,
    resultado: round2(totalDevengado - soportadoCuota),
    facturas,
    gastos,
  }
}

/* -------------------------------- Modelo 130 ---------------------------------- */

export interface Modelo130 {
  c01: number // ingresos computables desde el 1 de enero
  c02: number // gastos fiscalmente deducibles desde el 1 de enero
  c03: number // rendimiento neto
  c04: number // 20 % del rendimiento (si es positivo)
  c05: number // pagos fraccionados de trimestres anteriores
  c06: number // retenciones soportadas desde el 1 de enero
  c07: number // resultado
  aIngresar: number
  /** % de los ingresos del año que llevan retención (si ≥ 70 % no se presenta). */
  pctConRetencion: number
}

/**
 * Pago fraccionado del IRPF (estimación directa). Es acumulativo: cada
 * trimestre cuenta desde el 1 de enero y resta lo ya pagado en los anteriores.
 */
export function modelo130(
  invoices: Invoice[],
  expenses: Expense[],
  year: number,
  q: Quarter,
): Modelo130 {
  const from = `${year}-01-01`
  const to = quarterRange(year, q).to
  const fs = invoices.filter((i) => countable(i) && inRange(i.issue_date, from, to))
  const gs = expenses.filter((e) => inRange(e.date, from, to))

  const c01 = round2(fs.reduce((s, f) => s + Number(f.base), 0))
  const c02 = round2(gs.reduce((s, g) => s + expenseCost(g), 0))
  const c03 = round2(c01 - c02)
  const c04 = c03 > 0 ? round2(c03 * 0.2) : 0
  let c05 = 0
  for (let p = 1; p < q; p++) {
    c05 += Math.max(0, modelo130(invoices, expenses, year, p as Quarter).c07)
  }
  c05 = round2(c05)
  const c06 = round2(fs.reduce((s, f) => s + Number(f.irpf_amount), 0))
  const c07 = round2(c04 - c05 - c06)
  const conRet = fs.filter((f) => Number(f.irpf_rate) > 0).reduce((s, f) => s + Number(f.base), 0)

  return {
    c01,
    c02,
    c03,
    c04,
    c05,
    c06,
    c07,
    aIngresar: Math.max(0, c07),
    pctConRetencion: c01 > 0 ? Math.round((conRet / c01) * 100) : 0,
  }
}

/* -------------------------------- Exportar ---------------------------------- */

function csvCell(v: unknown): string {
  const s = typeof v === 'number' ? num2(v) : String(v ?? '')
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** CSV con punto y coma: Excel en español lo abre directamente. */
export function toCsv(rows: unknown[][]): string {
  return '﻿' + rows.map((r) => r.map(csvCell).join(';')).join('\r\n')
}

export function download(filename: string, content: string, type = 'text/csv;charset=utf-8') {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function libroIngresos(fs: Invoice[]) {
  return toCsv([
    ['Nº factura', 'Fecha expedición', 'Fecha servicio', 'Cliente', 'NIF cliente', 'Concepto', 'Base imponible', 'Tipo IVA', 'Cuota IVA', 'Exenta', 'Tipo IRPF', 'Retención IRPF', 'Total', 'Estado', 'Fecha cobro'],
    ...fs.map((f) => [
      f.number,
      shortEs(f.issue_date),
      shortEs(f.service_date),
      f.client_name,
      f.client_nif ?? '',
      f.lines.map((l) => l.concept).join(' / '),
      Number(f.base),
      f.iva_exempt ? 0 : Number(f.iva_rate),
      Number(f.iva_amount),
      f.iva_exempt ? 'Sí' : 'No',
      Number(f.irpf_rate),
      Number(f.irpf_amount),
      Number(f.total),
      STATUS_LABEL[f.status],
      shortEs(f.paid_date),
    ]),
  ])
}

export function libroGastos(gs: Expense[]) {
  return toCsv([
    ['Fecha', 'Proveedor', 'NIF proveedor', 'Concepto', 'Categoría', 'Base imponible', 'Tipo IVA', 'Cuota IVA', 'IVA deducible', 'Total'],
    ...gs.map((g) => [
      shortEs(g.date),
      g.supplier,
      g.supplier_nif ?? '',
      g.concept,
      EXPENSE_CATEGORY_LABEL[g.category] ?? g.category,
      Number(g.base),
      Number(g.iva_rate),
      Number(g.iva_amount),
      g.iva_deductible ? 'Sí' : 'No',
      Number(g.total),
    ]),
  ])
}
