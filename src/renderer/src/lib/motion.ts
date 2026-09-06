import type { Transition, Variants } from 'framer-motion'

export const easeRay = [0.32, 0.72, 0, 1] as const

export const pageTransition: Transition = { duration: 0.22, ease: easeRay }

export const pageVariants: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -6 }
}

export const listSpring: Transition = { type: 'spring', stiffness: 400, damping: 32 }

export const tapScale = { scale: 0.97 }
