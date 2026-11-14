import { useEffect, useRef, useState } from 'react'
import { Download, Eye, FileUp, Paperclip, RefreshCw, Trash2 } from 'lucide-react'
import { Button, Card, IconButton, useConfirm, useToast } from '@/components/ui'
import { useAuth } from '@/context/AuthContext'
import { friendlyError } from '@/lib/supabase'
import {
  checkPdf,
  deletePdf,
  fileSize,
  getPdfMeta,
  openPdf,
  uploadPdf,
  type InvoiceFileMeta,
} from '@/lib/facturasPdf'

/**
 * El PDF de la factura: el que enviaste o uno hecho fuera de MyOS. En una
 * factura aún sin guardar, el archivo espera en `pendiente` y se sube al guardar.
 */
export default function AdjuntoPdf({
  invoiceId,
  pendiente,
  onPendiente,
}: {
  invoiceId: string | null
  pendiente: File | null
  onPendiente: (f: File | null) => void
}) {
  const { user } = useAuth()
  const toast = useToast()
  const confirm = useConfirm()
  const input = useRef<HTMLInputElement>(null)
  const [meta, setMeta] = useState<InvoiceFileMeta | null>(null)
  const [busy, setBusy] = useState(false)
  const [arrastrando, setArrastrando] = useState(false)

  useEffect(() => {
    if (!invoiceId) return setMeta(null)
    getPdfMeta(invoiceId).then(setMeta, (e) => toast.error(friendlyError(e)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoiceId])

  async function elegir(file: File | undefined) {
    if (!file) return
    const err = checkPdf(file)
    if (err) return toast.error(err)
    if (!invoiceId) return onPendiente(file)
    setBusy(true)
    try {
      setMeta(await uploadPdf(user!.id, invoiceId, file))
      toast.success('PDF guardado en la factura')
    } catch (e) {
      toast.error(friendlyError(e))
    } finally {
      setBusy(false)
    }
  }

  async function quitar() {
    if (!invoiceId) return onPendiente(null)
    if (!(await confirm({ title: '¿Quitar el PDF adjunto?', confirmLabel: 'Quitar', danger: true }))) return
    try {
      await deletePdf(invoiceId)
      setMeta(null)
    } catch (e) {
      toast.error(friendlyError(e))
    }
  }

  const ver = (mode: 'ver' | 'descargar') =>
    void openPdf(invoiceId!, mode).catch((e) => toast.error(friendlyError(e)))

  const nombre = meta?.name ?? pendiente?.name
  const peso = meta?.size ?? pendiente?.size ?? 0

  return (
    <Card className="p-5">
      <input
        ref={input}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(e) => {
          void elegir(e.target.files?.[0])
          e.target.value = ''
        }}
      />
      <p className="mb-3 text-[12px] font-bold tracking-wide text-ink-2 uppercase">PDF de la factura</p>
      {nombre ? (
        <div className="flex items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
            <Paperclip className="size-[18px]" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold">{nombre}</p>
            <p className="text-[12px] text-ink-3">
              {fileSize(peso)}
              {!meta && ' · se guardará con la factura'}
            </p>
          </div>
          {meta && (
            <>
              <IconButton label="Ver PDF" onClick={() => ver('ver')}>
                <Eye className="size-[18px]" />
              </IconButton>
              <IconButton label="Descargar PDF" onClick={() => ver('descargar')}>
                <Download className="size-[18px]" />
              </IconButton>
            </>
          )}
          <IconButton label="Cambiar PDF" onClick={() => input.current?.click()}>
            <RefreshCw className="size-[18px]" />
          </IconButton>
          <IconButton label="Quitar PDF" onClick={quitar}>
            <Trash2 className="size-[18px]" />
          </IconButton>
        </div>
      ) : (
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setArrastrando(true)
          }}
          onDragLeave={() => setArrastrando(false)}
          onDrop={(e) => {
            e.preventDefault()
            setArrastrando(false)
            void elegir(e.dataTransfer.files?.[0])
          }}
          className={
            'flex flex-col items-center gap-2 rounded-2xl border border-dashed px-4 py-6 text-center transition-colors ' +
            (arrastrando ? 'border-accent bg-accent-soft' : 'border-line-strong')
          }
        >
          <p className="text-sm text-ink-2">
            Arrastra aquí el PDF de la factura (la que enviaste o una hecha fuera de MyOS).
          </p>
          <Button size="sm" loading={busy} icon={<FileUp className="size-4" />} onClick={() => input.current?.click()}>
            Subir PDF
          </Button>
        </div>
      )}
    </Card>
  )
}
