import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import AppShell from '@/components/AppShell'
import { Spinner } from '@/components/ui'
import { useAuth } from '@/context/AuthContext'
import { autoLogin, isConfigured } from '@/lib/supabase'

import Setup from '@/pages/Setup'
import Login from '@/pages/Login'
import Conectando from '@/pages/Conectando'
import Dashboard from '@/pages/Dashboard'
import Objetivos from '@/pages/Objetivos'
import Proyectos from '@/pages/Proyectos'
import Tareas from '@/pages/Tareas'
import Sprints from '@/pages/Sprints'
import Gimnasio from '@/pages/Gimnasio'
import Viajes from '@/pages/Viajes'
import Ajustes from '@/pages/Ajustes'

// Los gráficos arrastran una librería pesada: se cargan solo al abrir KPIs.
const Kpis = lazy(() => import('@/pages/Kpis'))

export default function App() {
  const { session, loading } = useAuth()

  // Sin configuración de Supabase no hay nada que hacer: enseñamos las instrucciones.
  if (!isConfigured) return <Setup />

  if (!session) {
    // Con entrada automática la app nunca pide credenciales: mientras conecta (o
    // si la base de datos está despertando) se ve la pantalla de conexión.
    if (autoLogin) return <Conectando />
    // Sin credenciales configuradas sí hace falta el formulario.
    if (loading) {
      return (
        <div className="relative z-10 grid min-h-dvh place-items-center">
          <Spinner label="Abriendo MyOS…" />
        </div>
      )
    }
    return <Login />
  }

  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Dashboard />} />
        <Route path="objetivos" element={<Objetivos />} />
        <Route path="proyectos" element={<Proyectos />} />
        {/* Ruta antigua del banco, por si quedó guardada en algún sitio. */}
        <Route path="banco" element={<Navigate to="/proyectos" replace />} />
        <Route path="tareas" element={<Tareas />} />
        <Route path="sprints" element={<Sprints />} />
        {/* Gimnasio ya no sale en el menu, pero la ruta sigue viva por si
            quieres volver a el escribiendo /gimnasio. */}
        <Route path="gimnasio" element={<Gimnasio />} />
        <Route path="viajes" element={<Viajes />} />
        <Route
          path="kpis"
          element={
            <Suspense fallback={<Spinner label="Cargando gráficos…" />}>
              <Kpis />
            </Suspense>
          }
        />
        <Route path="ajustes" element={<Ajustes />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
