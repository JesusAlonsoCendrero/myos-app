/**
 * Coordenadas de países y ciudades populares, para situar un viaje en el mapa
 * sin depender de ningún servicio de geocodificación.
 *
 * No pretende ser exhaustivo ni exacto al metro: el mapa es del mundo entero,
 * así que basta con acertar la zona.
 */

type Coords = [lat: number, lon: number]

const COUNTRIES: Record<string, Coords> = {
  españa: [40.4, -3.7],
  spain: [40.4, -3.7],
  portugal: [39.5, -8.0],
  francia: [46.6, 2.4],
  france: [46.6, 2.4],
  italia: [42.8, 12.6],
  italy: [42.8, 12.6],
  alemania: [51.2, 10.4],
  germany: [51.2, 10.4],
  'reino unido': [54.0, -2.0],
  inglaterra: [52.5, -1.5],
  escocia: [56.8, -4.2],
  irlanda: [53.4, -8.2],
  holanda: [52.2, 5.3],
  'países bajos': [52.2, 5.3],
  bélgica: [50.6, 4.6],
  suiza: [46.8, 8.2],
  austria: [47.6, 14.1],
  grecia: [39.1, 21.8],
  croacia: [45.1, 15.2],
  noruega: [61.0, 8.5],
  suecia: [60.1, 15.6],
  finlandia: [64.0, 26.0],
  dinamarca: [56.0, 9.5],
  islandia: [64.9, -19.0],
  polonia: [52.0, 19.1],
  'república checa': [49.8, 15.5],
  chequia: [49.8, 15.5],
  hungría: [47.2, 19.5],
  rumanía: [45.9, 25.0],
  turquía: [39.0, 35.2],
  marruecos: [31.8, -7.1],
  egipto: [26.8, 30.8],
  túnez: [34.0, 9.5],
  sudáfrica: [-30.6, 22.9],
  kenia: [0.0, 37.9],
  tanzania: [-6.4, 34.9],
  japón: [36.2, 138.3],
  japan: [36.2, 138.3],
  china: [35.9, 104.2],
  'corea del sur': [35.9, 127.8],
  tailandia: [15.9, 101.0],
  vietnam: [14.1, 108.3],
  indonesia: [-0.8, 113.9],
  filipinas: [12.9, 121.8],
  india: [20.6, 79.0],
  nepal: [28.4, 84.1],
  'sri lanka': [7.9, 80.8],
  malasia: [4.2, 101.98],
  singapur: [1.35, 103.8],
  'emiratos árabes unidos': [23.4, 53.8],
  jordania: [30.6, 36.2],
  israel: [31.0, 34.9],
  australia: [-25.3, 133.8],
  'nueva zelanda': [-40.9, 174.9],
  'estados unidos': [39.8, -98.6],
  eeuu: [39.8, -98.6],
  usa: [39.8, -98.6],
  canadá: [56.1, -106.3],
  méxico: [23.6, -102.6],
  cuba: [21.5, -77.8],
  'república dominicana': [18.7, -70.2],
  'costa rica': [9.7, -83.8],
  panamá: [8.5, -80.8],
  colombia: [4.6, -74.3],
  perú: [-9.2, -75.0],
  ecuador: [-1.8, -78.2],
  bolivia: [-16.3, -63.6],
  chile: [-35.7, -71.5],
  argentina: [-38.4, -63.6],
  brasil: [-14.2, -51.9],
  uruguay: [-32.5, -55.8],
}

const CITIES: Record<string, Coords> = {
  madrid: [40.4, -3.7],
  barcelona: [41.4, 2.2],
  valencia: [39.5, -0.4],
  sevilla: [37.4, -6.0],
  bilbao: [43.3, -2.9],
  málaga: [36.7, -4.4],
  lisboa: [38.7, -9.1],
  oporto: [41.1, -8.6],
  parís: [48.9, 2.4],
  paris: [48.9, 2.4],
  londres: [51.5, -0.1],
  roma: [41.9, 12.5],
  florencia: [43.8, 11.3],
  venecia: [45.4, 12.3],
  milán: [45.5, 9.2],
  nápoles: [40.9, 14.3],
  berlín: [52.5, 13.4],
  múnich: [48.1, 11.6],
  ámsterdam: [52.4, 4.9],
  bruselas: [50.8, 4.4],
  viena: [48.2, 16.4],
  praga: [50.1, 14.4],
  budapest: [47.5, 19.0],
  varsovia: [52.2, 21.0],
  atenas: [38.0, 23.7],
  santorini: [36.4, 25.5],
  estambul: [41.0, 29.0],
  zúrich: [47.4, 8.5],
  ginebra: [46.2, 6.1],
  copenhague: [55.7, 12.6],
  estocolmo: [59.3, 18.1],
  oslo: [59.9, 10.8],
  helsinki: [60.2, 25.0],
  reikiavik: [64.1, -21.9],
  dublín: [53.3, -6.3],
  edimburgo: [55.9, -3.2],
  marrakech: [31.6, -8.0],
  'el cairo': [30.0, 31.2],
  dubái: [25.2, 55.3],
  dubai: [25.2, 55.3],
  tokio: [35.7, 139.7],
  kioto: [35.0, 135.8],
  osaka: [34.7, 135.5],
  seúl: [37.6, 127.0],
  pekín: [39.9, 116.4],
  shanghái: [31.2, 121.5],
  bangkok: [13.8, 100.5],
  hanói: [21.0, 105.8],
  bali: [-8.4, 115.2],
  singapur: [1.35, 103.8],
  'kuala lumpur': [3.1, 101.7],
  delhi: [28.6, 77.2],
  katmandú: [27.7, 85.3],
  sídney: [-33.9, 151.2],
  melbourne: [-37.8, 145.0],
  auckland: [-36.9, 174.8],
  'nueva york': [40.7, -74.0],
  'san francisco': [37.8, -122.4],
  'los ángeles': [34.1, -118.2],
  chicago: [41.9, -87.6],
  miami: [25.8, -80.2],
  'las vegas': [36.2, -115.1],
  toronto: [43.7, -79.4],
  vancouver: [49.3, -123.1],
  'ciudad de méxico': [19.4, -99.1],
  cancún: [21.2, -86.8],
  'la habana': [23.1, -82.4],
  bogotá: [4.7, -74.1],
  lima: [-12.0, -77.0],
  cusco: [-13.5, -72.0],
  'buenos aires': [-34.6, -58.4],
  santiago: [-33.4, -70.7],
  'río de janeiro': [-22.9, -43.2],
  'rio de janeiro': [-22.9, -43.2],
  'sao paulo': [-23.5, -46.6],
}

/** Quita acentos y espacios de más para que "Kioto " y "kioto" sean lo mismo. */
const normalize = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')

const INDEX: Array<[string, Coords]> = [
  ...Object.entries(CITIES),
  ...Object.entries(COUNTRIES),
].map(([k, v]) => [normalize(k), v])

/**
 * Busca coordenadas para un destino y/o país. Primero por ciudad, luego por
 * país. Devuelve null si no reconoce ninguno de los dos.
 */
export function locate(destination?: string | null, country?: string | null): Coords | null {
  for (const raw of [destination, country]) {
    if (!raw) continue
    const q = normalize(raw)
    if (!q) continue

    const exact = INDEX.find(([k]) => k === q)
    if (exact) return exact[1]

    // "Kioto, Japón" o "Viaje a Roma" también deberían funcionar.
    const partial = INDEX.find(([k]) => q.includes(k) || k.includes(q))
    if (partial) return partial[1]
  }
  return null
}
