/**
 * Utilidades para guardar vídeos por su enlace.
 *
 * No hace falta clave de API de YouTube: el endpoint oEmbed es público y
 * permite peticiones desde el navegador, así que de ahí salen título, canal y
 * miniatura. Si falla, la miniatura se deduce del identificador del vídeo.
 */

/** Saca el identificador de un enlace de YouTube en cualquiera de sus formas. */
export function youtubeId(url: string): string | null {
  const clean = url.trim()
  if (!clean) return null

  const patterns = [
    /(?:youtube\.com\/watch\?(?:.*&)?v=)([\w-]{11})/,
    /(?:youtu\.be\/)([\w-]{11})/,
    /(?:youtube\.com\/(?:embed|shorts|live|v)\/)([\w-]{11})/,
  ]
  for (const re of patterns) {
    const m = clean.match(re)
    if (m) return m[1]
  }
  // Si te limitas a pegar el identificador, también vale.
  return /^[\w-]{11}$/.test(clean) ? clean : null
}

/** Miniatura de un vídeo de YouTube. `hqdefault` existe siempre. */
export const youtubeThumb = (id: string) => `https://img.youtube.com/vi/${id}/hqdefault.jpg`

export interface VideoInfo {
  title: string | null
  author: string | null
  thumbnail: string | null
  url: string
}

/**
 * Pide a YouTube el título, el canal y la miniatura del vídeo.
 * Si el vídeo es privado o no hay red, devuelve al menos la miniatura.
 */
export async function fetchVideoInfo(url: string): Promise<VideoInfo | null> {
  const id = youtubeId(url)
  if (!id) return null

  const canonical = `https://www.youtube.com/watch?v=${id}`
  const fallback: VideoInfo = {
    title: null,
    author: null,
    thumbnail: youtubeThumb(id),
    url: canonical,
  }

  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(canonical)}&format=json`,
    )
    if (!res.ok) return fallback
    const data = (await res.json()) as {
      title?: string
      author_name?: string
      thumbnail_url?: string
    }
    return {
      title: data.title ?? null,
      author: data.author_name ?? null,
      thumbnail: data.thumbnail_url ?? youtubeThumb(id),
      url: canonical,
    }
  } catch {
    return fallback
  }
}
