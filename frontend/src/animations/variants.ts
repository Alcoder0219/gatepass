import type { Transition, Variants } from 'framer-motion';

/** One spring for the whole app — consistent physics reads as "designed". */
export const spring: Transition = { type: 'spring', stiffness: 380, damping: 30, mass: 0.8 };
export const softSpring: Transition = { type: 'spring', stiffness: 260, damping: 26 };
export const ease: Transition = { duration: 0.3, ease: [0.16, 1, 0.3, 1] };

/* ─── Page transitions ───────────────────────────────────────────────────── */
export const pageVariants: Variants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: { ...ease, duration: 0.35 } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.18 } },
};

/* ─── Staggered lists — cards, table rows, nav items ─────────────────────── */
export const staggerContainer = (stagger = 0.05, delay = 0): Variants => ({
  initial: {},
  animate: { transition: { staggerChildren: stagger, delayChildren: delay } },
});

export const staggerItem: Variants = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0, transition: softSpring },
};

export const fadeIn: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: ease },
  exit: { opacity: 0, transition: { duration: 0.15 } },
};

export const slideUp: Variants = {
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0, transition: spring },
  exit: { opacity: 0, y: 12, transition: { duration: 0.15 } },
};

export const scaleIn: Variants = {
  initial: { opacity: 0, scale: 0.94 },
  animate: { opacity: 1, scale: 1, transition: spring },
  exit: { opacity: 0, scale: 0.96, transition: { duration: 0.15 } },
};

/* ─── Modal + backdrop ───────────────────────────────────────────────────── */
export const backdropVariants: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.2 } },
  exit: { opacity: 0, transition: { duration: 0.15 } },
};

export const modalVariants: Variants = {
  initial: { opacity: 0, scale: 0.96, y: 16 },
  animate: { opacity: 1, scale: 1, y: 0, transition: spring },
  exit: { opacity: 0, scale: 0.97, y: 8, transition: { duration: 0.15 } },
};

/* ─── Drawer (the mobile sidebar) ────────────────────────────────────────── */
export const drawerVariants: Variants = {
  initial: { x: '-100%' },
  animate: { x: 0, transition: { type: 'spring', stiffness: 400, damping: 40 } },
  exit: { x: '-100%', transition: { duration: 0.2, ease: [0.4, 0, 1, 1] } },
};

/* ─── Dropdown / popover ─────────────────────────────────────────────────── */
export const dropdownVariants: Variants = {
  initial: { opacity: 0, scale: 0.96, y: -6 },
  animate: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.16, ease: [0.16, 1, 0.3, 1] } },
  exit: { opacity: 0, scale: 0.97, y: -4, transition: { duration: 0.12 } },
};

/* ─── Micro-interactions ─────────────────────────────────────────────────── */
export const tapScale = { scale: 0.97 };
export const hoverLift = { y: -2, transition: spring };

/** Count-up-friendly transition for the dashboard stat numbers. */
export const countTransition: Transition = { duration: 0.9, ease: [0.16, 1, 0.3, 1] };
