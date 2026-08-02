// Genera los PNG del manifiesto PWA a partir del logo de MyOS.
// Uso:  npm run icons
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import sharp from 'sharp'

const publicDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public')

// `safe` reduce el tamaño para que Android pueda recortar sin comerse las letras.
const icon = (size, safe) => {
  const fontSize = size * (safe ? 0.34 : 0.46)
  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="#1d4ed8"/>
  <text x="${size / 2}" y="${size / 2}" fill="#ffffff"
        font-family="DejaVu Sans, Segoe UI, Helvetica, Arial, sans-serif"
        font-size="${fontSize}" font-weight="bold" letter-spacing="${-fontSize * 0.03}"
        text-anchor="middle" dominant-baseline="central">JA</text>
</svg>`
}

const targets = [
  ['pwa-192.png', 192, false],
  ['pwa-512.png', 512, false],
  ['pwa-maskable-512.png', 512, true],
  ['apple-touch-icon.png', 180, false],
]

await mkdir(publicDir, { recursive: true })

for (const [name, size, safe] of targets) {
  const png = await sharp(Buffer.from(icon(size, safe))).png().toBuffer()
  await writeFile(join(publicDir, name), png)
  console.log(`✓ ${name} (${size}px)`)
}
