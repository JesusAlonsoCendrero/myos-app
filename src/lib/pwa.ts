import { registerSW } from 'virtual:pwa-register'

/**
 * Mantiene al dia la copia instalada de la app.
 *
 * La app se instala como PWA y entonces la sirve un service worker con su
 * propia cache: si esa ventana lleva dias abierta, se queda con la version del
 * dia que la instalaste por mucho que se publique otra. Con registerType
 * 'autoUpdate' el service worker nuevo entra solo, pero solo se entera al
 * cargar la pagina; por eso preguntamos cada media hora y tambien al volver a
 * la ventana.
 */
export function mantenerAlDia() {
  const actualizar = registerSW({
    immediate: true,
    onRegisteredSW(_url, registro) {
      if (!registro) return
      const mirar = () => void registro.update().catch(() => {})
      setInterval(mirar, 30 * 60 * 1000)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') mirar()
      })
    },
  })
  return actualizar
}
