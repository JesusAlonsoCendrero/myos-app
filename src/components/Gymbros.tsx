import { useState } from 'react'
import { Pencil, Trash2, UserPlus } from 'lucide-react'
import {
  Button,
  Card,
  cx,
  EmptyState,
  ErrorNote,
  Field,
  IconButton,
  Input,
  Modal,
  SectionTitle,
  Spinner,
  Textarea,
  useConfirm,
  useToast,
} from './ui'
import { useCollection } from '@/hooks/useCollection'
import { friendlyError } from '@/lib/supabase'
import { BUDDY_EMOJIS, type Buddy } from '@/lib/types'
import { CHART_COLORS } from '@/lib/palette'

/**
 * La gente con la que entrenas. Aquí solo se dan de alta; lo interesante pasa
 * al empezar una rutina: eliges quién viene y sus series quedan a su nombre.
 */
export default function Gymbros() {
  const toast = useToast()
  const confirm = useConfirm()

  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Buddy | null>(null)
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState<string>(BUDDY_EMOJIS[0])
  const [notes, setNotes] = useState('')

  const buddies = useCollection<Buddy>('buddies', { shape: (q) => q.order('name') })

  function openNew() {
    setEditing(null)
    setName('')
    setEmoji(BUDDY_EMOJIS[buddies.rows.length % BUDDY_EMOJIS.length])
    setNotes('')
    setOpen(true)
  }

  function openEdit(b: Buddy) {
    setEditing(b)
    setName(b.name)
    setEmoji(b.emoji)
    setNotes(b.notes ?? '')
    setOpen(true)
  }

  async function save() {
    const clean = name.trim()
    if (!clean) return
    try {
      const values = { name: clean, emoji, notes: notes.trim() || null }
      if (editing) await buddies.update(editing.id, values)
      else
        await buddies.insert({
          ...values,
          color: CHART_COLORS[buddies.rows.length % CHART_COLORS.length],
        })
      setOpen(false)
      toast.success(editing ? 'Perfil actualizado' : `${clean} añadido`)
    } catch (e) {
      toast.error(friendlyError(e))
    }
  }

  async function remove(b: Buddy) {
    const ok = await confirm({
      title: `¿Borrar a ${b.name}?`,
      message: 'También se borran las series que registraste a su nombre.',
      confirmLabel: 'Borrar',
      danger: true,
    })
    if (!ok) return
    try {
      await buddies.remove(b.id)
      toast.success('Perfil borrado')
    } catch (e) {
      toast.error(friendlyError(e))
    }
  }

  return (
    <div className="space-y-5">
      <SectionTitle
        hint="Al empezar una rutina eliges quién viene y le vas apuntando sus series."
        action={
          <Button variant="primary" icon={<UserPlus className="size-4" />} onClick={openNew}>
            <span className="hidden sm:inline">Nuevo gymbro</span>
            <span className="sm:hidden">Nuevo</span>
          </Button>
        }
      >
        Gymbros
      </SectionTitle>

      {buddies.error && <ErrorNote>{buddies.error}</ErrorNote>}

      {buddies.loading ? (
        <Spinner />
      ) : buddies.rows.length === 0 ? (
        <EmptyState
          icon={<UserPlus className="size-8" />}
          title="Todavía no hay nadie"
          description="Añade a quien entrene contigo. Cuando empieces una rutina podrás elegirlo y registrar sus pesos junto a los tuyos."
          action={
            <Button variant="primary" onClick={openNew}>
              Añadir al primero
            </Button>
          }
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {buddies.rows.map((b) => (
            <Card as="li" key={b.id} className="flex items-center gap-3 p-4">
              <span
                className="grid size-14 shrink-0 place-items-center rounded-2xl text-2xl"
                style={{ backgroundColor: `${b.color ?? CHART_COLORS[0]}22` }}
              >
                {b.emoji}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-display text-lg font-bold">{b.name}</p>
                <p className="truncate text-[12px] text-ink-3">
                  {b.notes || 'Compañero de entreno'}
                </p>
              </div>
              <IconButton label={`Editar a ${b.name}`} onClick={() => openEdit(b)}>
                <Pencil className="size-4" />
              </IconButton>
              <IconButton label={`Borrar a ${b.name}`} onClick={() => void remove(b)}>
                <Trash2 className="size-4" />
              </IconButton>
            </Card>
          ))}
        </ul>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? 'Editar gymbro' : 'Nuevo gymbro'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={() => void save()}>
              {editing ? 'Guardar' : 'Añadir'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Nombre">
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void save()}
              placeholder="Álvaro"
            />
          </Field>

          <Field label="Icono">
            <div className="flex flex-wrap gap-2">
              {BUDDY_EMOJIS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => setEmoji(e)}
                  className={cx(
                    'grid size-11 place-items-center rounded-2xl border text-xl transition-colors',
                    emoji === e
                      ? 'border-accent bg-accent-soft'
                      : 'border-line bg-surface-2 hover:border-line-strong',
                  )}
                >
                  {e}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Notas" hint="Opcional.">
            <Textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Entrena empuje los lunes, viene de lesión de hombro…"
            />
          </Field>
        </div>
      </Modal>
    </div>
  )
}
