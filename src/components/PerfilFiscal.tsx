import { useEffect, useState } from 'react'
import { Button, Checkbox, Field, Input, Modal, Select, Textarea, useToast } from '@/components/ui'
import { friendlyError } from '@/lib/supabase'
import {
  EMPTY_PROFILE,
  IRPF_RATES,
  IVA_RATES,
  PRIVADO,
  type FiscalProfile,
} from '@/lib/facturas'

type Valores = Omit<FiscalProfile, 'user_id'>

/** Formulario de tus datos de emisor: lo que sale en el bloque "De" de cada factura. */
export default function PerfilFiscal({
  open,
  onClose,
  profile,
  onSave,
}: {
  open: boolean
  onClose: () => void
  profile: FiscalProfile | null
  onSave: (v: Partial<Valores>) => Promise<unknown>
}) {
  const toast = useToast()
  const [v, setV] = useState<Valores>(EMPTY_PROFILE)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    if (profile) {
      const { user_id: _u, ...rest } = profile
      setV({ ...EMPTY_PROFILE, ...rest })
    } else {
      setV({ ...EMPTY_PROFILE, ...PRIVADO.perfil })
    }
  }, [open, profile])

  const set = <K extends keyof Valores>(k: K, val: Valores[K]) => setV((p) => ({ ...p, [k]: val }))

  async function guardar() {
    if (!v.name.trim() || !v.nif.trim()) {
      toast.error('Nombre y NIF son obligatorios')
      return
    }
    setSaving(true)
    try {
      await onSave(v)
      toast.success('Datos guardados')
      onClose()
    } catch (e) {
      toast.error(friendlyError(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Mis datos de facturación"
      description="Salen en cada factura nueva. Las ya emitidas guardan los datos que tenían."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" loading={saving} onClick={guardar}>
            Guardar
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre completo">
          <Input value={v.name} onChange={(e) => set('name', e.target.value)} />
        </Field>
        <Field label="NIF">
          <Input value={v.nif} onChange={(e) => set('nif', e.target.value.toUpperCase())} />
        </Field>
        <Field label="Actividad (subtítulo)" className="sm:col-span-2">
          <Input
            value={v.tagline ?? ''}
            placeholder="Formación & Consultoría"
            onChange={(e) => set('tagline', e.target.value)}
          />
        </Field>
        <Field label="Dirección" hint="Una línea por renglón" className="sm:col-span-2">
          <Textarea rows={2} value={v.address ?? ''} onChange={(e) => set('address', e.target.value)} />
        </Field>
        <Field label="Email">
          <Input type="email" value={v.email ?? ''} onChange={(e) => set('email', e.target.value)} />
        </Field>
        <Field label="Teléfono">
          <Input value={v.phone ?? ''} onChange={(e) => set('phone', e.target.value)} />
        </Field>
        <Field label="IBAN para cobrar" className="sm:col-span-2">
          <Input value={v.iban ?? ''} onChange={(e) => set('iban', e.target.value.toUpperCase())} />
        </Field>

        <p className="pt-2 text-[12px] font-bold tracking-wide text-ink-3 uppercase sm:col-span-2">
          Impuestos por defecto
        </p>
        <Field label="IVA">
          <Select
            value={v.iva_exempt ? 'exento' : String(v.iva_rate)}
            onChange={(e) => {
              const x = e.target.value
              if (x === 'exento') setV((p) => ({ ...p, iva_exempt: true, iva_rate: 0 }))
              else setV((p) => ({ ...p, iva_exempt: false, iva_rate: Number(x) }))
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
          <Select value={String(v.irpf_rate)} onChange={(e) => set('irpf_rate', Number(e.target.value))}>
            {IRPF_RATES.map((r) => (
              <option key={r} value={r}>
                {r === 7 ? '7 % (primeros 3 años)' : r === 15 ? '15 % (general)' : 'Sin retención'}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Días para pagar">
          <Input
            type="number"
            min={0}
            value={v.payment_days}
            onChange={(e) => set('payment_days', Number(e.target.value))}
          />
        </Field>
        <div className="flex items-end pb-2">
          <Checkbox
            checked={v.iva_exempt}
            onChange={(x) => setV((p) => ({ ...p, iva_exempt: x, iva_rate: x ? 0 : 21 }))}
            label="Mis servicios suelen ir exentos de IVA"
          />
        </div>
        <Field label="Texto legal de la exención de IVA" className="sm:col-span-2">
          <Textarea rows={2} value={v.iva_note ?? ''} onChange={(e) => set('iva_note', e.target.value)} />
        </Field>
        <Field label="Texto legal de la retención" className="sm:col-span-2">
          <Textarea rows={2} value={v.irpf_note ?? ''} onChange={(e) => set('irpf_note', e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}
