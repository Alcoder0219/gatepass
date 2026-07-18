import { Outlet } from 'react-router-dom';
import { motion } from 'framer-motion';
import { BarChart3, ShieldCheck, Workflow } from 'lucide-react';
import { Logo } from '@/components/common/Logo';
import { BRAND } from '@/config/brand';

const HIGHLIGHTS = [
  { icon: Workflow, title: 'Multi-stage approvals', text: 'Manager → HR → Security, with a full audit trail.' },
  { icon: ShieldCheck, title: 'Gate verification', text: 'Guards verify and record every movement in seconds.' },
  { icon: BarChart3, title: 'Live analytics', text: 'Trends, turnaround and late returns across every unit.' },
];

/**
 * Split auth shell: a marketing panel on large screens, the form alone on
 * mobile. The animated orbs are pure decoration — they sit behind everything
 * and never intercept a pointer event.
 */
export const AuthLayout = () => (
  <div className="flex min-h-dvh">
    {/* ── Brand panel ───────────────────────────────────────────────────── */}
    <aside className="relative hidden w-1/2 overflow-hidden bg-brand-gradient lg:flex lg:flex-col lg:justify-between xl:w-[55%]">
      <div className="pointer-events-none absolute inset-0">
        <motion.div
          animate={{ scale: [1, 1.15, 1], x: [0, 30, 0], y: [0, -20, 0] }}
          transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute -left-24 top-1/4 h-96 w-96 rounded-full bg-white/10 blur-3xl"
        />
        <motion.div
          animate={{ scale: [1, 1.2, 1], x: [0, -40, 0], y: [0, 30, 0] }}
          transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
          className="absolute -right-20 bottom-1/4 h-[28rem] w-[28rem] rounded-full bg-accent-300/20 blur-3xl"
        />
      </div>

      <div className="relative z-10 p-12">
        <div className="flex items-center gap-3">
          <Logo className="h-12 w-12 rounded-2xl" />
          <div>
            <p className="text-xl font-bold leading-tight text-white">{BRAND.name}</p>
            <p className="text-xs font-medium text-white/70">{BRAND.tagline}</p>
          </div>
        </div>
      </div>

      <div className="relative z-10 px-12">
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="max-w-lg text-balance text-4xl font-bold leading-tight tracking-tight text-white xl:text-5xl"
        >
          Every exit, accounted for.
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          className="mt-4 max-w-md text-lg leading-relaxed text-white/80"
        >
          From the request on the shop floor to the guard at the gate — one system, one trail, zero paper.
        </motion.p>

        <div className="mt-12 space-y-5">
          {HIGHLIGHTS.map((item, index) => {
            const Icon = item.icon;
            return (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5, delay: 0.2 + index * 0.1 }}
                className="flex items-start gap-4"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15 backdrop-blur-md">
                  <Icon className="h-4.5 w-4.5 h-5 w-5 text-white" />
                </div>
                <div>
                  <p className="font-semibold text-white">{item.title}</p>
                  <p className="text-sm text-white/70">{item.text}</p>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      <div className="relative z-10 p-12">
        <p className="text-xs text-white/50">
          © {new Date().getFullYear()} {BRAND.name}. Built for enterprise operations.
        </p>
      </div>
    </aside>

    {/* ── Form panel ────────────────────────────────────────────────────── */}
    <main className="flex flex-1 items-center justify-center px-4 py-10 sm:px-8">
      <div className="w-full max-w-md">
        <Outlet />
      </div>
    </main>
  </div>
);

export default AuthLayout;
