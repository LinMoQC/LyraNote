import type { Transition, Variants } from "framer-motion"

// Spring presets
export const springs = {
  snappy: { type: "spring", stiffness: 420, damping: 32 } satisfies Transition,
  smooth: { type: "spring", stiffness: 300, damping: 28 } satisfies Transition,
  gentle: { type: "spring", stiffness: 220, damping: 26 } satisfies Transition,
  bouncy: { type: "spring", stiffness: 480, damping: 22, mass: 0.8 } satisfies Transition,
  slow:   { type: "spring", stiffness: 180, damping: 30 } satisfies Transition,
}

// Page transition variants
export const pageVariants: Variants = {
  initial: { opacity: 0, y: 8, scale: 0.99 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit:    { opacity: 0, y: -6, scale: 0.99 },
}

export const pageTransition = springs.smooth

// Slide in from right (tab open)
export const slideInRight: Variants = {
  initial: { opacity: 0, x: 24 },
  animate: { opacity: 1, x: 0 },
  exit:    { opacity: 0, x: -16 },
}

// Fade scale (modals, popovers)
export const fadeScale: Variants = {
  initial: { opacity: 0, scale: 0.94 },
  animate: { opacity: 1, scale: 1 },
  exit:    { opacity: 0, scale: 0.96 },
}

// Stagger children
export const staggerContainer: Variants = {
  animate: {
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.05,
    },
  },
}

export const staggerItem: Variants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
}

// Sidebar collapse
export const sidebarVariants = {
  collapsed: { width: 52 },
  expanded:  { width: 220 },
}
