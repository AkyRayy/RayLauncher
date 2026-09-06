import { motion } from 'framer-motion'
import { cn } from '@renderer/lib/cn'

export interface SegmentedOption<T extends string> {
  value: T
  label: string
}

interface SegmentedControlProps<T extends string> {
  value: T
  options: ReadonlyArray<SegmentedOption<T>>
  onChange: (value: T) => void
  ariaLabel: string
  size?: 'sm' | 'md'
}

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  size = 'md'
}: SegmentedControlProps<T>): React.ReactElement {
  const groupId = `segmented-${ariaLabel.replace(/\s+/g, '-').toLowerCase()}`
  const activeIndex = options.findIndex((option) => option.value === value)

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        'no-drag inline-flex rounded-md bg-fill p-[2px]',
        size === 'sm' ? 'h-[26px]' : 'h-[30px]'
      )}
    >
      {options.map((option, index) => {
        const selected = option.value === value
        const divider = index > 0 && index !== activeIndex && index !== activeIndex + 1

        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              'relative rounded-sm px-3 font-medium transition-colors duration-100',
              size === 'sm' ? 'text-xs' : 'text-sm',
              selected ? 'text-ink' : 'text-muted hover:text-ink'
            )}
          >
            {divider && (
              <span
                aria-hidden
                className="absolute inset-y-[3px] left-0 w-px bg-hairline"
              />
            )}
            {selected && (
              <motion.span
                layoutId={groupId}
                transition={{ type: 'spring', stiffness: 520, damping: 40 }}
                className="control-face absolute inset-0 rounded-sm"
              />
            )}
            <span className="relative z-10 whitespace-nowrap">{option.label}</span>
          </button>
        )
      })}
    </div>
  )
}
