import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Compass, LayoutDashboard, LifeBuoy } from 'lucide-react';
import { Button } from '@/components/ui';
import { staggerContainer, staggerItem } from '@/animations/variants';

/** Decorative orbs — they never intercept a pointer event. */
const SHAPES = [
  { className: 'left-[8%] top-[18%] h-64 w-64 bg-brand-500/20', duration: 18, delay: 0 },
  { className: 'right-[6%] top-[12%] h-80 w-80 bg-accent-500/20', duration: 22, delay: 1.5 },
  { className: 'bottom-[10%] left-1/3 h-72 w-72 bg-brand-400/15', duration: 26, delay: 3 },
];

/** Standalone 404 — it sits outside the dashboard shell, so it brings its own page. */
const NotFound = () => {
  const navigate = useNavigate();

  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden px-4 py-12">
      {/* ── Floating shapes ───────────────────────────────────────────────── */}
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        {SHAPES.map((shape, index) => (
          <motion.div
            key={index}
            animate={{ scale: [1, 1.18, 1], x: [0, 28, 0], y: [0, -24, 0] }}
            transition={{
              duration: shape.duration,
              delay: shape.delay,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
            className={`absolute rounded-full blur-3xl ${shape.className}`}
          />
        ))}

        <motion.div
          animate={{ y: [0, -14, 0], rotate: [0, 8, 0] }}
          transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute left-[14%] top-[28%] hidden h-16 w-16 rounded-3xl border border-line bg-surface-raised/60 backdrop-blur-xl md:block"
        />
        <motion.div
          animate={{ y: [0, 16, 0], rotate: [0, -10, 0] }}
          transition={{ duration: 11, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
          className="absolute right-[16%] bottom-[26%] hidden h-12 w-12 rounded-2xl border border-line bg-surface-raised/60 backdrop-blur-xl md:block"
        />
      </div>

      {/* ── Content ───────────────────────────────────────────────────────── */}
      <motion.div
        variants={staggerContainer(0.08)}
        initial="initial"
        animate="animate"
        className="relative z-10 w-full max-w-lg text-center"
      >
        <motion.div variants={staggerItem} className="mb-2 flex justify-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface-raised/60 px-3 py-1.5 text-xs font-semibold text-content-muted backdrop-blur-xl">
            <Compass className="h-3.5 w-3.5 text-brand-500" />
            Wrong turn
          </span>
        </motion.div>

        <motion.h1
          variants={staggerItem}
          className="gradient-text select-none text-[6.5rem] font-bold leading-none tracking-tighter sm:text-[9rem]"
        >
          404
        </motion.h1>

        <motion.h2
          variants={staggerItem}
          className="mt-2 text-balance text-2xl font-bold tracking-tight text-content sm:text-3xl"
        >
          This page never made it past the gate
        </motion.h2>

        <motion.p
          variants={staggerItem}
          className="mx-auto mt-3 max-w-md text-balance text-sm leading-relaxed text-content-muted sm:text-base"
        >
          The link is broken, the pass was deleted, or you don't have the permission that would put
          this page in your sidebar. Either way, there's nothing here.
        </motion.p>

        <motion.div
          variants={staggerItem}
          className="mt-8 flex flex-col justify-center gap-3 sm:flex-row"
        >
          <Button
            variant="secondary"
            size="lg"
            leftIcon={<ArrowLeft className="h-4 w-4" />}
            onClick={() => navigate(-1)}
          >
            Go back
          </Button>
          <Button
            size="lg"
            leftIcon={<LayoutDashboard className="h-4 w-4" />}
            onClick={() => navigate('/dashboard')}
          >
            Take me to the dashboard
          </Button>
        </motion.div>

        <motion.div variants={staggerItem} className="mt-8">
          <Button
            variant="ghost"
            size="sm"
            leftIcon={<LifeBuoy className="h-4 w-4" />}
            onClick={() => navigate('/tutorials')}
          >
            Or read how the workflow fits together
          </Button>
        </motion.div>
      </motion.div>
    </div>
  );
};

export default NotFound;
