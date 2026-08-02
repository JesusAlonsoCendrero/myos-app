import { useEffect, useMemo, useRef, useState } from 'react'
import { cx } from './ui'

interface Feature {
  properties: { name: string }
  geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: number[][][] | number[][][][] }
}

export interface MapPin {
  id: string
  lat: number
  lon: number
  label: string
  color: string
  active?: boolean
}

/**
 * Recortamos por arriba y por abajo como hacen los mapas web: sin la Antártida
 * y sin el vacío polar, el mundo habitado ocupa todo el ancho y se ve mejor.
 */
const LAT_TOP = 84
const LAT_BOTTOM = -58

const W = 1000
const H = Math.round((W * (LAT_TOP - LAT_BOTTOM)) / 360) // 394: mantiene la proporción

/** Equirectangular: suficiente para un mapa decorativo y no arrastra dependencias. */
const projectX = (lon: number) => ((lon + 180) / 360) * W
const projectY = (lat: number) => ((LAT_TOP - lat) / (LAT_TOP - LAT_BOTTOM)) * H

/**
 * Convierte un anillo del GeoJSON en un trazado SVG.
 *
 * El detalle importante: países como Rusia o Fiyi cruzan el meridiano 180 y sus
 * puntos saltan de +179 a -179. En una proyección plana eso dibuja una raya que
 * cruza el mapa entero de lado a lado. Cuando detectamos ese salto cortamos el
 * trazado y empezamos otro.
 */
function ringToPath(ring: number[][]): string {
  let d = ''
  let previousLon: number | null = null

  for (let i = 0; i < ring.length; i++) {
    const [lon, lat] = ring[i]
    const salta = previousLon !== null && Math.abs(lon - previousLon) > 180
    const comando = i === 0 || salta ? 'M' : 'L'
    d += `${comando}${projectX(lon).toFixed(1)} ${projectY(lat).toFixed(1)}`
    previousLon = lon
  }
  return d + 'Z'
}

function featureToPath(f: Feature): string {
  const c = f.geometry.coordinates
  return f.geometry.type === 'Polygon'
    ? (c as number[][][]).map(ringToPath).join('')
    : (c as number[][][][]).flat().map(ringToPath).join('')
}

/**
 * Mapa del mundo con los destinos marcados. El GeoJSON (166 KB) se descarga a la
 * primera y se queda en caché del service worker, así que también va sin red.
 * Si se pasa `onPick`, al hacer clic devuelve las coordenadas de ese punto.
 */
export default function WorldMap({
  pins,
  onPick,
  onPinClick,
  className,
}: {
  pins: MapPin[]
  onPick?: (lat: number, lon: number) => void
  onPinClick?: (id: string) => void
  className?: string
}) {
  const [paths, setPaths] = useState<string[] | null>(null)
  const [failed, setFailed] = useState(false)
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    let alive = true
    fetch('/world.geo.json')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((geo: { features: Feature[] }) => {
        if (alive) setPaths(geo.features.map(featureToPath))
      })
      .catch(() => alive && setFailed(true))
    return () => {
      alive = false
    }
  }, [])

  const land = useMemo(() => paths?.join(' ') ?? '', [paths])

  function handleClick(e: React.MouseEvent<SVGSVGElement>) {
    if (!onPick || !svgRef.current) return
    const rect = svgRef.current.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * W
    const y = ((e.clientY - rect.top) / rect.height) * H
    onPick(90 - (y / H) * 180, (x / W) * 360 - 180)
  }

  if (failed) {
    return (
      <div className={cx('grid place-items-center rounded-3xl bg-surface-2 p-8', className)}>
        <p className="text-sm text-ink-3">No se ha podido cargar el mapa.</p>
      </div>
    )
  }

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${W} ${H}`}
      className={cx('w-full', onPick && 'cursor-crosshair', className)}
      onClick={handleClick}
      role="img"
      aria-label={`Mapa del mundo con ${pins.length} destino(s) marcados`}
    >
      {/* Océano. El clip evita que las costas recortadas se salgan del rectángulo. */}
      <defs>
        <clipPath id="myos-map-clip">
          <rect width={W} height={H} rx={16} />
        </clipPath>
      </defs>
      <rect width={W} height={H} rx={16} fill="var(--surface-2)" />

      {land ? (
        <path
          d={land}
          fill="var(--surface-3)"
          stroke="var(--line-strong)"
          strokeWidth={0.5}
          fillRule="evenodd"
          clipPath="url(#myos-map-clip)"
        />
      ) : (
        <text
          x={W / 2}
          y={H / 2}
          textAnchor="middle"
          fill="var(--ink-3)"
          fontSize="16"
          fontFamily="inherit"
        >
          Cargando el mundo…
        </text>
      )}

      {pins.map((p) => {
        const x = projectX(p.lon)
        const y = projectY(p.lat)
        return (
          <g
            key={p.id}
            transform={`translate(${x} ${y})`}
            className={onPinClick ? 'cursor-pointer' : undefined}
            onClick={(e) => {
              e.stopPropagation()
              onPinClick?.(p.id)
            }}
          >
            {p.active && (
              <circle r={16} fill={p.color} opacity={0.2}>
                <animate
                  attributeName="r"
                  values="10;20;10"
                  dur="2.4s"
                  repeatCount="indefinite"
                />
              </circle>
            )}
            <circle r={7} fill={p.color} stroke="var(--surface)" strokeWidth={2.5} />
            <title>{p.label}</title>
          </g>
        )
      })}
    </svg>
  )
}
