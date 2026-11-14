import { useCallback, useEffect, useState } from 'react'
import { db, friendlyError } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import type { FiscalProfile } from '@/lib/facturas'

/** Tus datos de emisor: una sola fila por usuario. */
export function useFiscalProfile() {
  const { user } = useAuth()
  const [profile, setProfile] = useState<FiscalProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    const { data, error: err } = await db()
      .from('fiscal_profile')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle()
    if (err) setError(friendlyError(err))
    else setProfile((data as FiscalProfile | null) ?? null)
    setLoading(false)
  }, [user])

  useEffect(() => {
    void load()
  }, [load])

  async function save(values: Partial<Omit<FiscalProfile, 'user_id'>>) {
    const { data, error: err } = await db()
      .from('fiscal_profile')
      .upsert({ ...values, user_id: user!.id, updated_at: new Date().toISOString() })
      .select('*')
      .single()
    if (err) throw err
    setProfile(data as FiscalProfile)
    return data as FiscalProfile
  }

  return { profile, loading, error, save, reload: load }
}
