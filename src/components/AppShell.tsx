import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { motion } from 'motion/react'
import {
  ChartNoAxesCombined,
  Dumbbell,
  Home,
  Lightbulb,
  ListChecks,
  LogOut,
  Moon,
  MoreHorizontal,
  Plane,
  Settings,
  Sun,
  Target,
} from 'lucide-react'
import { cx, IconButton, Modal } from './ui'
import { useTheme } from '@/context/ThemeContext'
import { useAuth } from '@/context/AuthContext'
import { autoLogin } from '@/lib/supabase'

interface NavItem {
  to: string
  label: string
  icon: typeof Home
  end?: boolean
}

const NAV: NavItem[] = [
  { to: '/', label: 'Inicio', icon: Home, end: true },
  { to: '/objetivos', label: 'Objetivos', icon: Target },
  { to: '/proyectos', label: 'Proyectos', icon: Lightbulb },
  { to: '/tareas', label: 'Tareas', icon: ListChecks },
  { to: '/gimnasio', label: 'Gimnasio', icon: Dumbbell },
  { to: '/viajes', label: 'Viajes', icon: Plane },
  { to: '/kpis', label: 'KPIs', icon: ChartNoAxesCombined },
  { to: '/ajustes', label: 'Ajustes', icon: Settings },
]

/** Los cuatro accesos fijos de la barra inferior; el resto va en "Más". */
const MOBILE_PRIMARY = ['/', '/objetivos', '/tareas', '/gimnasio']

const SPRING = { type: 'spring', stiffness: 420, damping: 36 } as const

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <span
        className="grid size-9 shrink-0 place-items-center rounded-2xl font-display text-[15px] font-bold tracking-tight text-accent-ink shadow-glow [background:var(--grad)]"
        aria-hidden
      >
        JA
      </span>
      <span className="font-display text-2xl leading-none font-bold tracking-tight">MyOS</span>
    </div>
  )
}

function ThemeToggle() {
  const { theme, toggle } = useTheme()
  return (
    <IconButton
      label={theme === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
      onClick={toggle}
    >
      {theme === 'dark' ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
    </IconButton>
  )
}

export default function AppShell() {
  const { pathname } = useLocation()
  const { user, signOut } = useAuth()
  const [moreOpen, setMoreOpen] = useState(false)

  // Al navegar: cerrar el menú y volver arriba.
  useEffect(() => {
    setMoreOpen(false)
    window.scrollTo({ top: 0 })
  }, [pathname])

  const secondary = NAV.filter((n) => !MOBILE_PRIMARY.includes(n.to))
  const inSecondary = secondary.some((n) => pathname.startsWith(n.to))

  /** Ruta activa según las mismas reglas que NavLink (end para "/"). */
  const isActive = (item: NavItem) =>
    item.end ? pathname === item.to : pathname.startsWith(item.to)

  return (
    <div className="relative z-10 min-h-dvh lg:flex">
      {/* ---------------- Barra lateral (escritorio) ---------------- */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col px-4 py-6 lg:flex">
        <div className="glass flex h-full flex-col rounded-3xl px-3 py-5 shadow-card">
          <div className="px-3">
            <Logo />
          </div>

          <p className="mt-7 px-3 pb-2 text-[10px] font-bold tracking-[0.16em] text-ink-3 uppercase">
            Tu sistema
          </p>

          <nav className="flex flex-1 flex-col gap-0.5">
            {NAV.map((item) => {
              const { to, label, icon: Icon, end } = item
              const active = isActive(item)
              return (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  className={cx(
                    'group relative flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-semibold transition-colors duration-200',
                    active ? 'text-accent' : 'text-ink-2 hover:text-ink',
                  )}
                >
                  {/* La píldora activa viaja de un elemento a otro con un muelle. */}
                  {active && (
                    <motion.span
                      layoutId="nav-pill"
                      transition={SPRING}
                      className="absolute inset-0 rounded-2xl bg-accent-soft"
                      aria-hidden
                    />
                  )}
                  <span
                    className={cx(
                      'relative grid size-8 place-items-center rounded-xl transition-all duration-200',
                      active
                        ? 'text-accent-ink shadow-glow [background:var(--grad)]'
                        : 'bg-surface-2 text-ink-3 group-hover:bg-surface-3 group-hover:text-ink-2',
                    )}
                  >
                    <Icon className="size-4" />
                  </span>
                  <span className="relative">{label}</span>
                </NavLink>
              )
            })}
          </nav>

          {/* --------- Usuario --------- */}
          <div className="mt-4 flex items-center gap-2.5 rounded-2xl bg-surface-2 p-2.5">
            <span
              className="grid size-8 shrink-0 place-items-center rounded-xl text-[12px] font-bold text-accent-ink [background:var(--grad)]"
              aria-hidden
            >
              {(user?.email?.[0] ?? 'j').toUpperCase()}
            </span>
            <p
              className="min-w-0 flex-1 truncate text-[12px] font-medium text-ink-2"
              title={user?.email ?? ''}
            >
              {user?.email?.split('@')[0]}
            </p>
            <div className="flex shrink-0">
              <ThemeToggle />
              {/* Con entrada automática, cerrar sesión no tiene sentido: volvería a entrar sola. */}
              {!autoLogin && (
                <IconButton label="Cerrar sesión" onClick={() => void signOut()}>
                  <LogOut className="size-[18px]" />
                </IconButton>
              )}
            </div>
          </div>
        </div>
      </aside>

      {/* ---------------- Cabecera (móvil) ---------------- */}
      <header className="safe-top glass sticky top-0 z-30 flex items-center justify-between border-b border-line px-4 py-3 lg:hidden">
        <Logo />
        <div className="flex items-center">
          <ThemeToggle />
          {!autoLogin && (
            <IconButton label="Cerrar sesión" onClick={() => void signOut()}>
              <LogOut className="size-[18px]" />
            </IconButton>
          )}
        </div>
      </header>

      {/* ---------------- Contenido ---------------- */}
      <main className="min-w-0 flex-1 pb-32 lg:pb-0">
        <div
          key={pathname}
          className="animate-rise mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-10 lg:py-10"
        >
          <Outlet />
        </div>
      </main>

      {/* ---------------- Barra inferior flotante (móvil) ---------------- */}
      <nav className="fixed inset-x-3 bottom-3 z-30 lg:hidden" style={{ bottom: 'max(env(safe-area-inset-bottom), 12px)' }}>
        <div className="glass mx-auto grid max-w-md grid-cols-5 rounded-3xl p-1.5 shadow-lift">
          {NAV.filter((n) => MOBILE_PRIMARY.includes(n.to)).map((item) => {
            const { to, label, icon: Icon, end } = item
            const active = isActive(item)
            return (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={cx(
                  'relative flex flex-col items-center gap-0.5 rounded-2xl py-2 text-[10px] font-bold tracking-wide transition-colors duration-200',
                  active ? 'text-accent' : 'text-ink-3',
                )}
              >
                {active && (
                  <motion.span
                    layoutId="tab-pill"
                    transition={SPRING}
                    className="absolute inset-0 rounded-2xl bg-accent-soft"
                    aria-hidden
                  />
                )}
                <Icon className="relative size-[19px]" />
                <span className="relative">{label}</span>
              </NavLink>
            )
          })}

          <button
            onClick={() => setMoreOpen(true)}
            className={cx(
              'relative flex flex-col items-center gap-0.5 rounded-2xl py-2 text-[10px] font-bold tracking-wide transition-colors duration-200',
              inSecondary ? 'text-accent' : 'text-ink-3',
            )}
          >
            {inSecondary && (
              <motion.span
                layoutId="tab-pill"
                transition={SPRING}
                className="absolute inset-0 rounded-2xl bg-accent-soft"
                aria-hidden
              />
            )}
            <MoreHorizontal className="relative size-[19px]" />
            <span className="relative">Más</span>
          </button>
        </div>
      </nav>

      <Modal open={moreOpen} onClose={() => setMoreOpen(false)} title="Más apartados">
        <div className="stagger grid grid-cols-2 gap-3">
          {secondary.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cx(
                  'flex flex-col items-start gap-3 rounded-2xl border p-4 transition-all duration-200 active:scale-95',
                  isActive
                    ? 'border-accent bg-accent-soft text-accent'
                    : 'border-line bg-surface-2 text-ink hover:border-accent/50',
                )
              }
            >
              <span className="grid size-9 place-items-center rounded-xl bg-surface text-accent shadow-card">
                <Icon className="size-4.5" />
              </span>
              <span className="text-sm font-bold">{label}</span>
            </NavLink>
          ))}
        </div>
      </Modal>
    </div>
  )
}
