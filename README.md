# MyOS

Tu sistema operativo personal. Una sola pantalla para el negocio de consultoría
de Power Platform, el gimnasio, los proyectos y los viajes.

Funciona en el navegador y se instala en el móvil como aplicación (PWA). Los datos
viven en tu propio proyecto de Supabase, así que se sincronizan entre el ordenador
y el teléfono automáticamente.

---

## Apartados

| Apartado                | Qué hace                                                                                                                                                                                                 |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Inicio**              | Resumen del día: objetivos de la semana, Mi día, gimnasio y cuenta atrás del próximo viaje.                                                                                                                |
| **Objetivos semanales** | Cuatro frentes fijos: **Proyectos**, **Vídeos de YouTube**, **Posts de LinkedIn** y **Estudio**. Cada objetivo lleva su tecnología de Power Platform. Sin metas numéricas: el avance sale de sus tareas.     |
| **Lienzo por objetivo** | Tablero de tarjetas para guiones, ideas de miniatura, enlaces y listas. Todo lo que necesitas para sacar adelante ese objetivo, junto.                                                                      |
| **Tareas**              | Solo dos vistas: **Mi día** y **Backlog**. Sin categorías: cada tarea se asocia a un objetivo o a un proyecto. Se reordenan arrastrando y el detalle se abre en un panel lateral, sin tapar la lista.       |
| **Gimnasio**            | Calendario mensual de asistencia, racha, catálogo de 1.327 ejercicios con animaciones, rutinas y **modo entreno** con cronómetro total, por ejercicio y descanso entre series.                              |
| **Proyectos**           | De la idea suelta al proyecto terminado, con avance y las tecnologías de Power Platform que usa.                                                                                                            |
| **Viajes**              | Mapa del mundo con tus destinos marcados, foto de portada, tres estados (idea, planificado, reservado) y un lienzo por viaje para vuelos, reservas y sitios que ver.                                        |
| **Análisis (KPIs)**     | Tareas completadas, cumplimiento de objetivos, asistencia al gimnasio, volumen de entrenamiento y reparto por frente y por tecnología.                                                                      |
| **Ajustes**             | Tema claro/oscuro, exportación de todos tus datos a JSON y cómo instalarla en el móvil.                                                                                                                     |

---

## Puesta en marcha

### 1. Crear el proyecto de Supabase

1. Entra en [supabase.com](https://supabase.com) y crea una cuenta gratuita.
2. **New project**. Elige una región de Europa (Frankfurt o Londres) para que
   vaya rápido desde España.
3. Guarda la contraseña de la base de datos que te pida (no hace falta para la
   app, pero la necesitarás si algún día entras por SQL directo).

### 2. Crear las tablas

1. En el menú lateral de Supabase abre **SQL Editor** → **New query**.
2. Copia **todo** el contenido de [`supabase/schema.sql`](supabase/schema.sql) y pégalo. **Run**.
3. Nueva consulta: pega **todo** [`supabase/migration-v2.sql`](supabase/migration-v2.sql). **Run**.

El segundo archivo es el que trae los cambios de la v2 (frentes de objetivos,
tareas asociadas, lienzos, catálogo de ejercicios y mapa de viajes). Los dos son
idempotentes: puedes relanzarlos sin romper nada.

Eso crea las diez tablas, los índices, la seguridad por usuario (Row Level
Security) y el disparador que siembra tus categorías por defecto al registrarte.
El script es idempotente: puedes volver a ejecutarlo sin romper nada.

### 3. Conectar la app

1. En Supabase, **Settings → Data API** → copia la **Project URL**.
2. En **Settings → API Keys** → copia la **Publishable key** (empieza por
   `sb_publishable_`). Es la que antes se llamaba *anon public key*.
3. En esta carpeta, duplica `.env.example` y llámalo `.env`.
4. Pega los dos valores:

```
VITE_SUPABASE_URL=https://tuproyecto.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_...
```

> La *publishable key* es pública por diseño: quien protege tus datos es Row Level
> Security, que el esquema ya deja activada. **Nunca** pongas aquí la
> **secret key** (`sb_secret_...`), que se salta RLS y solo debe vivir en un servidor.

Si no defines estas dos variables, la app usa los valores de respaldo que hay en
[`src/lib/supabase.ts`](src/lib/supabase.ts). Están ahí a propósito: Vite incrusta
las variables `VITE_*` **al compilar**, no las lee al abrir la web, así que un
hosting sin ellas configuradas generaría un paquete roto. Cambia esos dos valores
si algún día apuntas la app a otro proyecto de Supabase.

### 4. Arrancar

```bash
npm install
```

```bash
npm run dev
```

Abre <http://localhost:5173>.

Si Supabase te pide confirmar el email y prefieres saltarte ese paso:
**Authentication → Providers → Email** y desactiva *Confirm email*.

### Entrada automática (sin pantalla de login)

Como la app es para una sola persona, puede entrar sola al abrirse. Rellena estas
dos variables en el `.env`:

```
VITE_AUTO_EMAIL=jesus@brujula.app
VITE_AUTO_PASSWORD=jesus1234
```

La primera vez verás una pantalla que crea esa cuenta con un botón. A partir de
ahí, y en cada dispositivo, la app entra sola y no vuelve a pedir nada.

Detalles:

- La contraseña necesita **6 caracteres como mínimo**: lo exige Supabase y no se
  puede bajar de ahí.
- Deja las dos variables **vacías** para volver al login normal con email y
  contraseña.
- **Aviso de seguridad**: esas credenciales acaban dentro del JavaScript que
  descarga el navegador. Es aceptable en local o en tu red. Si publicas la app con
  una URL pública, cualquiera que la encuentre entraría como tú y vería y borraría
  todo. Para ese caso, vacía las dos variables y usa el login normal.

---

## Instalarla en el móvil

La app es una PWA, así que no necesita tienda de aplicaciones.

- **Android / Chrome**: menú ⋮ → *Añadir a pantalla de inicio*.
- **iPhone / Safari**: botón Compartir → *Añadir a pantalla de inicio*.

Para que el móvil pueda abrirla necesitas publicarla en internet (ver abajo) o
acceder a la IP de tu ordenador en la red local con `npm run dev -- --host`.

Una vez instalada se abre a pantalla completa y, sin conexión, sigue mostrando lo
último que cargó.

---

## Publicarla en internet (gratis)

La forma más rápida es **Vercel** o **Netlify**. Con cualquiera de las dos:

1. Sube esta carpeta a un repositorio de GitHub.
2. Importa el repositorio en Vercel/Netlify.
3. No hace falta configurar nada más: `netlify.toml` ya trae el comando de build,
   la carpeta de salida, la versión de Node, la redirección de SPA y las cabeceras
   de caché. Y las claves de Supabase tienen valor de respaldo en el código.

   **Nunca añadas `VITE_AUTO_EMAIL` ni `VITE_AUTO_PASSWORD` en el hosting**: se
   compilan dentro del JavaScript y en una URL pública dejarían tu cuenta abierta
   a cualquiera que diera con ella. En la web usa el login normal, que solo te lo
   pide una vez por dispositivo.

Cada `git push` a `main` redespliega solo.
4. Comando de build: `npm run build`. Carpeta de salida: `dist`.

Al terminar tendrás una URL https que puedes instalar en el móvil.

---

## Comandos

| Comando           | Qué hace                                                     |
| ----------------- | ------------------------------------------------------------ |
| `npm run dev`     | Servidor de desarrollo en <http://localhost:5173>.            |
| `npm run build`   | Compila a `dist/` comprobando los tipos.                      |
| `npm run preview` | Sirve la build de producción (útil para probar la PWA).       |
| `npm run icons`   | Regenera los iconos PNG del manifiesto a partir del SVG.      |
| `npm run import-exercises` | Trae el catálogo de ejercicios de WorkoutX a tu Supabase. |
| `npm run typecheck` | Solo comprobación de tipos.                                |

---

## El catálogo de ejercicios

Los ejercicios con animación vienen de [WorkoutX](https://workoutxapp.com). Se
importan **una vez** a tu Supabase y a partir de ahí la app los lee de ahí:

```bash
npm run import-exercises
```

Antes hay que rellenar dos cosas en el `.env` (ninguna lleva prefijo `VITE_`, así
que nunca acaban en el navegador):

- `WORKOUTX_API_KEY` — tu clave de WorkoutX.
- `SUPABASE_SECRET_KEY` — de *Settings → API Keys → Secret keys*. Hace falta
  porque el catálogo es de solo lectura para la app.

**Ojo con los límites.** El plan gratuito de WorkoutX tiene tres a la vez:

- **500 peticiones al mes.**
- **30 peticiones por minuto** (esto no está en su documentación; sale a base de
  chocarse). El importador espera 2,1 s entre llamadas y, si aun así salta un
  429, respeta el `retryAfter` y reintenta. Por eso tarda unos minutos.
- **10 resultados como máximo por petición**, y **cada GIF cuenta como una
  petición aparte**.

Por eso el importador:

1. Trae los 1.327 ejercicios en español (~133 peticiones).
2. Copia a tu Supabase los GIF de los 200 más usados, priorizando los que ya
   tengas en tus rutinas.
3. Se detiene solo antes de agotar la cuota, y al relanzarlo **continúa por donde
   iba**: no vuelve a pedir los ejercicios ya guardados ni los GIF ya subidos.

Los ejercicios sin GIF se siguen pudiendo usar: muestran la zona del cuerpo en
lugar de la animación. Para traer más:

```bash
npm run import-exercises -- --only-gifs --gifs=300
```

## Cómo está montado

```
src/
  components/
    AppShell.tsx     Barra lateral en escritorio, barra inferior en móvil
    ui.tsx           Botones, tarjetas, campos, modales, avisos, confirmaciones
    charts.tsx       Piezas compartidas de los gráficos y vista de tabla
  context/
    AuthContext.tsx  Sesión de Supabase
    ThemeContext.tsx Tema claro/oscuro
  hooks/
    useCollection.ts Lectura y escritura de una tabla con estado local
  lib/
    supabase.ts      Cliente y traducción de errores al español
    types.ts         Tipos que reflejan el esquema SQL
    dates.ts         Semanas, fechas locales y etiquetas en español
    palette.ts       Paleta de gráficos validada para daltonismo
  pages/             Una pantalla por apartado
supabase/schema.sql  Todo el esquema, con RLS y semillas
```

### Decisiones que conviene conocer

- **Las fechas se calculan en hora local, nunca con `toISOString()`.** En España
  eso desplazaría un día: una tarea cerrada a las 00:30 contaría como del día
  anterior. Para eso está `localDateOf()` en `lib/dates.ts`.
- **La semana empieza en lunes.** Cada objetivo guarda el lunes de su semana, y
  por eso "se reinician" solos: al cambiar de semana simplemente no hay filas.
- **La paleta de gráficos está verificada**, no elegida a ojo: pasa las
  comprobaciones de luminosidad, croma, separación para daltonismo y contraste en
  tema claro y oscuro. El orden de los colores es fijo. Quedan dos avisos
  abiertos (azul↔violeta en deuteranopía y el violeta sobre fondo oscuro), y por
  eso **todos los gráficos llevan leyenda y etiquetas directas**: la identidad
  nunca depende solo del color. Cada tarjeta ofrece además la vista de tabla.
- **La página de KPIs se carga aparte.** La librería de gráficos pesa 113 kB, y
  así no lastra el arranque en el móvil.
