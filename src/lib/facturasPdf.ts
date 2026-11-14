// PDF adjunto a una factura. Vive en la tabla invoice_files (supabase/migration-v14.sql)
// como bytea: Postgres lo devuelve y lo recibe en hexadecimal ("\x2550…").

import { db } from '@/lib/supabase'

export interface InvoiceFileMeta {
  id: string
  invoice_id: string
  name: string
  size: number
  created_at: string
}

/** Columnas sin los bytes: para listar sin descargar nada. */
export const FILE_META = 'id,invoice_id,name,size,created_at'

export const MAX_PDF = 8 * 1024 * 1024

const HEX = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'))

function toHex(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  const out = new Array<string>(bytes.length)
  for (let i = 0; i < bytes.length; i++) out[i] = HEX[bytes[i]!]!
  return '\\x' + out.join('')
}

function fromHex(s: string): Uint8Array<ArrayBuffer> {
  const hex = s.startsWith('\\x') ? s.slice(2) : s
  const out = new Uint8Array(new ArrayBuffer(hex.length / 2))
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16)
  return out
}

export const fileSize = (n: number) =>
  n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(n / 1024))} KB`

export function checkPdf(file: File): string | null {
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) return 'Solo se admiten archivos PDF'
  if (file.size > MAX_PDF) return 'El PDF pesa más de 8 MB'
  return null
}

/** Sube (o reemplaza) el PDF de una factura. */
export async function uploadPdf(userId: string, invoiceId: string, file: File): Promise<InvoiceFileMeta> {
  const content = toHex(await file.arrayBuffer())
  const { data, error } = await db()
    .from('invoice_files')
    .upsert(
      { user_id: userId, invoice_id: invoiceId, name: file.name, mime: 'application/pdf', size: file.size, content },
      { onConflict: 'invoice_id' },
    )
    .select(FILE_META)
    .single()
  if (error) throw error
  return data as unknown as InvoiceFileMeta
}

export async function getPdfMeta(invoiceId: string): Promise<InvoiceFileMeta | null> {
  const { data, error } = await db().from('invoice_files').select(FILE_META).eq('invoice_id', invoiceId).maybeSingle()
  if (error) throw error
  return (data as unknown as InvoiceFileMeta | null) ?? null
}

export async function getPdfBlob(invoiceId: string): Promise<{ blob: Blob; name: string }> {
  const { data, error } = await db().from('invoice_files').select('name,content').eq('invoice_id', invoiceId).single()
  if (error) throw error
  const row = data as { name: string; content: string }
  return { blob: new Blob([fromHex(row.content)], { type: 'application/pdf' }), name: row.name }
}

export async function deletePdf(invoiceId: string): Promise<void> {
  const { error } = await db().from('invoice_files').delete().eq('invoice_id', invoiceId)
  if (error) throw error
}

/** Abre el PDF en otra pestaña; si el navegador lo bloquea, lo descarga. */
export async function openPdf(invoiceId: string, mode: 'ver' | 'descargar' = 'ver') {
  const { blob, name } = await getPdfBlob(invoiceId)
  const url = URL.createObjectURL(blob)
  if (mode === 'ver' && window.open(url, '_blank')) {
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
    return
  }
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
