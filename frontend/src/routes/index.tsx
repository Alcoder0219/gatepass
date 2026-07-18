import { Suspense } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { PERMISSION } from '@/permissions/constants';
import { AuthLayout } from '@/layouts/AuthLayout';
import { DashboardLayout } from '@/layouts/DashboardLayout';
import { ProtectedRoute, PublicOnlyRoute } from './ProtectedRoute';
import { FullPageLoader } from '@/components/common/FullPageLoader';
import { lazyWithRetry } from './lazyWithRetry';

/* Code-split every page: the login screen should not ship Recharts. */
const Login = lazyWithRetry(() => import('@/pages/auth/Login'));
const ForgotPassword = lazyWithRetry(() => import('@/pages/auth/ForgotPassword'));
const ResetPassword = lazyWithRetry(() => import('@/pages/auth/ResetPassword'));
const VerifyOtp = lazyWithRetry(() => import('@/pages/auth/VerifyOtp'));

const Dashboard = lazyWithRetry(() => import('@/pages/Dashboard'));
const Analytics = lazyWithRetry(() => import('@/pages/Analytics'));
const CalendarView = lazyWithRetry(() => import('@/pages/CalendarView'));

const NewGatePass = lazyWithRetry(() => import('@/pages/gatepass/NewGatePass'));
const MyGatePasses = lazyWithRetry(() => import('@/pages/gatepass/MyGatePasses'));
const AllGatePasses = lazyWithRetry(() => import('@/pages/gatepass/AllGatePasses'));
const GatePassDetail = lazyWithRetry(() => import('@/pages/gatepass/GatePassDetail'));
const PrintGatePass = lazyWithRetry(() => import('@/pages/gatepass/PrintGatePass'));

const PendingApprovals = lazyWithRetry(() => import('@/pages/approvals/PendingApprovals'));
const ApprovedPasses = lazyWithRetry(() => import('@/pages/approvals/ApprovedPasses'));
const RejectedPasses = lazyWithRetry(() => import('@/pages/approvals/RejectedPasses'));

const HRReview = lazyWithRetry(() => import('@/pages/hr/HRReview'));
const SecurityConsole = lazyWithRetry(() => import('@/pages/security/SecurityConsole'));

const Reports = lazyWithRetry(() => import('@/pages/Reports'));
const NotificationsPage = lazyWithRetry(() => import('@/pages/Notifications'));
const AuditLogs = lazyWithRetry(() => import('@/pages/AuditLogs'));

const Users = lazyWithRetry(() => import('@/pages/admin/Users'));
const UserDetail = lazyWithRetry(() => import('@/pages/admin/UserDetail'));
const Roles = lazyWithRetry(() => import('@/pages/admin/Roles'));
const Departments = lazyWithRetry(() => import('@/pages/admin/Departments'));
const Units = lazyWithRetry(() => import('@/pages/admin/Units'));
const SettingsPage = lazyWithRetry(() => import('@/pages/admin/Settings'));

const Profile = lazyWithRetry(() => import('@/pages/Profile'));
const Tutorials = lazyWithRetry(() => import('@/pages/Tutorials'));
const NotFound = lazyWithRetry(() => import('@/pages/NotFound'));

/**
 * Permission gate only — deliberately NO Suspense boundary.
 *
 * These pages render through DashboardLayout's <Outlet/>, which is wrapped in an
 * AnimatePresence. A Suspense boundary here would catch the lazy chunk *inside*
 * that presence tree, and a suspended child makes AnimatePresence drop both the
 * outgoing and incoming page — the blank screen on rapid sidebar navigation.
 *
 * The layout owns a single Suspense boundary above AnimatePresence instead, so
 * suspension is handled where it cannot orphan an animation. Routes rendered
 * OUTSIDE the dashboard chrome still need their own boundary — see `standalone`.
 */
const guard = (element: React.ReactNode, permissions?: string[]) => (
  <ProtectedRoute permissions={permissions}>{element}</ProtectedRoute>
);

/** For routes with no layout above them, so nothing else provides a boundary. */
const standalone = (element: React.ReactNode, permissions?: string[]) => (
  <ProtectedRoute permissions={permissions}>
    <Suspense fallback={<FullPageLoader />}>{element}</Suspense>
  </ProtectedRoute>
);

export const AppRoutes = () => {
  const location = useLocation();

  return (
    <Routes location={location}>
      {/* ── Public ────────────────────────────────────────────────────────── */}
      <Route
        element={
          <PublicOnlyRoute>
            <Suspense fallback={<FullPageLoader />}>
              <AuthLayout />
            </Suspense>
          </PublicOnlyRoute>
        }
      >
        <Route path="/login" element={<Login />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/verify-otp" element={<VerifyOtp />} />
      </Route>

      {/* The print view deliberately sits OUTSIDE the dashboard chrome. */}
      <Route
        path="/gate-pass/:id/print"
        element={standalone(<PrintGatePass />, [PERMISSION.GATEPASS_PRINT])}
      />

      {/* ── App ───────────────────────────────────────────────────────────── */}
      <Route
        element={
          <ProtectedRoute>
            <DashboardLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />

        <Route path="/dashboard" element={guard(<Dashboard />, [PERMISSION.DASHBOARD_VIEW])} />
        <Route path="/analytics" element={guard(<Analytics />, [PERMISSION.ANALYTICS_VIEW])} />
        <Route path="/calendar" element={guard(<CalendarView />, [PERMISSION.DASHBOARD_VIEW])} />

        {/* Gate pass */}
        <Route path="/gate-pass/new" element={guard(<NewGatePass />, [PERMISSION.GATEPASS_CREATE])} />
        <Route path="/gate-pass/:id/edit" element={guard(<NewGatePass />, [PERMISSION.GATEPASS_UPDATE])} />
        <Route path="/gate-pass/:id" element={guard(<GatePassDetail />)} />
        <Route path="/my-gate-pass" element={guard(<MyGatePasses />, [PERMISSION.GATEPASS_VIEW_OWN])} />
        <Route path="/my-gate-pass/:id" element={guard(<GatePassDetail />)} />
        <Route
          path="/gate-passes"
          element={guard(<AllGatePasses />, [
            PERMISSION.GATEPASS_VIEW_ALL,
            PERMISSION.GATEPASS_VIEW_DEPARTMENT,
          ])}
        />
        <Route path="/gate-passes/:id" element={guard(<GatePassDetail />)} />

        {/* Workflow */}
        <Route path="/approvals" element={guard(<PendingApprovals />, [PERMISSION.GATEPASS_APPROVE])} />
        <Route path="/approvals/:id" element={guard(<GatePassDetail />, [PERMISSION.GATEPASS_APPROVE])} />
        <Route
          path="/approved"
          element={guard(<ApprovedPasses />, [
            PERMISSION.GATEPASS_APPROVE,
            PERMISSION.GATEPASS_VIEW_ALL,
            PERMISSION.HR_REVIEW_VIEW,
          ])}
        />
        <Route
          path="/rejected"
          element={guard(<RejectedPasses />, [
            PERMISSION.GATEPASS_APPROVE,
            PERMISSION.GATEPASS_VIEW_ALL,
            PERMISSION.HR_REVIEW_VIEW,
          ])}
        />
        <Route path="/hr-review" element={guard(<HRReview />, [PERMISSION.HR_REVIEW_VIEW])} />
        <Route path="/hr-review/:id" element={guard(<GatePassDetail />, [PERMISSION.HR_REVIEW_VIEW])} />
        <Route path="/security" element={guard(<SecurityConsole />, [PERMISSION.SECURITY_ACCESS])} />
        <Route path="/security/:id" element={guard(<GatePassDetail />, [PERMISSION.SECURITY_ACCESS])} />

        {/* Insights */}
        <Route path="/reports" element={guard(<Reports />, [PERMISSION.REPORTS_VIEW])} />
        <Route path="/notifications" element={guard(<NotificationsPage />)} />
        <Route path="/audit-logs" element={guard(<AuditLogs />, [PERMISSION.AUDIT_VIEW])} />

        {/* Administration */}
        <Route path="/users" element={guard(<Users />, [PERMISSION.USERS_VIEW])} />
        <Route path="/users/:id" element={guard(<UserDetail />, [PERMISSION.USERS_VIEW])} />
        <Route path="/roles" element={guard(<Roles />, [PERMISSION.ROLES_VIEW])} />
        <Route
          path="/departments"
          element={guard(<Departments />, [PERMISSION.DEPARTMENTS_MANAGE])}
        />
        <Route path="/units" element={guard(<Units />, [PERMISSION.UNITS_MANAGE])} />
        <Route path="/settings" element={guard(<SettingsPage />, [PERMISSION.SETTINGS_VIEW])} />

        {/* Personal */}
        <Route path="/profile" element={guard(<Profile />)} />
        <Route path="/tutorials" element={guard(<Tutorials />)} />
      </Route>

      <Route
        path="*"
        element={
          <Suspense fallback={<FullPageLoader />}>
            <NotFound />
          </Suspense>
        }
      />
    </Routes>
  );
};

export default AppRoutes;
