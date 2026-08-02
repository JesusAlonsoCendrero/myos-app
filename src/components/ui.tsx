import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'motion/react'
import { AlertTriangle, Check, ChevronDown, Loader2, X } from 'lucide-react'

export const cx = (...parts: Array<string | false | null | undefined>) =>
  parts.filter(Boolean).join(' ')

/** Muelle corto y firme: la personalidad de movimiento de toda la app. */
const SPRING = { type: 'spring', stiffness: 480, damping: 38, mass: 0.7 } as const

/* -------------------------------------------------------------------------- */
/*  Botones                                                                    */
/* -------------------------------------------------------------------------- */

type ButtonVariant = 'primary' | 'outline' | 'ghost' | 'danger' | 'soft'
type ButtonSize = 'sm' | 'md' | 'lg'

const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  // El primario lleva el degradado de marca y un halo que crece al pasar.
  primary:
    'text-accent-ink [background:var(--grad)] shadow-glow hover:brightness-110 hover:shadow-lift border border-transparent',
  outline:
    'border border-line-strong bg-surface text-ink hover:border-accent/60 hover:bg-surface-2',
  ghost: 'text-ink-2 hover:text-ink hover:bg-surface-2 border border-transparent',
  danger: 'bg-bad text-white hover:brightness-110 border border-transparent',
  soft: 'bg-accent-soft text-accent border border-transparent hover:brightness-105',
}

const BUTTON_SIZE: Record<ButtonSize, string> = {
  sm: 'h-8 px-3.5 text-[13px] gap-1.5',
  md: 'h-10 px-4.5 text-sm gap-2',
  lg: 'h-12 px-6 text-base gap-2',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  icon?: ReactNode
}

export function Button({
  variant = 'outline',
  size = 'md',
  loading,
  icon,
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cx(
        'inline-flex items-center justify-center rounded-full font-semibold whitespace-nowrap select-none',
        'transition-[background,color,filter,transform,box-shadow,border-color] duration-200',
        'active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45',
        BUTTON_VARIANT[variant],
        BUTTON_SIZE[size],
        className,
      )}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : icon}
      {children}
    </button>
  )
}

export function IconButton({
  label,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      {...rest}
      aria-label={label}
      title={label}
      className={cx(
        'inline-grid size-9 place-items-center rounded-xl text-ink-2',
        'transition-all duration-150 hover:bg-surface-2 hover:text-ink active:scale-90',
        'disabled:pointer-events-none disabled:opacity-40',
        className,
      )}
    >
      {children}
    </button>
  )
}

/* -------------------------------------------------------------------------- */
/*  Superficies                                                                */
/* -------------------------------------------------------------------------- */

export function Card({
  className,
  children,
  style,
  id,
  as: Tag = 'div',
}: {
  className?: string
  children: ReactNode
  style?: CSSProperties
  /** Útil para poder hacer scroll hasta una tarjeta concreta. */
  id?: string
  as?: 'div' | 'section' | 'article' | 'li'
}) {
  return (
    <Tag
      id={id}
      style={style}
      className={cx(
        'relative rounded-3xl bg-surface shadow-card transition-shadow duration-300',
        className,
      )}
    >
      {children}
    </Tag>
  )
}

export function SectionTitle({
  children,
  hint,
  action,
}: {
  children: ReactNode
  hint?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4">
      <div className="min-w-0">
        <h2 className="text-2xl leading-tight tracking-tight sm:text-3xl">{children}</h2>
        {hint && <p className="mt-1 text-[13px] text-ink-3">{hint}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="relative flex flex-col items-center justify-center overflow-hidden rounded-3xl border border-dashed border-line-strong px-6 py-14 text-center">
      {/* Halo que respira detrás del icono: el vacío también tiene vida. */}
      <div
        aria-hidden
        className="pointer-events-none absolute top-6 size-40 animate-breathe rounded-full blur-3xl"
        style={{ background: 'var(--grad)', opacity: 0.14 }}
      />
      {icon && (
        <div className="relative mb-4 grid size-16 animate-float place-items-center rounded-3xl bg-surface text-accent shadow-card">
          {icon}
        </div>
      )}
      <p className="relative font-display text-xl font-bold">{title}</p>
      {description && (
        <p className="relative mt-1.5 max-w-sm text-sm leading-relaxed text-ink-3">{description}</p>
      )}
      {action && <div className="relative mt-6">{action}</div>}
    </div>
  )
}

/** Tres puntos con retardo escalonado: más amable que una rueda dentada. */
export function Spinner({ label = 'Cargando…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-12 text-sm text-ink-3" role="status">
      <span className="flex gap-1" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="size-2 animate-beat rounded-full bg-accent"
            style={{ animationDelay: `${i * 0.18}s` }}
          />
        ))}
      </span>
      {label}
    </div>
  )
}

export function ErrorNote({ children }: { children: ReactNode }) {
  if (!children) return null
  return (
    <div className="flex animate-pop items-start gap-2.5 rounded-2xl border border-bad/30 bg-bad/8 px-4 py-3 text-sm text-bad">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Etiquetas                                                                  */
/* -------------------------------------------------------------------------- */

export function Badge({
  children,
  color,
  tone = 'neutral',
  className,
}: {
  children: ReactNode
  /** Hex explícito: pinta un punto de color. */
  color?: string
  tone?: 'neutral' | 'accent' | 'good' | 'warn' | 'bad'
  className?: string
}) {
  const tones = {
    neutral: 'border-line bg-surface-2 text-ink-2',
    accent: 'border-transparent bg-accent-soft text-accent',
    good: 'border-good/25 bg-good/10 text-good',
    warn: 'border-warn/25 bg-warn/10 text-warn',
    bad: 'border-bad/25 bg-bad/10 text-bad',
  }
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-bold tracking-wide whitespace-nowrap',
        color ? 'border-line bg-surface-2 text-ink-2' : tones[tone],
        className,
      )}
    >
      {color && (
        <span
          className="size-2 shrink-0 rounded-full"
          style={{ backgroundColor: color }}
          aria-hidden
        />
      )}
      {children}
    </span>
  )
}

/* -------------------------------------------------------------------------- */
/*  Progreso                                                                   */
/* -------------------------------------------------------------------------- */

export function ProgressBar({
  value,
  color,
  className,
  height = 8,
}: {
  /** 0–100 */
  value: number
  color?: string
  className?: string
  height?: number
}) {
  const pct = Math.max(0, Math.min(100, Math.round(value)))
  return (
    <div
      className={cx('w-full overflow-hidden rounded-full bg-surface-3', className)}
      style={{ height }}
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full transition-[width] duration-700 ease-out"
        style={{
          width: `${pct}%`,
          background: color ?? 'var(--grad)',
        }}
      />
    </div>
  )
}

export function ProgressRing({
  value,
  size = 56,
  stroke = 5,
  color,
  children,
}: {
  value: number
  size?: number
  stroke?: number
  color?: string
  children?: ReactNode
}) {
  const pct = Math.max(0, Math.min(100, value))
  const r = (size - stroke) / 2
  const circumference = 2 * Math.PI * r
  const gid = useId()

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--accent)" />
            <stop offset="100%" stopColor="var(--accent-2)" />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--surface-3)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color ?? `url(#${gid})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - pct / 100)}
          style={{ transition: 'stroke-dashoffset 800ms cubic-bezier(0.22,1,0.36,1)' }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-[12px] font-bold tnum">
        {children ?? `${Math.round(pct)}%`}
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Formularios                                                                */
/* -------------------------------------------------------------------------- */

const FIELD_BASE =
  'w-full rounded-2xl border border-line bg-surface-2 px-3.5 py-2.5 text-sm text-ink ' +
  'placeholder:text-ink-3 transition-all duration-200 focus:border-accent focus:bg-surface ' +
  'focus:shadow-[0_0_0_4px_color-mix(in_oklab,var(--accent)_14%,transparent)] ' +
  'focus:outline-none disabled:opacity-50'

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label?: string
  hint?: string
  children: ReactNode
  className?: string
}) {
  return (
    <label className={cx('block', className)}>
      {label && (
        <span className="mb-1.5 block text-[12px] font-bold tracking-wide text-ink-2 uppercase">
          {label}
        </span>
      )}
      {children}
      {hint && <span className="mt-1 block text-[12px] text-ink-3">{hint}</span>}
    </label>
  )
}

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...rest} className={cx(FIELD_BASE, className)} />
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea {...rest} rows={rest.rows ?? 3} className={cx(FIELD_BASE, 'resize-y', className)} />
  )
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className="relative block">
      <select
        {...rest}
        className={cx(FIELD_BASE, 'cursor-pointer appearance-none pr-9', className)}
      >
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-ink-3"
        aria-hidden
      />
    </span>
  )
}

export function Checkbox({
  checked,
  onChange,
  label,
  color,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label?: ReactNode
  color?: string
}) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2.5 select-none">
      <span className="relative grid size-5 shrink-0 place-items-center">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="peer sr-only"
        />
        <span
          className={cx(
            'size-5 rounded-lg border-2 transition-all duration-200',
            checked ? 'scale-105 border-transparent' : 'border-line-strong bg-surface',
          )}
          style={checked ? { background: color ?? 'var(--grad)' } : undefined}
        />
        <AnimatePresence>
          {checked && (
            <motion.span
              initial={{ scale: 0, rotate: -30 }}
              animate={{ scale: 1, rotate: 0 }}
              exit={{ scale: 0 }}
              transition={SPRING}
              className="pointer-events-none absolute"
            >
              <Check className="size-3.5 stroke-[3.5] text-white" />
            </motion.span>
          )}
        </AnimatePresence>
      </span>
      {label && <span className="text-sm">{label}</span>}
    </label>
  )
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T
  onChange: (v: T) => void
  options: Array<{ value: T; label: string; count?: number }>
  className?: string
}) {
  // La píldora activa se desliza entre opciones con un muelle.
  const groupId = useId()

  return (
    <div
      role="tablist"
      className={cx(
        'inline-flex min-w-0 gap-1 overflow-x-auto rounded-2xl border border-line bg-surface-2 p-1',
        className,
      )}
    >
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={cx(
              'relative rounded-xl px-3.5 py-1.5 text-[13px] font-semibold whitespace-nowrap transition-colors duration-200',
              active ? 'text-ink' : 'text-ink-3 hover:text-ink-2',
            )}
          >
            {active && (
              <motion.span
                layoutId={`seg-${groupId}`}
                transition={SPRING}
                className="absolute inset-0 rounded-xl bg-surface shadow-card"
                aria-hidden
              />
            )}
            <span className="relative">
              {o.label}
              {o.count !== undefined && (
                <span className={cx('ml-1.5 tnum', active ? 'text-accent' : 'text-ink-3')}>
                  {o.count}
                </span>
              )}
            </span>
          </button>
        )
      })}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Modal / hoja inferior en móvil                                             */
/* -------------------------------------------------------------------------- */

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}: {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children: ReactNode
  footer?: ReactNode
  size?: 'md' | 'lg'
}) {
  const titleId = useId()

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
        className="absolute inset-0 bg-black/50 backdrop-blur-[3px]"
        onClick={onClose}
        aria-hidden
      />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        initial={{ opacity: 0, y: 28, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={SPRING}
        className={cx(
          'relative flex max-h-[92dvh] w-full flex-col overflow-hidden',
          'rounded-t-3xl bg-surface shadow-lift sm:rounded-3xl',
          size === 'lg' ? 'sm:max-w-3xl' : 'sm:max-w-lg',
        )}
      >
        <header className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-xl leading-tight">
              {title}
            </h2>
            {description && <p className="mt-0.5 text-[13px] text-ink-3">{description}</p>}
          </div>
          <IconButton label="Cerrar" onClick={onClose}>
            <X className="size-5" />
          </IconButton>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>

        {footer && (
          <footer className="safe-bottom flex justify-end gap-2 border-t border-line bg-surface-2 px-6 py-3.5">
            {footer}
          </footer>
        )}
      </motion.div>
    </div>,
    document.body,
  )
}

/* -------------------------------------------------------------------------- */
/*  Panel lateral                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Cajón que entra por la derecha sin tapar la lista, para ver el detalle de algo
 * mientras sigues viendo dónde estabas. En móvil ocupa todo el ancho.
 */
export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = 'md',
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  subtitle?: ReactNode
  children: ReactNode
  footer?: ReactNode
  width?: 'md' | 'lg'
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* En escritorio el velo es tenue: la gracia es seguir viendo la lista. */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
        className="absolute inset-0 bg-black/50 lg:bg-black/25"
        onClick={onClose}
        aria-hidden
      />
      <motion.aside
        role="dialog"
        aria-modal="true"
        initial={{ x: 64, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={SPRING}
        className={cx(
          'relative flex h-full w-full flex-col border-l border-line bg-surface shadow-lift',
          width === 'lg' ? 'sm:max-w-2xl' : 'sm:max-w-md',
        )}
      >
        <header className="safe-top flex items-start justify-between gap-4 border-b border-line px-6 py-4">
          <div className="min-w-0">
            <h2 className="text-xl leading-tight">{title}</h2>
            {subtitle && <div className="mt-0.5 text-[13px] text-ink-3">{subtitle}</div>}
          </div>
          <IconButton label="Cerrar" onClick={onClose}>
            <X className="size-5" />
          </IconButton>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>

        {footer && (
          <footer className="safe-bottom flex items-center gap-2 border-t border-line bg-surface-2 px-6 py-3.5">
            {footer}
          </footer>
        )}
      </motion.aside>
    </div>,
    document.body,
  )
}

/* -------------------------------------------------------------------------- */
/*  Confirmación (sustituye a window.confirm)                                  */
/* -------------------------------------------------------------------------- */

type ConfirmRequest = {
  title: string
  message?: string
  confirmLabel?: string
  danger?: boolean
}

const ConfirmContext = createContext<(req: ConfirmRequest) => Promise<boolean>>(
  async () => false,
)

export const useConfirm = () => useContext(ConfirmContext)

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [req, setReq] = useState<ConfirmRequest | null>(null)
  const resolver = useRef<((v: boolean) => void) | null>(null)

  const confirm = useCallback((r: ConfirmRequest) => {
    setReq(r)
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve
    })
  }, [])

  const settle = (v: boolean) => {
    resolver.current?.(v)
    resolver.current = null
    setReq(null)
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal
        open={Boolean(req)}
        onClose={() => settle(false)}
        title={req?.title ?? ''}
        footer={
          <>
            <Button variant="ghost" onClick={() => settle(false)}>
              Cancelar
            </Button>
            <Button variant={req?.danger ? 'danger' : 'primary'} onClick={() => settle(true)}>
              {req?.confirmLabel ?? 'Confirmar'}
            </Button>
          </>
        }
      >
        <p className="text-sm leading-relaxed text-ink-2">
          {req?.message ?? 'Esta acción no se puede deshacer.'}
        </p>
      </Modal>
    </ConfirmContext.Provider>
  )
}

/* -------------------------------------------------------------------------- */
/*  Avisos temporales                                                          */
/* -------------------------------------------------------------------------- */

type Toast = { id: number; message: string; tone: 'ok' | 'error' }

const ToastContext = createContext<{
  success: (m: string) => void
  error: (m: string) => void
}>({ success: () => {}, error: () => {} })

export const useToast = () => useContext(ToastContext)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([])
  const nextId = useRef(0)

  const push = useCallback((message: string, tone: Toast['tone']) => {
    const id = nextId.current++
    setItems((prev) => [...prev, { id, message, tone }])
    setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), 4000)
  }, [])

  const api = useMemo(
    () => ({
      success: (m: string) => push(m, 'ok'),
      error: (m: string) => push(m, 'error'),
    }),
    [push],
  )

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex flex-col items-center gap-2 px-4 sm:bottom-6"
        role="status"
        aria-live="polite"
      >
        <AnimatePresence>
          {items.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 24, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.95 }}
              transition={SPRING}
              className={cx(
                'pointer-events-auto flex max-w-sm items-center gap-2.5 rounded-2xl px-4 py-3 text-sm font-medium shadow-lift',
                t.tone === 'ok' ? 'glass text-ink' : 'bg-bad text-white',
              )}
            >
              {t.tone === 'ok' ? (
                <span className="grid size-5 shrink-0 place-items-center rounded-full bg-good/15">
                  <Check className="size-3.5 text-good" />
                </span>
              ) : (
                <AlertTriangle className="size-4 shrink-0" />
              )}
              {t.message}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  )
}
