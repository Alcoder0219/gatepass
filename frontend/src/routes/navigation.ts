import {
  Activity,
  BadgeCheck,
  Bell,
  Building2,
  CalendarCheck,
  CalendarDays,
  CalendarPlus,
  CalendarRange,
  CalendarX2,
  ClipboardCheck,
  FileBarChart,
  FilePlus2,
  FileSpreadsheet,
  FileText,
  GraduationCap,
  LayoutDashboard,
  Network,
  ScrollText,
  ShieldCheck,
  Settings as SettingsIcon,
  Tags,
  UserCheck,
  Users,
  Wallet,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import { PERMISSION } from '@/permissions/constants';

export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  /** The item renders only if the user holds ANY of these. Empty = always. */
  permissions?: string[];
  /** Key into the badge-count map supplied by the sidebar. */
  badgeKey?: 'pending' | 'hrReview' | 'security' | 'notifications' | 'leaveApproval';
  /** Match child routes too (e.g. /gate-pass/:id under "My Gate Pass"). */
  matchPrefix?: string;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

/**
 * The sidebar is DERIVED, never hardcoded per role: each entry declares the
 * permissions that reveal it, and the role's permission set decides what the
 * user sees. Add a permission to a role and its nav appears — no code change.
 */
export const NAVIGATION: NavSection[] = [
  {
    title: 'Overview',
    items: [
      {
        label: 'Dashboard',
        to: '/dashboard',
        icon: LayoutDashboard,
        permissions: [PERMISSION.DASHBOARD_VIEW],
      },
      {
        label: 'Analytics',
        to: '/analytics',
        icon: Activity,
        permissions: [PERMISSION.ANALYTICS_VIEW],
      },
      {
        label: 'Calendar',
        to: '/calendar',
        icon: CalendarDays,
        permissions: [PERMISSION.DASHBOARD_VIEW],
      },
    ],
  },
  {
    title: 'Gate Pass',
    items: [
      {
        label: 'New Gate Pass',
        to: '/gate-pass/new',
        icon: FilePlus2,
        permissions: [PERMISSION.GATEPASS_CREATE],
      },
      {
        label: 'My Gate Passes',
        to: '/my-gate-pass',
        icon: FileText,
        permissions: [PERMISSION.GATEPASS_VIEW_OWN],
        matchPrefix: '/my-gate-pass',
      },
      {
        label: 'All Gate Passes',
        to: '/gate-passes',
        icon: Network,
        permissions: [PERMISSION.GATEPASS_VIEW_ALL, PERMISSION.GATEPASS_VIEW_DEPARTMENT],
        matchPrefix: '/gate-passes',
      },
    ],
  },
  {
    title: 'Workflow',
    items: [
      {
        label: 'Pending Approval',
        to: '/approvals',
        icon: ClipboardCheck,
        permissions: [PERMISSION.GATEPASS_APPROVE],
        badgeKey: 'pending',
        matchPrefix: '/approvals',
      },
      {
        label: 'Approved',
        to: '/approved',
        icon: BadgeCheck,
        permissions: [
          PERMISSION.GATEPASS_APPROVE,
          PERMISSION.GATEPASS_VIEW_ALL,
          PERMISSION.HR_REVIEW_VIEW,
        ],
      },
      {
        label: 'Rejected',
        to: '/rejected',
        icon: XCircle,
        permissions: [
          PERMISSION.GATEPASS_APPROVE,
          PERMISSION.GATEPASS_VIEW_ALL,
          PERMISSION.HR_REVIEW_VIEW,
        ],
      },
      {
        label: 'HR Review',
        to: '/hr-review',
        icon: ShieldCheck,
        permissions: [PERMISSION.HR_REVIEW_VIEW],
        badgeKey: 'hrReview',
        matchPrefix: '/hr-review',
      },
      {
        label: 'Security',
        to: '/security',
        icon: ShieldCheck,
        permissions: [PERMISSION.SECURITY_ACCESS],
        badgeKey: 'security',
        matchPrefix: '/security',
      },
    ],
  },
  /**
   * Leave Management — scaffolding.
   *
   * These entries carry NO `permissions` yet, so they render for every signed-in
   * user. That is deliberate: the `leave.*` permission vocabulary does not exist
   * in the backend `constants/index.js` yet, and gating on keys no role holds
   * would hide the whole section from everyone except Super Admin (who bypasses
   * every check). Scaffolding with blank pages carries no data-exposure risk.
   *
   * When the leave permissions land, add one `permissions: [...]` line per entry
   * here and the matching guard in `routes/index.tsx` — the sidebar is derived,
   * so nothing else needs to change.
   */
  {
    title: 'Leave Management',
    items: [
      { label: 'Leave Dashboard', to: '/leave/dashboard', icon: CalendarRange },
      { label: 'Leave Types', to: '/leave/types', icon: Tags, permissions: [PERMISSION.LEAVE_TYPE_VIEW] },
      { label: 'Leave Allocation', to: '/leave/allocation', icon: Wallet, permissions: [PERMISSION.LEAVE_ALLOCATION_VIEW] },
      { label: 'Apply Leave', to: '/leave/apply', icon: CalendarPlus, permissions: [PERMISSION.LEAVE_APPLY] },
      {
        label: 'My Leaves',
        to: '/leave/my-leaves',
        icon: CalendarCheck,
        permissions: [PERMISSION.LEAVE_VIEW_OWN],
        matchPrefix: '/leave/my-leaves',
      },
      {
        label: 'Leave Approval',
        to: '/leave/approvals',
        icon: UserCheck,
        permissions: [PERMISSION.LEAVE_APPROVE, PERMISSION.LEAVE_HR_REVIEW],
        badgeKey: 'leaveApproval',
        matchPrefix: '/leave/approvals',
      },
      {
        label: 'Leave Deletion',
        to: '/leave/deletion',
        icon: CalendarX2,
        permissions: [PERMISSION.LEAVE_DELETE],
      },
      {
        label: 'Leave Reports',
        to: '/leave/reports',
        icon: FileSpreadsheet,
        permissions: [PERMISSION.LEAVE_REPORTS_VIEW],
      },
    ],
  },
  {
    title: 'Insights',
    items: [
      {
        label: 'Reports',
        to: '/reports',
        icon: FileBarChart,
        permissions: [PERMISSION.REPORTS_VIEW],
      },
      {
        label: 'Notifications',
        to: '/notifications',
        icon: Bell,
        permissions: [PERMISSION.NOTIFICATIONS_VIEW],
        badgeKey: 'notifications',
      },
      {
        label: 'Audit Logs',
        to: '/audit-logs',
        icon: ScrollText,
        permissions: [PERMISSION.AUDIT_VIEW],
      },
    ],
  },
  {
    title: 'Administration',
    items: [
      {
        label: 'Users',
        to: '/users',
        icon: Users,
        permissions: [PERMISSION.USERS_VIEW],
        matchPrefix: '/users',
      },
      {
        label: 'Roles & Permissions',
        to: '/roles',
        icon: ShieldCheck,
        permissions: [PERMISSION.ROLES_VIEW],
      },
      {
        label: 'Departments',
        to: '/departments',
        icon: Network,
        permissions: [PERMISSION.DEPARTMENTS_MANAGE],
      },
      {
        label: 'Units',
        to: '/units',
        icon: Building2,
        permissions: [PERMISSION.UNITS_MANAGE],
      },
      {
        label: 'Settings',
        to: '/settings',
        icon: SettingsIcon,
        permissions: [PERMISSION.SETTINGS_VIEW],
      },
    ],
  },
  {
    title: 'Help',
    items: [
      {
        label: 'Tutorials',
        to: '/tutorials',
        icon: GraduationCap,
        permissions: [PERMISSION.TUTORIALS_VIEW],
      },
    ],
  },
];
