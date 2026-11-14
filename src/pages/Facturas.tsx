import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  BadgeCheck,
  Building2,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  Plus,
  Printer,
  Receipt,
  Settings2,
  Trash2,
  Wallet,
} from 'lucide-react'
import {
  Badge,
  Button,
  Card,
  Checkbox,
  cx,
  EmptyState,
  ErrorNote,
  Field,
  IconButton,
  Input,
  Modal,
  Segmented,
  Select,
  Spinner,
  Textarea,
  useConfirm,
  useToast,
} from '@/components/ui'
import PerfilFiscal from '@/components/PerfilFiscal'
import { Impresion } from '@/components/FacturaHoja'
import { useCollection } from '@/hooks/useCollection'
import { useFiscalProfile } from '@/hooks/useFiscalProfile'
import { friendlyError } from '@/lib/supabase'
import { today } from '@/lib/dates'
import {
  computeTotals,
  countable,
  download,
  eur,
  EXPENSE_CATEGORY_LABEL,
  expenseCost,
  IVA_RATES,
  libroGastos,
  libroIngresos,
  modelo130,
  modelo303,
  PRIVADO,
  QUARTER_MONTHS,
  quarterDeadline,
  quarterOf,
  round2,
  shortEs,
  STATUS_LABEL,
  STATUS_TONE,
  yearOf,
  type Client,
  type Expense,
  type ExpenseCategory,
  type Invoice,
  type Quarter,
} from '@/lib/facturas'

type Pestana = 'facturas' | 'gastos' | 'trimestre' | 'clientes'
const QS: Quarter[] = [1, 2, 3, 4]

export default function Facturas() {
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as Pestana) || 'facturas'
  const year = Number(params.get('year')) || new Date().getFullYear()
  const q = (Number(params.get('q')) || quarterOf(today())) as Quarter

  const setParam = (k: string, v: string) =>
    setParams(
      (p) => {
        p.set(k, v)
        return p
      },
      { replace: true },
    )

  const invoices = useCollection<Invoice>('invoices', { shape: (x) => x.order('issue_date', { ascending: false }) })
  const expenses = useCollection<Expense>('expenses', { shape: (x) => x.order('date', { ascending: false }) })
  const clients = useCollection<Client>('clients', { shape: (x) => x.order('name') })
  const fiscal = useFiscalProfile()
  const [perfilOpen, setPerfilOpen] = useState(false)

  const loading = invoices.loading || expenses.loading || clients.loading || fiscal.loading
  const error = invoices.error || expenses.error || clients.error || fiscal.error

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl leading-tight tracking-tight sm:text-4xl">Facturas</h1>
          <p className="mt-1 text-[13px] text-ink-3">
            Tus ingresos y gastos de autónomo, y lo que toca presentar cada trimestre.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-2xl border border-line bg-surface-2 p-0.5">
            <IconButton label="Año anterior" onClick={() => setParam('year', String(year - 1))}>
              <ChevronLeft className="size-4" />
            </IconButton>
            <span className="tnum px-1 text-sm font-bold">{year}</span>
            <IconButton label="Año siguiente" onClick={() => setParam('year', String(year + 1))}>
              <ChevronRight className="size-4" />
            </IconButton>
          </div>
          <Button icon={<Settings2 className="size-4" />} onClick={() => setPerfilOpen(true)}>
            Mis datos
          </Button>
          <Link to="/facturas/nueva">
            <Button variant="primary" icon={<Plus className="size-4" />}>
              Nueva factura
            </Button>
          </Link>
        </div>
      </div>

      <Segmented
        className="mb-6 max-w-full"
        value={tab}
        onChange={(v) => setParam('tab', v)}
        options={[
          { value: 'facturas', label: 'Facturas' },
          { value: 'gastos', label: 'Gastos' },
          { value: 'trimestre', label: 'Trimestre' },
          { value: 'clientes', label: 'Clientes' },
        ]}
      />

      {error ? (
        <ErrorNote>
          {error}
          {/relation|does not exist|schema cache/i.test(error) && (
            <> — Falta ejecutar <code>supabase/migration-v13.sql</code> en el SQL Editor de Supabase.</>
          )}
        </ErrorNote>
      ) : loading ? (
        <Spinner label="Cargando facturas…" />
      ) : (
        <>
          {!fiscal.profile && (
            <Card className="mb-5 flex flex-wrap items-center justify-between gap-3 border border-warn/30 p-4">
              <p className="text-sm text-ink-2">
                Primero, tus datos de emisor (NIF, dirección, IBAN). Se rellenan una vez.
              </p>
              <Button size="sm" variant="soft" onClick={() => setPerfilOpen(true)}>
                Rellenar mis datos
              </Button>
            </Card>
          )}
          {tab === 'facturas' && (
            <TabFacturas invoices={invoices} clients={clients} year={year} hasProfile={!!fiscal.profile} profile={fiscal} />
          )}
          {tab === 'gastos' && <TabGastos expenses={expenses} year={year} />}
          {tab === 'trimestre' && (
            <TabTrimestre
              invoices={invoices.rows}
              expenses={expenses.rows}
              year={year}
              q={q}
              setQ={(n) => setParam('q', String(n))}
              nif={fiscal.profile?.nif ?? ''}
              nombre={fiscal.profile?.name ?? ''}
            />
          )}
          {tab === 'clientes' && <TabClientes clients={clients} invoices={invoices.rows} />}
        </>
      )}

      <PerfilFiscal
        open={perfilOpen}
        onClose={() => setPerfilOpen(false)}
        profile={fiscal.profile}
        onSave={fiscal.save}
      />
    </div>
  )
}

/* ========================================================================== */
/*  Facturas                                                                   */
/* ========================================================================== */

function Kpi({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: string }) {
  return (
    <Card className="p-4">
      <p className="text-[11px] font-bold tracking-wide text-ink-3 uppercase">{label}</p>
      <p className={cx('tnum mt-1.5 font-display text-2xl font-bold', tone)}>{value}</p>
      {hint && <p className="mt-0.5 text-[12px] text-ink-3">{hint}</p>}
    </Card>
  )
}

function TabFacturas({
  invoices,
  clients,
  year,
  hasProfile,
  profile,
}: {
  invoices: ReturnType<typeof useCollection<Invoice>>
  clients: ReturnType<typeof useCollection<Client>>
  year: number
  hasProfile: boolean
  profile: ReturnType<typeof useFiscalProfile>
}) {
  const toast = useToast()
  const navegar = useNavigate()
  const [importing, setImporting] = useState(false)

  const delAño = useMemo(() => invoices.rows.filter((i) => yearOf(i.issue_date) === year), [invoices.rows, year])
  const cuentan = delAño.filter(countable)
  const facturado = round2(cuentan.reduce((s, i) => s + Number(i.base), 0))
  const pendientes = cuentan.filter((i) => i.status === 'emitida')
  const pendiente = round2(pendientes.reduce((s, i) => s + Number(i.total), 0))
  const retenido = round2(cuentan.reduce((s, i) => s + Number(i.irpf_amount), 0))
  const hoy = today()

  async function marcarCobrada(i: Invoice) {
    try {
      await invoices.update(i.id, { status: 'cobrada', paid_date: today() })
      toast.success(`Factura ${i.number} cobrada`)
    } catch (e) {
      toast.error(friendlyError(e))
    }
  }

  /** Mete de golpe lo que haya en privado.local.ts (tu primera factura). */
  async function importar() {
    setImporting(true)
    try {
      if (!hasProfile && PRIVADO.perfil) await profile.save(PRIVADO.perfil)
      const perfil = profile.profile ?? (PRIVADO.perfil as never)
      for (const c of PRIVADO.clientes ?? []) {
        if (!clients.rows.some((x) => x.name === c.name)) await clients.insert(c)
      }
      for (const f of PRIVADO.facturas ?? []) {
        if (invoices.rows.some((x) => x.number === f.number)) continue
        const lines = f.lines ?? []
        const t = computeTotals(lines, Number(f.iva_rate ?? 0), !!f.iva_exempt, Number(f.irpf_rate ?? 0))
        const cliente = PRIVADO.clientes?.find((c) => c.name === f.client_name)
        await invoices.insert({
          ...f,
          client_nif: f.client_nif ?? cliente?.nif ?? null,
          client_address: f.client_address ?? cliente?.address ?? null,
          issuer: {
            name: perfil?.name,
            tagline: perfil?.tagline,
            nif: perfil?.nif,
            address: perfil?.address,
            email: perfil?.email,
            phone: perfil?.phone,
            iban: perfil?.iban,
          },
          iva_note: f.iva_note ?? perfil?.iva_note ?? null,
          irpf_note: f.irpf_note ?? perfil?.irpf_note ?? null,
          base: t.base,
          iva_amount: t.iva,
          irpf_amount: t.irpf,
          total: t.total,
        })
      }
      await Promise.all([invoices.reload(), clients.reload(), profile.reload()])
      toast.success('Importado')
    } catch (e) {
      toast.error(friendlyError(e))
    } finally {
      setImporting(false)
    }
  }

  const porTrimestre = QS.map((q) => ({ q, rows: delAño.filter((i) => quarterOf(i.issue_date) === q) }))
    .filter((g) => g.rows.length)
    .reverse()

  return (
    <div>
      <div className="stagger mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label={`Facturado ${year}`} value={eur(facturado)} hint="Base imponible" />
        <Kpi
          label="Pendiente de cobro"
          value={eur(pendiente)}
          hint={`${pendientes.length} factura${pendientes.length === 1 ? '' : 's'}`}
          tone={pendiente > 0 ? 'text-warn' : undefined}
        />
        <Kpi label="Retenciones IRPF" value={eur(retenido)} hint="Ya adelantado a Hacienda" />
        <Kpi label="Facturas" value={String(cuentan.length)} hint={`emitidas en ${year}`} />
      </div>

      {invoices.rows.length === 0 ? (
        <EmptyState
          icon={<Receipt className="size-7" />}
          title="Aún no hay facturas"
          description="Crea la primera: se numera sola (2026-001, 2026-002…) y sale lista para imprimir o guardar en PDF."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              {(PRIVADO.facturas?.length ?? 0) > 0 && (
                <Button loading={importing} onClick={importar} icon={<Download className="size-4" />}>
                  Importar mi primera factura
                </Button>
              )}
              <Link to="/facturas/nueva">
                <Button variant="primary" icon={<Plus className="size-4" />}>
                  Nueva factura
                </Button>
              </Link>
            </div>
          }
        />
      ) : porTrimestre.length === 0 ? (
        <EmptyState icon={<Receipt className="size-7" />} title={`Sin facturas en ${year}`} />
      ) : (
        <div className="space-y-6">
          {porTrimestre.map(({ q, rows }) => (
            <section key={q}>
              <div className="mb-2 flex items-baseline justify-between px-1">
                <h3 className="text-lg">
                  {q}T <span className="text-sm font-medium text-ink-3">· {QUARTER_MONTHS[q]}</span>
                </h3>
                <span className="tnum text-sm text-ink-3">
                  {eur(rows.filter(countable).reduce((s, i) => s + Number(i.base), 0))} base
                </span>
              </div>
              <Card className="divide-y divide-line overflow-hidden">
                {rows.map((i) => {
                  const vencida = i.status === 'emitida' && i.due_date && i.due_date < hoy
                  return (
                    <div
                      key={i.id}
                      role="link"
                      tabIndex={0}
                      onClick={() => navegar(`/facturas/${i.id}`)}
                      onKeyDown={(e) => e.key === 'Enter' && navegar(`/facturas/${i.id}`)}
                      className="flex cursor-pointer items-center gap-3 px-4 py-3.5 transition-colors hover:bg-surface-2"
                    >
                      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
                        <FileText className="size-[18px]" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold">
                          {i.client_name}
                          <span className="ml-2 font-medium text-ink-3">{i.number}</span>
                        </p>
                        <p className="truncate text-[12px] text-ink-3">
                          {shortEs(i.issue_date)} · {i.lines.map((l) => l.concept).join(', ')}
                        </p>
                      </div>
                      <div className="hidden sm:block">
                        <Badge tone={vencida ? 'bad' : STATUS_TONE[i.status]}>
                          {vencida ? 'Vencida' : STATUS_LABEL[i.status]}
                        </Badge>
                      </div>
                      <span className="tnum w-24 text-right text-sm font-bold">{eur(i.total)}</span>
                      {i.status === 'emitida' ? (
                        <IconButton
                          label="Marcar cobrada"
                          onClick={(e) => {
                            e.stopPropagation()
                            void marcarCobrada(i)
                          }}
                        >
                          <BadgeCheck className="size-[18px]" />
                        </IconButton>
                      ) : (
                        <span className="w-9" />
                      )}
                    </div>
                  )
                })}
              </Card>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}

/* ========================================================================== */
/*  Gastos                                                                     */
/* ========================================================================== */

type GastoForm = {
  date: string
  supplier: string
  supplier_nif: string
  concept: string
  category: ExpenseCategory
  base: number
  iva_rate: number
  iva_deductible: boolean
  notes: string
}

const gastoVacio = (): GastoForm => ({
  date: today(),
  supplier: '',
  supplier_nif: '',
  concept: '',
  category: 'software',
  base: 0,
  iva_rate: 21,
  iva_deductible: true,
  notes: '',
})

function TabGastos({ expenses, year }: { expenses: ReturnType<typeof useCollection<Expense>>; year: number }) {
  const toast = useToast()
  const confirm = useConfirm()
  const [editing, setEditing] = useState<Expense | 'new' | null>(null)
  const [f, setF] = useState<GastoForm>(gastoVacio())
  const [saving, setSaving] = useState(false)
  /** Escribir el total con IVA y que calcule la base. */
  const [conIva, setConIva] = useState('')

  const delAño = expenses.rows.filter((e) => yearOf(e.date) === year)
  const total = round2(delAño.reduce((s, e) => s + expenseCost(e), 0))
  const ivaSop = round2(delAño.filter((e) => e.iva_deductible).reduce((s, e) => s + Number(e.iva_amount), 0))

  function abrir(e: Expense | 'new') {
    setEditing(e)
    setConIva('')
    if (e === 'new') setF(gastoVacio())
    else
      setF({
        date: e.date,
        supplier: e.supplier,
        supplier_nif: e.supplier_nif ?? '',
        concept: e.concept,
        category: e.category,
        base: Number(e.base),
        iva_rate: Number(e.iva_rate),
        iva_deductible: e.iva_deductible,
        notes: e.notes ?? '',
      })
  }

  const ivaAmount = round2((f.base * f.iva_rate) / 100)

  async function guardar() {
    if (!f.concept.trim() && !f.supplier.trim()) return toast.error('¿Qué gasto es?')
    setSaving(true)
    const values = {
      ...f,
      supplier_nif: f.supplier_nif || null,
      notes: f.notes || null,
      iva_amount: ivaAmount,
      total: round2(f.base + ivaAmount),
    }
    try {
      if (editing === 'new') await expenses.insert(values)
      else if (editing) await expenses.update(editing.id, values)
      toast.success('Gasto guardado')
      setEditing(null)
    } catch (e) {
      toast.error(friendlyError(e))
    } finally {
      setSaving(false)
    }
  }

  async function borrar() {
    if (!editing || editing === 'new') return
    if (!(await confirm({ title: '¿Borrar el gasto?', confirmLabel: 'Borrar', danger: true }))) return
    try {
      await expenses.remove(editing.id)
      setEditing(null)
    } catch (e) {
      toast.error(friendlyError(e))
    }
  }

  return (
    <div>
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label={`Gastos ${year}`} value={eur(total)} hint="Deducibles en el IRPF" />
        <Kpi label="IVA soportado" value={eur(ivaSop)} hint="Deducible en el 303" />
        <div className="col-span-2 flex items-center justify-end">
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => abrir('new')}>
            Añadir gasto
          </Button>
        </div>
      </div>

      {delAño.length === 0 ? (
        <EmptyState
          icon={<Wallet className="size-7" />}
          title={`Sin gastos en ${year}`}
          description="Apunta la cuota de autónomos, el software, la gestoría… Restan en el modelo 130 y su IVA se deduce en el 303 (si facturas con IVA)."
        />
      ) : (
        <Card className="divide-y divide-line overflow-hidden">
          {delAño.map((e) => (
            <button
              key={e.id}
              onClick={() => abrir(e)}
              className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-surface-2"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">{e.concept || e.supplier}</p>
                <p className="truncate text-[12px] text-ink-3">
                  {shortEs(e.date)} · {e.supplier || '—'} · {EXPENSE_CATEGORY_LABEL[e.category] ?? e.category}
                </p>
              </div>
              <span className="hidden text-[12px] text-ink-3 sm:block">
                {Number(e.iva_amount) > 0 ? `IVA ${eur(e.iva_amount)}` : 'Sin IVA'}
              </span>
              <span className="tnum w-24 text-right text-sm font-bold">{eur(e.total)}</span>
            </button>
          ))}
        </Card>
      )}

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'Nuevo gasto' : 'Editar gasto'}
        footer={
          <>
            {editing !== 'new' && (
              <Button variant="ghost" className="mr-auto" icon={<Trash2 className="size-4" />} onClick={borrar}>
                Borrar
              </Button>
            )}
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancelar
            </Button>
            <Button variant="primary" loading={saving} onClick={guardar}>
              Guardar
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Fecha">
            <Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
          </Field>
          <Field label="Categoría">
            <Select
              value={f.category}
              onChange={(e) => {
                const c = e.target.value as ExpenseCategory
                // La cuota de autónomos no lleva IVA.
                setF({ ...f, category: c, ...(c === 'cuota' ? { iva_rate: 0 } : {}) })
              }}
            >
              {(Object.keys(EXPENSE_CATEGORY_LABEL) as ExpenseCategory[]).map((c) => (
                <option key={c} value={c}>
                  {EXPENSE_CATEGORY_LABEL[c]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Concepto" className="sm:col-span-2">
            <Input
              value={f.concept}
              placeholder="Licencia Microsoft 365, cuota RETA noviembre…"
              onChange={(e) => setF({ ...f, concept: e.target.value })}
            />
          </Field>
          <Field label="Proveedor">
            <Input value={f.supplier} onChange={(e) => setF({ ...f, supplier: e.target.value })} />
          </Field>
          <Field label="NIF proveedor">
            <Input value={f.supplier_nif} onChange={(e) => setF({ ...f, supplier_nif: e.target.value.toUpperCase() })} />
          </Field>
          <Field label="Base imponible (€)">
            <Input
              type="number"
              step="0.01"
              value={f.base}
              onChange={(e) => {
                setConIva('')
                setF({ ...f, base: Number(e.target.value) })
              }}
            />
          </Field>
          <Field label="IVA">
            <Select value={String(f.iva_rate)} onChange={(e) => setF({ ...f, iva_rate: Number(e.target.value) })}>
              {IVA_RATES.map((r) => (
                <option key={r} value={r}>
                  {r ? `${r} %` : 'Sin IVA'}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="…o el total con IVA (€)" hint="Calcula la base sola">
            <Input
              type="number"
              step="0.01"
              value={conIva}
              onChange={(e) => {
                setConIva(e.target.value)
                const t = Number(e.target.value)
                setF({ ...f, base: round2(t / (1 + f.iva_rate / 100)) })
              }}
            />
          </Field>
          <div className="tnum flex flex-col justify-end rounded-2xl bg-surface-2 p-3 text-sm">
            <span className="text-ink-3">IVA {eur(ivaAmount)}</span>
            <span className="font-bold">Total {eur(f.base + ivaAmount)}</span>
          </div>
          {f.iva_rate > 0 && (
            <div className="sm:col-span-2">
              <Checkbox
                checked={f.iva_deductible}
                onChange={(x) => setF({ ...f, iva_deductible: x })}
                label="Puedo deducirme este IVA (solo si facturo con IVA)"
              />
            </div>
          )}
          <Field label="Notas" className="sm:col-span-2">
            <Textarea rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
          </Field>
        </div>
      </Modal>
    </div>
  )
}

/* ========================================================================== */
/*  Trimestre: modelos 303 y 130                                               */
/* ========================================================================== */

function Casilla({ n, label, value, strong }: { n?: string; label: string; value: number; strong?: boolean }) {
  return (
    <div className={cx('flex items-center gap-3 py-2', strong && 'border-t border-line pt-3')}>
      {n !== undefined && (
        <span className="tnum grid h-6 min-w-9 place-items-center rounded-lg bg-surface-2 px-1.5 text-[11px] font-bold text-ink-2">
          {n}
        </span>
      )}
      <span className={cx('flex-1 text-sm', strong ? 'font-bold' : 'text-ink-2')}>{label}</span>
      <span className={cx('tnum text-sm', strong && 'text-base font-bold')}>{eur(value)}</span>
    </div>
  )
}

function TabTrimestre({
  invoices,
  expenses,
  year,
  q,
  setQ,
  nif,
  nombre,
}: {
  invoices: Invoice[]
  expenses: Expense[]
  year: number
  q: Quarter
  setQ: (q: Quarter) => void
  nif: string
  nombre: string
}) {
  const [printing, setPrinting] = useState(false)
  const m303 = useMemo(() => modelo303(invoices, expenses, year, q), [invoices, expenses, year, q])
  const m130 = useMemo(() => modelo130(invoices, expenses, year, q), [invoices, expenses, year, q])

  const soloExentas = m303.devengado.length === 0
  const exento130 = m130.pctConRetencion >= 70
  const tag = `${year}-${q}T`

  const resumen = (
    <ResumenTrimestre
      year={year}
      q={q}
      m303={m303}
      m130={m130}
      nif={nif}
      nombre={nombre}
      soloExentas={soloExentas}
      exento130={exento130}
    />
  )

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Segmented
          value={String(q)}
          onChange={(v) => setQ(Number(v) as Quarter)}
          options={QS.map((n) => ({ value: String(n), label: `${n}T` }))}
        />
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            icon={<Download className="size-4" />}
            onClick={() => download(`Ingresos ${tag}.csv`, libroIngresos(m303.facturas))}
          >
            Ingresos CSV
          </Button>
          <Button
            size="sm"
            icon={<Download className="size-4" />}
            onClick={() => download(`Gastos ${tag}.csv`, libroGastos(m303.gastos))}
          >
            Gastos CSV
          </Button>
          <Button size="sm" variant="primary" icon={<Printer className="size-4" />} onClick={() => setPrinting(true)}>
            Imprimir / PDF
          </Button>
        </div>
      </div>

      <Card className="mb-5 p-5">
        <p className="text-sm text-ink-2">
          <b className="text-ink">
            {q}T {year}
          </b>{' '}
          · {QUARTER_MONTHS[q]} · {m303.facturas.length} factura{m303.facturas.length === 1 ? '' : 's'} y{' '}
          {m303.gastos.length} gasto{m303.gastos.length === 1 ? '' : 's'}. Plazo para presentar:{' '}
          <b className="text-ink">hasta el {quarterDeadline(year, q)}</b>.
        </p>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* 303 */}
        <Card className="p-5">
          <div className="mb-3 flex items-baseline justify-between">
            <h3 className="text-xl">Modelo 303 · IVA</h3>
            <span className="text-[12px] text-ink-3">Trimestral</span>
          </div>
          <p className="mb-1 text-[11px] font-bold tracking-wide text-ink-3 uppercase">IVA devengado</p>
          {m303.devengado.length === 0 && <p className="py-2 text-sm text-ink-3">Ninguna factura con IVA.</p>}
          {m303.devengado.map((d) => (
            <div key={d.rate}>
              <Casilla n={d.casillas.split(' · ')[0]} label={`Base al ${d.rate} %`} value={d.base} />
              <Casilla n={d.casillas.split(' · ')[2]} label={`Cuota al ${d.rate} %`} value={d.cuota} />
            </div>
          ))}
          <Casilla n="27" label="Total cuota devengada" value={m303.totalDevengado} />
          <p className="mt-3 mb-1 text-[11px] font-bold tracking-wide text-ink-3 uppercase">IVA deducible</p>
          <Casilla n="28" label="Base operaciones interiores corrientes" value={m303.soportadoBase} />
          <Casilla n="29" label="Cuota soportada deducible" value={m303.soportadoCuota} />
          <Casilla n="46" label="Resultado" value={m303.resultado} strong />
          {m303.exentas > 0 && (
            <p className="mt-3 rounded-2xl bg-surface-2 p-3 text-[13px] text-ink-2">
              Operaciones exentas (formación, art. 20.Uno.9º): <b>{eur(m303.exentas)}</b>. Se informan en
              el 303 como operaciones exentas sin derecho a deducción, pero no generan cuota.
            </p>
          )}
          {soloExentas && (
            <p className="mt-3 rounded-2xl border border-good/25 bg-good/10 p-3 text-[13px] text-ink-2">
              Este trimestre solo tienes operaciones exentas. Si toda tu actividad es exenta de IVA, por lo
              general no tienes que presentar el 303; si también facturas consultoría con IVA, sí (aunque
              salga a cero).
            </p>
          )}
        </Card>

        {/* 130 */}
        <Card className="p-5">
          <div className="mb-3 flex items-baseline justify-between">
            <h3 className="text-xl">Modelo 130 · IRPF</h3>
            <span className="text-[12px] text-ink-3">Acumulado desde el 1 de enero</span>
          </div>
          <Casilla n="01" label="Ingresos computables" value={m130.c01} />
          <Casilla n="02" label="Gastos fiscalmente deducibles" value={m130.c02} />
          <Casilla n="03" label="Rendimiento neto" value={m130.c03} />
          <Casilla n="04" label="20 % del rendimiento" value={m130.c04} />
          <Casilla n="05" label="Pagos fraccionados de trimestres anteriores" value={m130.c05} />
          <Casilla n="06" label="Retenciones soportadas" value={m130.c06} />
          <Casilla
            n="07"
            label={m130.c07 < 0 ? 'Resultado (negativo: 0 € a ingresar)' : 'Resultado a ingresar'}
            value={m130.c07}
            strong
          />
          <p
            className={cx(
              'mt-3 rounded-2xl p-3 text-[13px] text-ink-2',
              exento130 ? 'border border-good/25 bg-good/10' : 'bg-surface-2',
            )}
          >
            El {m130.pctConRetencion} % de tus ingresos de {year} lleva retención.{' '}
            {exento130
              ? 'Si en el año anterior al menos el 70 % de tus ingresos de la actividad tuvo retención, no estás obligado a presentar el 130 (tus clientes ya adelantan el IRPF por ti). El primer año se mira el propio año.'
              : 'Por debajo del 70 % tienes que presentar el 130 cada trimestre.'}
          </p>
        </Card>
      </div>

      <p className="mt-5 text-[12px] leading-relaxed text-ink-3">
        Cálculo orientativo con las facturas emitidas (los borradores no cuentan) por fecha de emisión y los
        gastos apuntados. Los números de casilla siguen los modelos actuales de la AEAT; revisa el borrador
        en la Sede Electrónica (o con tu gestor) antes de presentar.
      </p>

      {printing && (
        <Impresion title={`Resumen trimestral ${tag}`} onDone={() => setPrinting(false)}>
          {resumen}
        </Impresion>
      )}
    </div>
  )
}

/** Hoja A4 imprimible con el resumen del trimestre y el detalle de facturas y gastos. */
function ResumenTrimestre({
  year,
  q,
  m303,
  m130,
  nif,
  nombre,
  soloExentas,
  exento130,
}: {
  year: number
  q: Quarter
  m303: ReturnType<typeof modelo303>
  m130: ReturnType<typeof modelo130>
  nif: string
  nombre: string
  soloExentas: boolean
  exento130: boolean
}) {
  const th: React.CSSProperties = { textAlign: 'left', padding: '6px 6px', borderBottom: '1.5px solid #1f2a38', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#6f7682' }
  const td: React.CSSProperties = { padding: '6px 6px', borderBottom: '1px solid #e4e0da', fontSize: 11.5 }
  const r = (x: React.CSSProperties) => ({ ...x, textAlign: 'right' as const })
  const fila = (n: string, k: string, v: number, bold = false) => (
    <tr key={n + k}>
      <td style={{ ...td, width: 50, color: '#6f7682' }}>{n}</td>
      <td style={{ ...td, fontWeight: bold ? 700 : 400 }}>{k}</td>
      <td style={{ ...r(td), fontWeight: bold ? 700 : 400 }}>{eur(v)}</td>
    </tr>
  )

  return (
    <div
      style={{
        width: 794,
        minHeight: 1123,
        padding: '56px 60px',
        boxSizing: 'border-box',
        background: '#fff',
        color: '#1f2a38',
        fontFamily: "'Manrope Variable', ui-sans-serif, sans-serif",
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      <div style={{ fontFamily: "'Fraunces Variable', Georgia, serif", fontSize: 30, fontWeight: 600 }}>
        Resumen trimestral · {q}T {year}
      </div>
      <div style={{ marginTop: 6, fontSize: 12.5, color: '#4a5361' }}>
        {nombre} · NIF {nif} · {QUARTER_MONTHS[q]} · Plazo: hasta el {quarterDeadline(year, q)}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 28, marginTop: 30 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>Modelo 303 · IVA</div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              {m303.devengado.flatMap((d) => {
                const [b, , c] = d.casillas.split(' · ')
                return [fila(b ?? '', `Base al ${d.rate} %`, d.base), fila(c ?? '', `Cuota al ${d.rate} %`, d.cuota)]
              })}
              {fila('27', 'Total cuota devengada', m303.totalDevengado)}
              {fila('28', 'Base IVA soportado', m303.soportadoBase)}
              {fila('29', 'Cuota soportada deducible', m303.soportadoCuota)}
              {fila('46', 'Resultado', m303.resultado, true)}
              {fila('', 'Operaciones exentas', m303.exentas)}
            </tbody>
          </table>
          {soloExentas && (
            <p style={{ fontSize: 10.5, color: '#4a5361', marginTop: 8 }}>
              Solo operaciones exentas: normalmente sin obligación de presentar el 303.
            </p>
          )}
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>Modelo 130 · IRPF (acumulado)</div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              {fila('01', 'Ingresos computables', m130.c01)}
              {fila('02', 'Gastos deducibles', m130.c02)}
              {fila('03', 'Rendimiento neto', m130.c03)}
              {fila('04', '20 % del rendimiento', m130.c04)}
              {fila('05', 'Pagos trimestres anteriores', m130.c05)}
              {fila('06', 'Retenciones soportadas', m130.c06)}
              {fila('07', 'Resultado', m130.c07, true)}
            </tbody>
          </table>
          <p style={{ fontSize: 10.5, color: '#4a5361', marginTop: 8 }}>
            {m130.pctConRetencion} % de los ingresos con retención.
            {exento130 && ' Con ≥ 70 % no hay obligación de presentar el 130.'}
          </p>
        </div>
      </div>

      <div style={{ fontWeight: 700, fontSize: 14, margin: '34px 0 6px' }}>Facturas emitidas</div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={th}>Nº</th>
            <th style={th}>Fecha</th>
            <th style={th}>Cliente</th>
            <th style={r(th)}>Base</th>
            <th style={r(th)}>IVA</th>
            <th style={r(th)}>IRPF</th>
            <th style={r(th)}>Total</th>
          </tr>
        </thead>
        <tbody>
          {m303.facturas.map((f) => (
            <tr key={f.id}>
              <td style={td}>{f.number}</td>
              <td style={td}>{shortEs(f.issue_date)}</td>
              <td style={td}>
                {f.client_name}
                {f.client_nif ? ` · ${f.client_nif}` : ''}
              </td>
              <td style={r(td)}>{eur(f.base)}</td>
              <td style={r(td)}>{f.iva_exempt ? 'Exenta' : eur(f.iva_amount)}</td>
              <td style={r(td)}>{eur(f.irpf_amount)}</td>
              <td style={r(td)}>{eur(f.total)}</td>
            </tr>
          ))}
          {m303.facturas.length === 0 && (
            <tr>
              <td style={td} colSpan={7}>
                Sin facturas.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <div style={{ fontWeight: 700, fontSize: 14, margin: '28px 0 6px' }}>Gastos</div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={th}>Fecha</th>
            <th style={th}>Proveedor</th>
            <th style={th}>Concepto</th>
            <th style={r(th)}>Base</th>
            <th style={r(th)}>IVA</th>
            <th style={r(th)}>Total</th>
          </tr>
        </thead>
        <tbody>
          {m303.gastos.map((g) => (
            <tr key={g.id}>
              <td style={td}>{shortEs(g.date)}</td>
              <td style={td}>{g.supplier}</td>
              <td style={td}>{g.concept}</td>
              <td style={r(td)}>{eur(g.base)}</td>
              <td style={r(td)}>{eur(g.iva_amount)}</td>
              <td style={r(td)}>{eur(g.total)}</td>
            </tr>
          ))}
          {m303.gastos.length === 0 && (
            <tr>
              <td style={td} colSpan={6}>
                Sin gastos.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <p style={{ marginTop: 28, fontSize: 10, color: '#6f7682' }}>
        Cálculo orientativo generado con MyOS. Revísalo en la Sede Electrónica de la AEAT antes de presentar.
      </p>
    </div>
  )
}

/* ========================================================================== */
/*  Clientes                                                                   */
/* ========================================================================== */

function TabClientes({
  clients,
  invoices,
}: {
  clients: ReturnType<typeof useCollection<Client>>
  invoices: Invoice[]
}) {
  const toast = useToast()
  const confirm = useConfirm()
  const [editing, setEditing] = useState<Client | 'new' | null>(null)
  const [f, setF] = useState({ name: '', nif: '', address: '', email: '', notes: '' })
  const [saving, setSaving] = useState(false)

  function abrir(c: Client | 'new') {
    setEditing(c)
    setF(
      c === 'new'
        ? { name: '', nif: '', address: '', email: '', notes: '' }
        : { name: c.name, nif: c.nif ?? '', address: c.address ?? '', email: c.email ?? '', notes: c.notes ?? '' },
    )
  }

  async function guardar() {
    if (!f.name.trim()) return toast.error('Falta el nombre')
    setSaving(true)
    const v = {
      name: f.name.trim(),
      nif: f.nif || null,
      address: f.address || null,
      email: f.email || null,
      notes: f.notes || null,
    }
    try {
      if (editing === 'new') await clients.insert(v)
      else if (editing) await clients.update(editing.id, v)
      setEditing(null)
      toast.success('Cliente guardado')
    } catch (e) {
      toast.error(friendlyError(e))
    } finally {
      setSaving(false)
    }
  }

  async function borrar() {
    if (!editing || editing === 'new') return
    const ok = await confirm({
      title: `¿Borrar ${editing.name}?`,
      message: 'Sus facturas no se tocan: guardan sus propios datos del cliente.',
      confirmLabel: 'Borrar',
      danger: true,
    })
    if (!ok) return
    try {
      await clients.remove(editing.id)
      setEditing(null)
    } catch (e) {
      toast.error(friendlyError(e))
    }
  }

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => abrir('new')}>
          Nuevo cliente
        </Button>
      </div>
      {clients.rows.length === 0 ? (
        <EmptyState
          icon={<Building2 className="size-7" />}
          title="Sin clientes"
          description="Se guardan solos al hacer una factura a alguien nuevo."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {clients.rows.map((c) => {
            const suyas = invoices.filter((i) => i.client_id === c.id && countable(i))
            const total = suyas.reduce((s, i) => s + Number(i.base), 0)
            return (
              <button key={c.id} onClick={() => abrir(c)} className="text-left">
                <Card className="card-hover h-full p-4">
                  <p className="font-bold">{c.name}</p>
                  <p className="text-[12px] text-ink-3">{c.nif ?? 'Sin NIF'}</p>
                  <p className="tnum mt-3 text-sm text-ink-2">
                    {suyas.length} factura{suyas.length === 1 ? '' : 's'} · {eur(total)}
                  </p>
                </Card>
              </button>
            )
          })}
        </div>
      )}

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'Nuevo cliente' : 'Editar cliente'}
        footer={
          <>
            {editing !== 'new' && (
              <Button variant="ghost" className="mr-auto" icon={<Trash2 className="size-4" />} onClick={borrar}>
                Borrar
              </Button>
            )}
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancelar
            </Button>
            <Button variant="primary" loading={saving} onClick={guardar}>
              Guardar
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Razón social" className="sm:col-span-2">
            <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          </Field>
          <Field label="NIF / CIF">
            <Input value={f.nif} onChange={(e) => setF({ ...f, nif: e.target.value.toUpperCase() })} />
          </Field>
          <Field label="Email">
            <Input value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
          </Field>
          <Field label="Dirección" hint="Una línea por renglón" className="sm:col-span-2">
            <Textarea rows={3} value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} />
          </Field>
          <Field label="Notas" className="sm:col-span-2">
            <Textarea rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
          </Field>
        </div>
      </Modal>
    </div>
  )
}
