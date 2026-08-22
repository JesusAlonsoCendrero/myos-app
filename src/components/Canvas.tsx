import { useState } from 'react'
import { Check, Plus, Trash2 } from 'lucide-react'
import {
  Button,
  Card,
  Checkbox,
  cx,
  IconButton,
  Input,
  Spinner,
  Textarea,
  useToast,
} from './ui'
import { useCollection } from '@/hooks/useCollection'
import { friendlyError } from '@/lib/supabase'
import {
  CANVAS_KINDS,
  type CanvasBlock,
  type CanvasKind,
  type CanvasParent,
  type ChecklistItem,
} from '@/lib/types'

/**
 * Tablero de tarjetas libres colgado de un objetivo, un viaje o un proyecto.
 * Sirve igual para el guion de un vídeo, las ideas de miniatura o los datos de
 * un vuelo. Se guarda al salir del campo, sin botón de guardar.
 */
export default function Canvas({
  parentType,
  parentId,
  emptyHint,
  grande = false,
}: {
  parentType: CanvasParent
  parentId: string
  emptyHint?: string
  /** En una página entera caben más columnas y tarjetas más altas. */
  grande?: boolean
}) {
  const toast = useToast()
  const [adding, setAdding] = useState(false)

  const blocks = useCollection<CanvasBlock>('canvas_blocks', {
    shape: (q) =>
      q.eq('parent_type', parentType).eq('parent_id', parentId).order('sort_order'),
    deps: [parentType, parentId],
  })

  async function add(kind: CanvasKind) {
    setAdding(true)
    try {
      await blocks.insert({
        parent_type: parentType,
        parent_id: parentId,
        kind,
        title: '',
        content: '',
        checklist: [],
        sort_order: blocks.rows.length,
      })
    } catch (e) {
      toast.error(friendlyError(e))
    } finally {
      setAdding(false)
    }
  }

  const save = (id: string, patch: Record<string, unknown>) =>
    void blocks
      .update(id, { ...patch, updated_at: new Date().toISOString() })
      .catch((e) => toast.error(friendlyError(e)))

  return (
    <div className="space-y-4">
      {/* Barra de tipos: cada botón crea una tarjeta ya del tipo elegido. */}
      <div className="flex flex-wrap gap-2">
        {CANVAS_KINDS.map((k) => (
          <button
            key={k.key}
            disabled={adding}
            onClick={() => void add(k.key)}
            className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-[13px] font-medium transition-colors hover:border-accent hover:bg-accent-soft hover:text-accent disabled:opacity-50"
          >
            <span aria-hidden>{k.emoji}</span>
            {k.label}
            <Plus className="size-3.5" />
          </button>
        ))}
      </div>

      {blocks.loading ? (
        <Spinner label="Abriendo el lienzo…" />
      ) : blocks.rows.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-line-strong px-5 py-10 text-center">
          <p className="text-sm leading-relaxed text-ink-3">
            {emptyHint ?? 'Añade tarjetas con lo que se te ocurra. Nadie las va a leer más que tú.'}
          </p>
        </div>
      ) : (
        <div
          className={cx(
            'columns-1 gap-3 [&>*]:mb-3 [&>*]:break-inside-avoid',
            grande ? 'sm:columns-2 xl:columns-3' : 'sm:columns-2',
          )}
        >
          {blocks.rows.map((block) => (
            <BlockCard
              key={block.id}
              block={block}
              grande={grande}
              onSave={(patch) => save(block.id, patch)}
              onDelete={() =>
                void blocks.remove(block.id).catch((e) => toast.error(friendlyError(e)))
              }
            />
          ))}
        </div>
      )}
    </div>
  )
}

/* -------------------------------------------------------------------------- */

function BlockCard({
  block,
  onSave,
  onDelete,
  grande = false,
}: {
  block: CanvasBlock
  onSave: (patch: Record<string, unknown>) => void
  onDelete: () => void
  grande?: boolean
}) {
  const meta = CANVAS_KINDS.find((k) => k.key === block.kind) ?? CANVAS_KINDS[0]
  const [title, setTitle] = useState(block.title ?? '')
  const [content, setContent] = useState(block.content ?? '')
  const [newItem, setNewItem] = useState('')

  const checklist: ChecklistItem[] = Array.isArray(block.checklist) ? block.checklist : []
  const isList = block.kind === 'lista'
  const isLink = block.kind === 'enlace'

  const setChecklist = (next: ChecklistItem[]) => onSave({ checklist: next })

  return (
    <Card className="p-4">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-base" aria-hidden>
          {meta.emoji}
        </span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => title !== (block.title ?? '') && onSave({ title: title.trim() || null })}
          placeholder={meta.label}
          className="min-w-0 flex-1 bg-transparent font-display text-[15px] font-bold placeholder:font-normal placeholder:text-ink-3 focus:outline-none"
        />
        <IconButton label="Borrar tarjeta" className="size-8" onClick={onDelete}>
          <Trash2 className="size-3.5" />
        </IconButton>
      </div>

      {isList ? (
        <div className="space-y-1.5">
          {checklist.map((item, i) => (
            <div key={i} className="flex items-center gap-2.5">
              <Checkbox
                checked={item.done}
                onChange={(v) =>
                  setChecklist(checklist.map((x, j) => (i === j ? { ...x, done: v } : x)))
                }
              />
              <span
                className={cx(
                  'min-w-0 flex-1 text-[13px]',
                  item.done && 'text-ink-3 line-through decoration-2',
                )}
              >
                {item.text}
              </span>
              <IconButton
                label={`Quitar ${item.text}`}
                className="size-7"
                onClick={() => setChecklist(checklist.filter((_, j) => j !== i))}
              >
                <Trash2 className="size-3" />
              </IconButton>
            </div>
          ))}
          <div className="flex gap-1.5 pt-1">
            <Input
              value={newItem}
              onChange={(e) => setNewItem(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter' || !newItem.trim()) return
                setChecklist([...checklist, { text: newItem.trim(), done: false }])
                setNewItem('')
              }}
              placeholder="Añadir y pulsar Enter…"
              className="h-8 py-0 text-[13px]"
            />
            <Button
              size="sm"
              variant="ghost"
              className="size-8 px-0"
              onClick={() => {
                if (!newItem.trim()) return
                setChecklist([...checklist, { text: newItem.trim(), done: false }])
                setNewItem('')
              }}
            >
              <Check className="size-4" />
            </Button>
          </div>
        </div>
      ) : (
        <>
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onBlur={() => content !== (block.content ?? '') && onSave({ content: content || null })}
            rows={isLink ? 2 : grande ? 9 : 5}
            placeholder={
              isLink
                ? 'https://…'
                : block.kind === 'guion'
                  ? 'Gancho, desarrollo, cierre…'
                  : 'Escribe aquí'
            }
            className={cx(
              'border-0 bg-transparent px-0 py-0 leading-relaxed focus:bg-transparent',
              grande ? 'text-sm' : 'text-[13px]',
            )}
          />
          {isLink && content.startsWith('http') && (
            <a
              href={content}
              target="_blank"
              rel="noreferrer noopener"
              className="mt-1 inline-block truncate text-[12px] font-semibold text-accent underline-offset-2 hover:underline"
            >
              Abrir enlace ↗
            </a>
          )}
        </>
      )}
    </Card>
  )
}
