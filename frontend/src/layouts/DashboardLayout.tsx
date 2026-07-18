import { Suspense, useCallback, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { gatePassApi, hrApi, notificationApi, securityApi } from '@/services/endpoints';
import { usePermissions } from '@/permissions/usePermissions';
import { PERMISSION } from '@/permissions/constants';
import { pageVariants } from '@/animations/variants';
import { PageSkeleton } from '@/components/common/PageSkeleton';
import { RouteErrorBoundary } from '@/components/common/RouteErrorBoundary';
import { useScrollRestoration } from '@/hooks/useScrollRestoration';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { cn } from '@/utils/cn';

/** Live counts for the sidebar badges — each query only runs if the user can see it. */
const useSidebarBadges = () => {
  const { can } = usePermissions();

  const approvals = useQuery({
    queryKey: ['gate-passes', 'pending-approval', 'badge'],
    queryFn: () => gatePassApi.pendingApproval({ limit: 1 }),
    enabled: can(PERMISSION.GATEPASS_APPROVE),
    refetchInterval: 120_000,
  });

  const hrQueue = useQuery({
    queryKey: ['hr', 'queue', 'badge'],
    queryFn: () => hrApi.queue({ limit: 1 }),
    enabled: can(PERMISSION.HR_REVIEW_VIEW),
    refetchInterval: 120_000,
  });

  const securityQueue = useQuery({
    queryKey: ['security', 'queue', 'badge'],
    queryFn: () => securityApi.queue({ limit: 1 }),
    enabled: can(PERMISSION.SECURITY_ACCESS),
    refetchInterval: 60_000,
  });

  const notifications = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: notificationApi.unreadCount,
    refetchInterval: 60_000,
  });

  return {
    pending: approvals.data?.meta.total ?? 0,
    hrReview: hrQueue.data?.meta.total ?? 0,
    security: securityQueue.data?.meta.total ?? 0,
    notifications: notifications.data?.count ?? 0,
  };
};

export const DashboardLayout = () => {
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem('gatepass.sidebar') === 'collapsed'
  );
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const badges = useSidebarBadges();
  useScrollRestoration();

  /* Stable identities: Sidebar and Topbar are memoized, and a fresh arrow on
   * every render would defeat that — they re-rendered on each badge poll. */
  const toggleCollapse = useCallback(() => {
    setCollapsed((current: boolean) => {
      const next = !current;
      localStorage.setItem('gatepass.sidebar', next ? 'collapsed' : 'expanded');
      return next;
    });
  }, []);

  const closeMobile = useCallback(() => setMobileOpen(false), []);
  const openMobile = useCallback(() => setMobileOpen(true), []);

  return (
    <div className="min-h-dvh">
      <Sidebar
        collapsed={collapsed}
        onToggleCollapse={toggleCollapse}
        mobileOpen={mobileOpen}
        onCloseMobile={closeMobile}
        badges={badges}
      />

      <div
        className={cn(
          'flex min-h-dvh flex-col transition-[padding] duration-300 ease-spring',
          collapsed ? 'lg:pl-[76px]' : 'lg:pl-[264px]'
        )}
      >
        <Topbar onOpenMobileMenu={openMobile} />

        <main className="flex-1 px-4 py-6 pb-safe sm:px-6 lg:px-8">
          {/* Suspense sits ABOVE AnimatePresence, and this is load-bearing.
           *
           * Every page below is lazy(). When Suspense lived *inside* the keyed
           * child (via the route guard), an incoming chunk would suspend while
           * AnimatePresence — in mode="wait" — was still holding the outgoing
           * child for its exit animation. React discards a suspended subtree, so
           * the exit-complete callback never fired, AnimatePresence dropped both
           * children, and the content area rendered nothing: the blank page you
           * hit when clicking through the sidebar quickly.
           *
           * Hoisted here, a suspending chunk swaps the whole presence tree for
           * the skeleton and remounts cleanly on resolve. Exit animations now
           * only ever run on already-loaded content, which is the one case
           * mode="wait" actually handles correctly. Do not push this back down. */}
          <Suspense fallback={<div className="mx-auto w-full max-w-[1600px]"><PageSkeleton /></div>}>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={location.pathname}
                variants={pageVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                className="mx-auto w-full max-w-[1600px]"
              >
                {/* Remounts with the keyed child, so a crash on one page never
                 * outlives the navigation away from it. */}
                <RouteErrorBoundary>
                  <Outlet />
                </RouteErrorBoundary>
              </motion.div>
            </AnimatePresence>
          </Suspense>
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;
