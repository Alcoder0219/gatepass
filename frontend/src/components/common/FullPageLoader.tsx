import { motion } from 'framer-motion';
import { Logo } from '@/components/common/Logo';
import { BRAND } from '@/config/brand';

/** Shown while the session is being resolved on boot, and as the lazy-route fallback. */
export const FullPageLoader = ({ message = 'Loading…' }: { message?: string }) => (
  <div className="flex min-h-dvh flex-col items-center justify-center gap-6">
    <div className="relative">
      <motion.div
        animate={{ scale: [1, 1.6], opacity: [0.5, 0] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: 'easeOut' }}
        className="absolute inset-0 rounded-2xl bg-brand-500"
      />
      <motion.div
        animate={{ y: [0, -6, 0] }}
        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        className="relative"
      >
        <Logo className="h-16 w-16 rounded-2xl" />
      </motion.div>
    </div>

    <div className="text-center">
      <p className="text-lg font-bold tracking-tight text-content">{BRAND.name}</p>
      <p className="mt-1 text-sm text-content-muted">{message}</p>
    </div>

    <div className="h-1 w-40 overflow-hidden rounded-full bg-content/10">
      <motion.div
        animate={{ x: ['-100%', '100%'] }}
        transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
        className="h-full w-1/2 rounded-full bg-brand-gradient"
      />
    </div>
  </div>
);

export default FullPageLoader;
