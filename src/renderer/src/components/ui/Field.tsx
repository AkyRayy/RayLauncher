import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'
import { cn } from '@renderer/lib/cn'

export function SettingRow({
  title,
  hint,
  control,
  warning
}: {
  title: string
  hint?: string
  control: ReactNode
  warning?: string
}): React.ReactElement {
  return (
    <div className="flex items-center justify-between gap-8 px-4 py-2.5">
      <div className="min-w-0 py-0.5">
        <div className="text-sm text-ink">{title}</div>
        {hint && <p className="mt-0.5 max-w-md text-xs text-muted">{hint}</p>}
        {warning && <p className="mt-0.5 max-w-md text-xs text-warning">{warning}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2">{control}</div>
    </div>
  )
}

const fieldBase =
  'no-drag rounded-sm bg-surface px-2 text-sm text-ink placeholder:text-faint ' +
  'shadow-[inset_0_0_0_0.5px_var(--hairline),inset_0_1px_1px_rgb(0_0_0/0.04)] ' +
  'transition-shadow duration-100 focus:outline-none ' +
  'focus:shadow-[inset_0_0_0_1px_var(--accent),0_0_0_3px_color-mix(in_srgb,var(--accent)_35%,transparent)]'

export function TextInput({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>): React.ReactElement {
  return <input className={cn(fieldBase, 'h-[26px]', className)} {...props} />
}

export function TextArea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>): React.ReactElement {
  return (
    <textarea className={cn(fieldBase, 'py-1.5 font-mono text-xs leading-5', className)} {...props} />
  )
}

export function Select({
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>): React.ReactElement {
  return (
    <select
      className={cn(
        'control-face no-drag h-[26px] rounded-sm pl-2.5 pr-6 text-sm text-ink focus:outline-none',
        className
      )}
      {...props}
    >
      {children}
    </select>
  )
}

export function Slider({
  value,
  min,
  max,
  step = 1,
  onChange,
  label,
  display
}: {
  value: number
  min: number
  max: number
  step?: number
  onChange: (value: number) => void
  label: string
  display: string
}): React.ReactElement {
  const fill = max > min ? ((value - min) / (max - min)) * 100 : 0

  return (
    <div className="flex items-center gap-3">
      <input
        type="range"
        aria-label={label}
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) => onChange(Number(event.target.value))}
        style={{ '--slider-fill': fill } as React.CSSProperties}
        className="no-drag w-48 cursor-pointer"
      />
      <span className="w-24 text-right font-mono text-xs text-muted tabular-nums">{display}</span>
    </div>
  )
}
