import { motion } from 'framer-motion'
import { cn } from '@renderer/lib/cn'

interface SwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  disabled?: boolean
}

export function Switch({ checked, onChange, label, disabled }: SwitchProps): React.ReactElement {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'no-drag relative h-[22px] w-[38px] shrink-0 rounded-full transition-colors duration-150 disabled:opacity-40',
        checked ? 'bg-accent' : 'bg-fill'
      )}
      style={{ boxShadow: checked ? undefined : 'inset 0 0 0 0.5px var(--hairline)' }}
    >
      <motion.span
        layout
        transition={{ type: 'spring', stiffness: 700, damping: 42 }}
        className="absolute top-[2px] h-[18px] w-[18px] rounded-full bg-white"
        style={{
          left: checked ? 18 : 2,
          boxShadow: '0 0 0 0.5px rgb(0 0 0 / 0.12), 0 1px 3px rgb(0 0 0 / 0.28)'
        }}
      />
    </button>
  )
}
