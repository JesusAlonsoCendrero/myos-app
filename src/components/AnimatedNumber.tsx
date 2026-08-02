import { useEffect, useRef } from 'react'
import { animate, useInView } from 'motion/react'

/**
 * Cifra que cuenta hasta su valor al aparecer en pantalla. Para los números
 * protagonistas: sesiones de la semana, días para el viaje, porcentajes.
 */
export default function AnimatedNumber({
  value,
  duration = 0.9,
}: {
  value: number
  duration?: number
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true, margin: '-40px' })

  useEffect(() => {
    const node = ref.current
    if (!node || !inView) return
    const controls = animate(0, value, {
      duration,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => {
        node.textContent = String(Math.round(v))
      },
    })
    return () => controls.stop()
  }, [value, duration, inView])

  // Arranca en el valor final: si no hay animación (reduced motion), no pasa nada raro.
  return (
    <span ref={ref} className="tnum">
      {value}
    </span>
  )
}
