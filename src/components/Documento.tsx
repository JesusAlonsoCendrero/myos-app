import { useEffect, useRef, useState } from 'react'
import { Check, Loader2 } from 'lucide-react'
import { Card, cx } from './ui'

/**
 * Un documento largo y libre colgado de un proyecto o de una idea. No hay botón
 * de guardar: se guarda solo al parar de escribir y al salir del campo, para
 * que no puedas perder nada por navegar a otro sitio.
 */
export default function Documento({
  value,
  onSave,
  placeholder,
}: {
  value: string | null
  onSave: (texto: string | null) => Promise<void>
  placeholder?: string
}) {
  const [texto, setTexto] = useState(value ?? '')
  const [estado, setEstado] = useState<'quieto' | 'guardando' | 'guardado'>('quieto')
  const caja = useRef<HTMLTextAreaElement>(null)
  const guardado = useRef(value ?? '')

  // La caja crece con el texto: escribir no debe obligarte a hacer scroll dentro.
  const ajustar = () => {
    const el = caja.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.max(el.scrollHeight, 420)}px`
  }
  useEffect(ajustar, [texto])

  // Si el documento llega tarde (la consulta va después del primer render),
  // lo adoptamos mientras no hayas escrito nada.
  useEffect(() => {
    if (guardado.current === '' && texto === '' && value) {
      setTexto(value)
      guardado.current = value
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  async function guardar(actual: string) {
    if (actual === guardado.current) return
    setEstado('guardando')
    try {
      await onSave(actual.trim() ? actual : null)
      guardado.current = actual
      setEstado('guardado')
    } catch {
      setEstado('quieto')
    }
  }

  // Guardado automático al dejar de escribir.
  useEffect(() => {
    if (texto === guardado.current) return
    const t = setTimeout(() => void guardar(texto), 1200)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texto])

  const palabras = texto.trim() ? texto.trim().split(/\s+/).length : 0

  return (
    <Card className="p-4 sm:p-6">
      <div className="mb-3 flex items-center justify-between gap-3 text-[12px] text-ink-3">
        <span className="tnum">
          {palabras === 0 ? 'Documento en blanco' : `${palabras} palabras`}
        </span>
        <span
          className={cx(
            'inline-flex items-center gap-1.5 transition-opacity duration-300',
            estado === 'quieto' && 'opacity-0',
          )}
        >
          {estado === 'guardando' ? (
            <>
              <Loader2 className="size-3.5 animate-spin" />
              Guardando…
            </>
          ) : (
            <>
              <Check className="size-3.5 text-good" />
              Guardado
            </>
          )}
        </span>
      </div>

      <textarea
        ref={caja}
        value={texto}
        onChange={(e) => {
          setTexto(e.target.value)
          if (estado === 'guardado') setEstado('quieto')
        }}
        onBlur={() => void guardar(texto)}
        placeholder={
          placeholder ??
          'Escribe aquí lo que quieras: el planteamiento, las ideas, lo que hay que resolver…'
        }
        className="w-full resize-none bg-transparent text-[15px] leading-[1.75] text-ink placeholder:text-ink-3 focus:outline-none"
      />
    </Card>
  )
}
