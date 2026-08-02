import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import AppShell from '@/components/AppShell'
import { Spinner } from '@/components/ui'
import { useAuth } from '@/context/AuthContext'
import { isConfigured } from '@/lib/supabase'

import Setup from '@/pages/Setup'
import Login from '@/pages/Login'
import Dashboard from '@/pages/Dashboard'
import Objetivos from '@/pages/Objetivos'
import Proyectos from '@/pages/Proyectos'
import Tareas from '@/pages/Tareas'
import Gimnasio from '@/pages/Gimnasio'
import Viajes from '@/pages/Viajes'
import Ajustes from '@/pages/Ajustes'

// Los gráficos arrastran una librería pesada: se cargan solo al abrir KPIs.
const Kpis = lazy(() => import('@/pages/Kpis'))

export default function App() {
  const { session, loading } = useAuth()


  // Sin .env no hay nada que hacer: enseñamos las instrucciones.
  if (!isConfigured) return <Setup />

  if (loading) {
    return (
      <div className="relative z-10 grid min-h-dvh place-items-center">
        <Spinner label="Abriendo tu brújula…" />
      </div>
    )
  }

  // Si la entrada automática funciona, esto no se ve nunca. Solo aparece cuando
  // falla, y entonces lo útil es poder entrar a mano y ver el motivo.
  if (!session) return <Login />

  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Dashboard />} />
        <Route path="objetivos" element={<Objetivos />} />
        <Route path="proyectos" element={<Proyectos />} />
        {/* Ruta antigua del banco, por si quedó guardada en algún sitio. */}
        <Route path="banco" element={<Navigate to="/proyectos" replace />} />
        <Route path="tareas" element={<Tareas />} />
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
