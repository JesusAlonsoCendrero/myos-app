import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import '@fontsource-variable/fraunces/index.css'
import {
  computeTotals,
  eur,
  formatIban,
  initials,
  lineAmount,
  longEs,
  pct,
  type InvoiceLine,
  type Issuer,
} from '@/lib/facturas'

/**
 * La factura tal y como sale en papel. Medidas de A4 a 96 ppp (794 × 1123 px) y
 * colores propios, ajenos al tema claro/oscuro de la app: una factura siempre
 * se ve igual.
 */

const C = {
  navy: '#1f2a38',
  copper: '#c0643a',
  peach: '#f6e6dc',
  paper: '#fbf9f6',
  ink: '#1f2a38',
  ink2: '#4a5361',
  ink3: '#6f7682',
  line: '#e4e0da',
}

const SERIF = "'Fraunces Variable', Georgia, 'Times New Roman', serif"
const SANS = "'Manrope Variable', 'Inter', ui-sans-serif, system-ui, sans-serif"

export const A4 = { w: 794, h: 1123 }

export interface HojaDatos {
  number: string
  issue_date: string
  due_date: string | null
  service_date: string | null
  issuer: Partial<Issuer>
  client_name: string
  client_nif: string | null
  client_address: string | null
  lines: InvoiceLine[]
  iva_rate: number
  iva_exempt: boolean
  iva_note: string | null
  irpf_rate: number
  irpf_note: string | null
  payment_days: number
  notes?: string | null
}

const label: CSSProperties = {
  fontSize: 10,
  letterSpacing: '0.2em',
  textTransform: 'uppercase',
  color: C.ink3,
  fontWeight: 500,
}

const rule: CSSProperties = { borderTop: `1px solid ${C.line}` }

export default function FacturaHoja({ d }: { d: HojaDatos }) {
  const t = computeTotals(d.lines, d.iva_rate, d.iva_exempt, d.irpf_rate)
  const lineas = d.lines.filter((l) => l.concept.trim() || l.price)
  const issuerAddr = (d.issuer.address ?? '').split('\n').filter(Boolean)
  const clientAddr = (d.client_address ?? '').split('\n').filter(Boolean)
  const contacto = [d.issuer.email, d.issuer.phone].filter(Boolean).join(' · ')

  return (
    <div
      style={{
        width: A4.w,
        minHeight: A4.h,
        background: C.paper,
        color: C.ink,
        fontFamily: SANS,
        position: 'relative',
        boxSizing: 'border-box',
        WebkitPrintColorAdjust: 'exact',
        printColorAdjust: 'exact',
      }}
    >
      {/* Franja superior */}
      <div style={{ height: 22, background: C.navy }} />
      <div style={{ height: 4, width: '30%', background: C.copper }} />

      <div style={{ padding: '44px 64px 40px' }}>
        {/* Cabecera */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <div
              style={{
                width: 60,
                height: 60,
                borderRadius: '50%',
                border: `1.5px solid ${C.copper}`,
                display: 'grid',
                placeItems: 'center',
              }}
            >
              <div
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: '50%',
                  background: C.navy,
                  color: '#fff',
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: 17,
                  fontWeight: 600,
                  letterSpacing: '0.04em',
                }}
              >
                {initials(d.issuer.name ?? '') || '··'}
              </div>
            </div>
            <div>
              <div style={{ fontFamily: SERIF, fontSize: 27, fontWeight: 600, lineHeight: 1.1 }}>
                {d.issuer.name || 'Tu nombre'}
              </div>
              {d.issuer.tagline && (
                <div style={{ ...label, fontSize: 10.5, marginTop: 8, letterSpacing: '0.28em' }}>
                  {d.issuer.tagline}
                </div>
              )}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: SERIF, fontSize: 46, fontWeight: 400, lineHeight: 1 }}>Factura</div>
            <div
              style={{
                display: 'inline-block',
                marginTop: 12,
                padding: '5px 14px',
                borderRadius: 999,
                background: C.peach,
                color: C.copper,
                fontSize: 12.5,
                fontWeight: 600,
                letterSpacing: '0.06em',
              }}
            >
              Nº {d.number || '—'}
            </div>
          </div>
        </div>

        {/* Fechas */}
        <div
          style={{
            ...rule,
            borderBottom: `1px solid ${C.line}`,
            marginTop: 38,
            padding: '20px 0',
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
          }}
        >
          {[
            ['Fecha de emisión', longEs(d.issue_date)],
            ['Vencimiento', longEs(d.due_date)],
            ['Fecha del servicio', d.service_date ? longEs(d.service_date) : '—'],
          ].map(([k, v]) => (
            <div key={k}>
              <div style={label}>{k}</div>
              <div style={{ marginTop: 10, fontSize: 13 }}>{v}</div>
            </div>
          ))}
        </div>

        {/* De / Para */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32, marginTop: 28 }}>
          <div>
            <div style={label}>De</div>
            <div style={{ marginTop: 12, fontSize: 15, fontWeight: 600 }}>{d.issuer.name}</div>
            <div style={{ marginTop: 6, fontSize: 13.5, lineHeight: 1.65, color: C.ink2 }}>
              {d.issuer.nif && <div>NIF {d.issuer.nif}</div>}
              {issuerAddr.map((l, i) => (
                <div key={i}>{l}</div>
              ))}
              {contacto && <div>{contacto}</div>}
            </div>
          </div>
          <div>
            <div style={label}>Para</div>
            <div style={{ marginTop: 12, fontSize: 15, fontWeight: 600 }}>
              {d.client_name || 'Cliente'}
            </div>
            <div style={{ marginTop: 6, fontSize: 13.5, lineHeight: 1.65, color: C.ink2 }}>
              {d.client_nif && <div>NIF {d.client_nif}</div>}
              {clientAddr.map((l, i) => (
                <div key={i}>{l}</div>
              ))}
            </div>
          </div>
        </div>

        {/* Conceptos */}
        <table
          style={{
            width: '100%',
            marginTop: 32,
            borderCollapse: 'collapse',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          <thead>
            <tr style={{ borderBottom: `1.5px solid ${C.navy}` }}>
              <th style={{ ...label, textAlign: 'left', padding: '0 0 12px' }}>Concepto</th>
              <th style={{ ...label, textAlign: 'right', padding: '0 0 12px', width: 100 }}>Cantidad</th>
              <th style={{ ...label, textAlign: 'right', padding: '0 0 12px', width: 100 }}>Precio</th>
              <th style={{ ...label, textAlign: 'right', padding: '0 0 12px', width: 100 }}>Importe</th>
            </tr>
          </thead>
          <tbody>
            {lineas.map((l, i) => (
              <tr key={i} style={{ borderBottom: `1px solid ${C.line}`, verticalAlign: 'top' }}>
                <td style={{ padding: '15px 16px 15px 0' }}>
                  <div style={{ fontSize: 14 }}>{l.concept}</div>
                  {l.detail && (
                    <div style={{ fontSize: 12, color: C.ink3, marginTop: 5 }}>{l.detail}</div>
                  )}
                </td>
                <td style={{ padding: '18px 0', textAlign: 'right', fontSize: 13.5 }}>
                  {Number(l.qty).toLocaleString('es-ES')} {l.unit}
                </td>
                <td style={{ padding: '18px 0', textAlign: 'right', fontSize: 13.5 }}>{eur(l.price)}</td>
                <td style={{ padding: '18px 0', textAlign: 'right', fontSize: 14, fontWeight: 700 }}>
                  {eur(lineAmount(l))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totales */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}>
          <div style={{ width: 352, fontSize: 13.5, fontVariantNumeric: 'tabular-nums' }}>
            {[
              ['Base imponible', eur(t.base), C.ink2],
              [
                d.iva_exempt ? 'IVA (exento)' : `IVA (${pct(d.iva_rate)})`,
                eur(t.iva),
                C.ink2,
              ],
              ...(Number(d.irpf_rate) > 0
                ? [[`Retención IRPF (${pct(d.irpf_rate)})`, `−${eur(t.irpf)}`, C.copper]]
                : []),
            ].map(([k, v, color]) => (
              <div
                key={k}
                style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', color: C.ink2 }}
              >
                <span>{k}</span>
                <span style={{ color }}>{v}</span>
              </div>
            ))}
            <div
              style={{
                marginTop: 14,
                background: C.navy,
                color: '#fff',
                borderRadius: 12,
                padding: '20px 22px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span style={{ ...label, color: '#c9cfd8', fontSize: 10.5 }}>Total a pagar</span>
              <span style={{ fontSize: 27, fontWeight: 700 }}>{eur(t.total)}</span>
            </div>
          </div>
        </div>

        {/* Pago */}
        <div
          style={{
            marginTop: 36,
            background: '#fff',
            border: `1px solid ${C.line}`,
            borderLeft: `3px solid ${C.copper}`,
            borderRadius: 10,
            padding: '22px 28px',
            display: 'grid',
            gridTemplateColumns: '1.6fr 1fr',
            gap: 24,
          }}
        >
          <div>
            <div style={label}>Pago por transferencia</div>
            <div
              style={{
                marginTop: 10,
                fontFamily: "ui-monospace, 'Cascadia Mono', Consolas, monospace",
                fontWeight: 700,
                fontSize: 14.5,
                letterSpacing: '0.05em',
              }}
            >
              {formatIban(d.issuer.iban) || '—'}
            </div>
            <div style={{ marginTop: 8, fontSize: 13, color: C.ink3 }}>Titular: {d.issuer.name}</div>
          </div>
          <div>
            <div style={label}>Plazo</div>
            <div style={{ marginTop: 10, fontSize: 14 }}>{d.payment_days} días desde la emisión</div>
            {d.due_date && (
              <div
                style={{
                  marginTop: 8,
                  fontSize: 12,
                  color: C.ink3,
                  background: '#f4f2ef',
                  padding: '5px 7px',
                  borderRadius: 4,
                }}
              >
                Antes del {longEs(d.due_date)}
              </div>
            )}
          </div>
        </div>

        {/* Notas legales */}
        {d.notes && (
          <p style={{ marginTop: 22, fontSize: 12, color: C.ink2, whiteSpace: 'pre-line' }}>{d.notes}</p>
        )}
        {d.iva_exempt && d.iva_note && (
          <p style={{ marginTop: 18, fontSize: 12, color: C.ink2 }}>{d.iva_note}</p>
        )}
        {Number(d.irpf_rate) > 0 && d.irpf_note && (
          <div style={{ ...rule, marginTop: 18, paddingTop: 16, fontSize: 11, lineHeight: 1.6, color: C.ink3, maxWidth: 560 }}>
            {d.irpf_note}
          </div>
        )}
      </div>
    </div>
  )
}

/** Hoja A4 encogida para que quepa en el ancho disponible. */
export function HojaEscalada({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const inner = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.6)
  const [alto, setAlto] = useState(A4.h)

  useLayoutEffect(() => {
    const el = ref.current
    const hoja = inner.current
    if (!el || !hoja) return
    const ro = new ResizeObserver(() => {
      setScale(Math.min(1, el.clientWidth / A4.w))
      setAlto(Math.max(A4.h, hoja.offsetHeight))
    })
    ro.observe(el)
    ro.observe(hoja)
    return () => ro.disconnect()
  }, [])

  return (
    <div ref={ref} className="w-full">
      <div
        className="overflow-hidden rounded-xl shadow-lift"
        style={{ width: A4.w * scale, height: alto * scale }}
      >
        <div ref={inner} style={{ transform: `scale(${scale})`, transformOrigin: 'top left', width: A4.w }}>
          {children}
        </div>
      </div>
    </div>
  )
}

/**
 * Imprime `children` solo, en A4 y sin márgenes. El título de la pestaña pasa a
 * ser el nombre del archivo que propone "Guardar como PDF".
 */
export function Impresion({
  title,
  children,
  onDone,
}: {
  title: string
  children: ReactNode
  onDone: () => void
}) {
  useEffect(() => {
    const prev = document.title
    document.title = title
    let cancel = false
    const after = () => {
      document.title = prev
      onDone()
    }
    window.addEventListener('afterprint', after, { once: true })
    // Esperar a que las fuentes estén listas para no imprimir con las de reserva.
    void document.fonts.ready.then(() => {
      if (!cancel) setTimeout(() => window.print(), 60)
    })
    return () => {
      cancel = true
      document.title = prev
      window.removeEventListener('afterprint', after)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return createPortal(<div id="print-area">{children}</div>, document.body)
}
