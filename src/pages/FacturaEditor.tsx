import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft,
  BadgeCheck,
  Copy,
  Plus,
  Printer,
  Save,
  Settings2,
  Trash2,
  X,
} from 'lucide-react'
import {
  Badge,
  Button,
  Card,
  ErrorNote,
  Field,
  IconButton,
  Input,
  Select,
  Spinner,
  Textarea,
  useConfirm,
  useToast,
} from '@/components/ui'
import FacturaHoja, { HojaEscalada, Impresion, type HojaDatos } from '@/components/FacturaHoja'
import PerfilFiscal from '@/components/PerfilFiscal'
import AdjuntoPdf from '@/components/AdjuntoPdf'
import { useAuth } from '@/context/AuthContext'
import { uploadPdf } from '@/lib/facturasPdf'
import { useCollection } from '@/hooks/useCollection'
import { useFiscalProfile } from '@/hooks/useFiscalProfile'
import { friendlyError } from '@/lib/supabase'
import { today } from '@/lib/dates'
import {
  addDaysISO,
  computeTotals,
  emptyLine,
  eur,
  IRPF_RATES,
  IVA_RATES,
  lineAmount,
  nextNumber,
  STATUS_LABEL,
  STATUS_TONE,
  UNITS,
  yearOf,
  type Client,
  type Invoice,
  type InvoiceLine,
  type InvoiceStatus,
  type Issuer,
} from '@/lib/facturas'

interface Form extends HojaDatos {
  status: InvoiceStatus
  client_id: string | null
  paid_date: string | null
  notes: string | null
}

const issuerOf = (p: Partial<Issuer> | null | undefined): Partial<Issuer> => ({
  name: p?.name ?? '',
  tagline: p?.tagline ?? '',
  nif: p?.nif ?? '',
  address: p?.address ?? '',
  email: p?.email ?? '',
  phone: p?.phone ?? '',
  iban: p?.iban ?? '',
})

export default function FacturaEditor() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const navegar = useNavigate()
  const toast = useToast()
  const confirm = useConfirm()
  const esNueva = !id
  const { user } = useAuth()
  const [pdfPendiente, setPdfPendiente] = useState<File | null>(null)

  const invoices = useCollection<Invoice>('invoices', { shape: (q) => q.order('issue_date') })
  const clients = useCollection<Client>('clients', { shape: (q) => q.order('name') })
  const fiscal = useFiscalProfile()

  const [form, setForm] = useState<Form | null>(null)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [printing, setPrinting] = useState(false)
  const [perfilOpen, setPerfilOpen] = useState(false)
  const numeroManual = useRef(false)

  const actual = id ? invoices.rows.find((i) => i.id === id) : undefined

  // Montar el formulario una sola vez, cuando ya están los datos.
  useEffect(() => {
    if (form || invoices.loading || fiscal.loading) return
    if (actual) {
      setForm({
        ...actual,
        lines: actual.lines.length ? actual.lines : [emptyLine()],
        issuer: Object.keys(actual.issuer ?? {}).length ? actual.issuer : issuerOf(fiscal.profile),
        payment_days: fiscal.profile?.payment_days ?? 30,
        iva_rate: Number(actual.iva_rate),
        irpf_rate: Number(actual.irpf_rate),
      })
      return
    }
    if (!esNueva) return
    const p = fiscal.profile
    const hoy = today()
    const base: Form = {
      number: nextNumber(invoices.rows, yearOf(hoy)),
      status: 'emitida',
      issue_date: hoy,
      service_date: hoy,
      due_date: addDaysISO(hoy, p?.payment_days ?? 30),
      paid_date: null,
      client_id: null,
      client_name: '',
      client_nif: null,
      client_address: null,
      issuer: issuerOf(p),
      lines: [emptyLine()],
      iva_rate: Number(p?.iva_rate ?? 0),
      iva_exempt: p?.iva_exempt ?? true,
      iva_note: p?.iva_note ?? null,
      irpf_rate: Number(p?.irpf_rate ?? 7),
      irpf_note: p?.irpf_note ?? null,
      payment_days: p?.payment_days ?? 30,
      notes: null,
    }
    // ?duplicar=<id>: mismo cliente, conceptos e impuestos; fechas y número nuevos.
    const origen = invoices.rows.find((i) => i.id === params.get('duplicar'))
    if (origen) {
      Object.assign(base, {
        client_id: origen.client_id,
        client_name: origen.client_name,
        client_nif: origen.client_nif,
        client_address: origen.client_address,
        lines: origen.lines.map((l) => ({ ...l })),
        iva_rate: Number(origen.iva_rate),
        iva_exempt: origen.iva_exempt,
        iva_note: origen.iva_note,
        irpf_rate: Number(origen.irpf_rate),
        irpf_note: origen.irpf_note,
      })
    }
    setForm(base)
  }, [form, invoices.loading, invoices.rows, fiscal.loading, fiscal.profile, actual, esNueva, params])

  const totals = useMemo(
    () => (form ? computeTotals(form.lines, form.iva_rate, form.iva_exempt, form.irpf_rate) : null),
    [form],
  )

  if (invoices.loading || fiscal.loading || clients.loading) return <Spinner label="Abriendo factura…" />
  if (invoices.error) return <ErrorNote>{invoices.error}</ErrorNote>
  if (!esNueva && !actual) {
    return (
      <div>
        <Link to="/facturas">
          <Button variant="ghost" icon={<ArrowLeft className="size-4" />}>
            Volver a Facturas
          </Button>
        </Link>
        <ErrorNote>Esa factura ya no existe.</ErrorNote>
      </div>
    )
  }
  if (!form || !totals) return <Spinner />

  /* ------------------------------------------------------------ cambios -- */

  const patch = (p: Partial<Form>) => {
    setForm((f) => (f ? { ...f, ...p } : f))
    setDirty(true)
  }

  const setLine = (i: number, p: Partial<InvoiceLine>) =>
    patch({ lines: form.lines.map((l, k) => (k === i ? { ...l, ...p } : l)) })

  function cambiarFecha(iso: string) {
    const p: Partial<Form> = { issue_date: iso }
    if (iso) p.due_date = addDaysISO(iso, form!.payment_days)
    // En una factura nueva, si cambias de año, el número sigue la serie de ese año.
    if (esNueva && !numeroManual.current && iso && yearOf(iso) !== yearOf(form!.issue_date)) {
      p.number = nextNumber(invoices.rows, yearOf(iso))
    }
    patch(p)
  }

  function elegirCliente(cid: string) {
    const c = clients.rows.find((x) => x.id === cid)
    if (!c) return patch({ client_id: null })
    patch({ client_id: c.id, client_name: c.name, client_nif: c.nif, client_address: c.address })
  }

  /* ------------------------------------------------------------- guardar -- */

  async function guardar(): Promise<Invoice | null> {
    const f = form!
    if (!f.number.trim()) return toast.error('Falta el número de factura'), null
    if (!f.issue_date) return toast.error('Falta la fecha de emisión'), null
    if (!f.client_name.trim()) return toast.error('¿A quién le facturas?'), null
    const lines = f.lines.filter((l) => l.concept.trim() || Number(l.price))
    if (!lines.length) return toast.error('Añade al menos un concepto'), null

    setSaving(true)
    try {
      // Cliente nuevo escrito a mano: se guarda para la próxima vez.
      let clientId = f.client_id
      if (!clientId) {
        const existente = clients.rows.find(
          (c) => c.name.trim().toLowerCase() === f.client_name.trim().toLowerCase(),
        )
        clientId =
          existente?.id ??
          (
            await clients.insert({
              name: f.client_name.trim(),
              nif: f.client_nif || null,
              address: f.client_address || null,
            })
          ).id
      }
      const t = computeTotals(lines, f.iva_rate, f.iva_exempt, f.irpf_rate)
      const values = {
        number: f.number.trim(),
        status: f.status,
        issue_date: f.issue_date,
        service_date: f.service_date || null,
        due_date: f.due_date || null,
        paid_date: f.status === 'cobrada' ? f.paid_date || today() : null,
        client_id: clientId,
        client_name: f.client_name.trim(),
        client_nif: f.client_nif || null,
        client_address: f.client_address || null,
        issuer: f.issuer,
        lines,
        iva_rate: f.iva_exempt ? 0 : f.iva_rate,
        iva_exempt: f.iva_exempt,
        iva_note: f.iva_note,
        irpf_rate: f.irpf_rate,
        irpf_note: f.irpf_note,
        base: t.base,
        iva_amount: t.iva,
        irpf_amount: t.irpf,
        total: t.total,
        notes: f.notes || null,
      }
      let saved: Invoice
      if (actual) {
        await invoices.update(actual.id, values)
        saved = { ...actual, ...values } as Invoice
      } else {
        saved = await invoices.insert(values)
      }
      if (pdfPendiente) {
        try {
          await uploadPdf(user!.id, saved.id, pdfPendiente)
          setPdfPendiente(null)
        } catch (e) {
          toast.error(`Factura guardada, pero el PDF no: ${friendlyError(e)}`)
        }
      }
      setForm((x) => (x ? { ...x, client_id: clientId, lines, paid_date: values.paid_date } : x))
      setDirty(false)
      if (esNueva) navegar(`/facturas/${saved.id}`, { replace: true })
      return saved
    } catch (e) {
      const msg = friendlyError(e)
      toast.error(/duplicate|unique/i.test(msg) ? `Ya tienes una factura con el número ${f.number}` : msg)
      return null
    } finally {
      setSaving(false)
    }
  }

  async function guardarEImprimir() {
    if (dirty || esNueva) {
      const ok = await guardar()
      if (!ok) return
      toast.success('Factura guardada')
    }
    setPrinting(true)
  }

  async function borrar() {
    if (!actual) return
    const ok = await confirm({
      title: `¿Borrar la factura ${actual.number}?`,
      message:
        'Si ya la enviaste al cliente, lo correcto es no borrarla y emitir una factura rectificativa.',
      confirmLabel: 'Borrar',
      danger: true,
    })
    if (!ok) return
    try {
      await invoices.remove(actual.id)
      toast.success('Factura borrada')
      navegar('/facturas')
    } catch (e) {
      toast.error(friendlyError(e))
    }
  }

  const ivaValue = form.iva_exempt ? 'exento' : String(form.iva_rate)
  const nombreArchivo = `Factura ${form.number} - ${form.client_name}`.replace(/[\\/:*?"<>|]/g, '')

  /* --------------------------------------------------------------- vista -- */

  return (
    <div>
      {/* Cabecera */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Link to="/facturas">
          <IconButton label="Volver a Facturas">
            <ArrowLeft className="size-5" />
          </IconButton>
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl leading-tight sm:text-3xl">
            {esNueva ? 'Nueva factura' : `Factura ${actual!.number}`}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-ink-3">
            {!esNueva && <Badge tone={STATUS_TONE[actual!.status]}>{STATUS_LABEL[actual!.status]}</Badge>}
            {dirty && <span>Cambios sin guardar</span>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {!esNueva && (
            <>
              <IconButton label="Duplicar" onClick={() => navegar(`/facturas/nueva?duplicar=${actual!.id}`)}>
                <Copy className="size-[18px]" />
              </IconButton>
              <IconButton label="Borrar" onClick={borrar}>
                <Trash2 className="size-[18px]" />
              </IconButton>
            </>
          )}
          <Button icon={<Save className="size-4" />} loading={saving} onClick={() => void guardar().then((x) => x && toast.success('Factura guardada'))}>
            Guardar
          </Button>
          <Button variant="primary" icon={<Printer className="size-4" />} onClick={guardarEImprimir}>
            Imprimir / PDF
          </Button>
        </div>
      </div>

      {!fiscal.profile && (
        <Card className="mb-5 flex flex-wrap items-center justify-between gap-3 border border-warn/30 p-4">
          <p className="text-sm text-ink-2">
            Aún no has guardado tus datos de emisor (NIF, dirección, IBAN). Rellénalos una vez y saldrán en todas.
          </p>
          <Button size="sm" variant="soft" icon={<Settings2 className="size-4" />} onClick={() => setPerfilOpen(true)}>
            Mis datos
          </Button>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
        {/* ---------------- Formulario ---------------- */}
        <div className="space-y-5">
          <AdjuntoPdf invoiceId={actual?.id ?? null} pendiente={pdfPendiente} onPendiente={setPdfPendiente} />

          <Card className="grid gap-4 p-5 sm:grid-cols-2">
            <Field label="Número">
              <Input
                value={form.number}
                onChange={(e) => {
                  numeroManual.current = true
                  patch({ number: e.target.value })
                }}
              />
            </Field>
            <Field label="Estado">
              <Select
                value={form.status}
                onChange={(e) => {
                  const s = e.target.value as InvoiceStatus
                  patch({ status: s, paid_date: s === 'cobrada' ? form.paid_date || today() : null })
                }}
              >
                {(Object.keys(STATUS_LABEL) as InvoiceStatus[]).map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Fecha de emisión">
              <Input type="date" value={form.issue_date} onChange={(e) => cambiarFecha(e.target.value)} />
            </Field>
            <Field label="Fecha del servicio">
              <Input
                type="date"
                value={form.service_date ?? ''}
                onChange={(e) => patch({ service_date: e.target.value || null })}
              />
            </Field>
            <Field label="Vencimiento">
              <Input
                type="date"
                value={form.due_date ?? ''}
                onChange={(e) => patch({ due_date: e.target.value || null })}
              />
            </Field>
            {form.status === 'cobrada' ? (
              <Field label="Cobrada el">
                <Input
                  type="date"
                  value={form.paid_date ?? ''}
                  onChange={(e) => patch({ paid_date: e.target.value || null })}
                />
              </Field>
            ) : (
              <div className="flex items-end">
                {!esNueva && (
                  <Button
                    variant="soft"
                    size="sm"
                    icon={<BadgeCheck className="size-4" />}
                    onClick={() => patch({ status: 'cobrada', paid_date: today() })}
                  >
                    Marcar cobrada hoy
                  </Button>
                )}
              </div>
            )}
          </Card>

          <Card className="grid gap-4 p-5 sm:grid-cols-2">
            <Field label="Cliente" className="sm:col-span-2">
              <Select value={form.client_id ?? ''} onChange={(e) => elegirCliente(e.target.value)}>
                <option value="">— Escribir uno nuevo —</option>
                {clients.rows.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Razón social">
              <Input
                value={form.client_name}
                onChange={(e) => patch({ client_name: e.target.value })}
                placeholder="EMPRESA, S.L."
              />
            </Field>
            <Field label="NIF / CIF">
              <Input
                value={form.client_nif ?? ''}
                onChange={(e) => patch({ client_nif: e.target.value.toUpperCase() })}
              />
            </Field>
            <Field label="Dirección" hint="Una línea por renglón" className="sm:col-span-2">
              <Textarea
                rows={3}
                value={form.client_address ?? ''}
                onChange={(e) => patch({ client_address: e.target.value })}
              />
            </Field>
          </Card>

          <Card className="p-5">
            <p className="mb-3 text-[12px] font-bold tracking-wide text-ink-2 uppercase">Conceptos</p>
            <div className="space-y-4">
              {form.lines.map((l, i) => (
                <div key={i} className="rounded-2xl border border-line bg-surface-2/50 p-3.5">
                  <div className="flex gap-2">
                    <Input
                      value={l.concept}
                      placeholder="Webinar online · Docencia en directo"
                      onChange={(e) => setLine(i, { concept: e.target.value })}
                    />
                    {form.lines.length > 1 && (
                      <IconButton
                        label="Quitar concepto"
                        onClick={() => patch({ lines: form.lines.filter((_, k) => k !== i) })}
                      >
                        <X className="size-4" />
                      </IconButton>
                    )}
                  </div>
                  <Input
                    className="mt-2"
                    value={l.detail}
                    placeholder="Detalle (opcional): sesión del…, contenido…"
                    onChange={(e) => setLine(i, { detail: e.target.value })}
                  />
                  <div className="mt-2 grid grid-cols-[1fr_1fr_1.3fr_auto] items-center gap-2">
                    <Input
                      type="number"
                      step="0.25"
                      min={0}
                      aria-label="Cantidad"
                      value={l.qty}
                      onChange={(e) => setLine(i, { qty: Number(e.target.value) })}
                    />
                    <Select aria-label="Unidad" value={l.unit} onChange={(e) => setLine(i, { unit: e.target.value })}>
                      {UNITS.map((u) => (
                        <option key={u} value={u}>
                          {u || '(sin unidad)'}
                        </option>
                      ))}
                    </Select>
                    <div className="relative">
                      <Input
                        type="number"
                        step="0.01"
                        min={0}
                        aria-label="Precio"
                        className="pr-7"
                        value={l.price}
                        onChange={(e) => setLine(i, { price: Number(e.target.value) })}
                      />
                      <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-ink-3">€</span>
                    </div>
                    <span className="tnum w-24 text-right text-sm font-bold">{eur(lineAmount(l))}</span>
                  </div>
                </div>
              ))}
            </div>
            <Button
              className="mt-3"
              size="sm"
              variant="ghost"
              icon={<Plus className="size-4" />}
              onClick={() => patch({ lines: [...form.lines, emptyLine()] })}
            >
              Añadir concepto
            </Button>
          </Card>

          <Card className="grid gap-4 p-5 sm:grid-cols-2">
            <Field label="IVA">
              <Select
                value={ivaValue}
                onChange={(e) => {
                  const x = e.target.value
                  if (x === 'exento') patch({ iva_exempt: true, iva_rate: 0 })
                  else patch({ iva_exempt: false, iva_rate: Number(x) })
                }}
              >
                <option value="exento">Exento (formación)</option>
                {IVA_RATES.filter((r) => r > 0).map((r) => (
                  <option key={r} value={r}>
                    {r} %
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Retención IRPF">
              <Select value={String(form.irpf_rate)} onChange={(e) => patch({ irpf_rate: Number(e.target.value) })}>
                {IRPF_RATES.map((r) => (
                  <option key={r} value={r}>
                    {r ? `${r} %` : 'Sin retención'}
                  </option>
                ))}
              </Select>
            </Field>
            {form.iva_exempt && (
              <Field label="Texto de la exención" className="sm:col-span-2">
                <Textarea rows={2} value={form.iva_note ?? ''} onChange={(e) => patch({ iva_note: e.target.value })} />
              </Field>
            )}
            {form.irpf_rate > 0 && (
              <Field label="Texto de la retención" className="sm:col-span-2">
                <Textarea rows={2} value={form.irpf_note ?? ''} onChange={(e) => patch({ irpf_note: e.target.value })} />
              </Field>
            )}
            <Field label="Nota en la factura (opcional)" className="sm:col-span-2">
              <Textarea rows={2} value={form.notes ?? ''} onChange={(e) => patch({ notes: e.target.value })} />
            </Field>

            <div className="tnum space-y-1.5 rounded-2xl bg-surface-2 p-4 text-sm sm:col-span-2">
              <Row k="Base imponible" v={eur(totals.base)} />
              <Row k={form.iva_exempt ? 'IVA (exento)' : `IVA (${form.iva_rate} %)`} v={eur(totals.iva)} />
              {form.irpf_rate > 0 && <Row k={`Retención IRPF (${form.irpf_rate} %)`} v={`−${eur(totals.irpf)}`} />}
              <div className="flex justify-between border-t border-line pt-2 text-base font-bold">
                <span>Total a cobrar</span>
                <span>{eur(totals.total)}</span>
              </div>
            </div>
          </Card>
        </div>

        {/* ---------------- Vista previa ---------------- */}
        <div className="lg:sticky lg:top-6 lg:self-start">
          <p className="mb-3 text-[12px] font-bold tracking-wide text-ink-3 uppercase">Vista previa</p>
          <HojaEscalada>
            <FacturaHoja d={form} />
          </HojaEscalada>
          <p className="mt-3 text-[12px] text-ink-3">
            «Imprimir / PDF» abre el diálogo de impresión: elige <b>Guardar como PDF</b> y el archivo
            se llamará «{nombreArchivo}».
          </p>
        </div>
      </div>

      {printing && (
        <Impresion title={nombreArchivo} onDone={() => setPrinting(false)}>
          <FacturaHoja d={form} />
        </Impresion>
      )}

      <PerfilFiscal
        open={perfilOpen}
        onClose={() => setPerfilOpen(false)}
        profile={fiscal.profile}
        onSave={async (v) => {
          const p = await fiscal.save(v)
          // La factura que estás haciendo coge los datos recién guardados.
          patch({ issuer: issuerOf(p), payment_days: p.payment_days })
        }}
      />
    </div>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between text-ink-2">
      <span>{k}</span>
      <span>{v}</span>
    </div>
  )
}
