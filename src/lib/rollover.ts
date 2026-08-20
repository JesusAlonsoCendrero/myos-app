import { db } from './supabase'
import { today } from './dates'

/**
 * Lo que dejaste sin hacer en Mi día vuelve al backlog en cuanto cambia el día.
 * Si no, se quedaría en tierra de nadie: fuera de Mi día (porque su fecha ya
 * pasó) y fuera del backlog. Así al día siguiente lo ves y decides si te lo
 * traes otra vez.
 *
 * No toca ninguna que tenga fecha de vencimiento: si ya venció sigue saliendo en
 * Mi día, y si vence más adelante aparecerá sola ese día. Bajarlas al backlog
 * las sacaría de ese automatismo.
 *
 * Devuelve cuántas tareas se han movido.
 */
export async function arrastrarPendientes(userId: string): Promise<number> {
  const iso = today()
  const { data, error } = await db()
    .from('tasks')
    .update({ is_backlog: true, my_day_date: null })
    .eq('user_id', userId)
    .eq('is_backlog', false)
    .neq('status', 'done')
    .not('my_day_date', 'is', null)
    .lt('my_day_date', iso)
    .is('due_date', null)
    .select('id')
  if (error) throw error
  return data?.length ?? 0
}
