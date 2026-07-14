/**
 * Static seed data. Everything here is keyed by a NATURAL key (unit code,
 * department code + unit, role key, user email) so the seeder can upsert and
 * stay idempotent across runs.
 *
 * Permission arrays are BUILT from the PERMISSION enum — never hand-typed — so
 * a renamed permission breaks the seed loudly instead of silently granting
 * nothing.
 */
import { PERMISSION, PERMISSIONS, DATA_SCOPE, ROLE, GATEPASS_STATUS, GATEPASS_TYPE } from '../constants/index.js';

const P = PERMISSION;

/* ─── Units ───────────────────────────────────────────────────────────────── */
export const UNITS = [
  {
    code: 'CORP',
    name: 'CORPORATE',
    address: 'Plot 1, Cyber City',
    city: 'Gurugram',
    state: 'Haryana',
    gateOpenTime: '08:00',
    gateCloseTime: '21:00',
  },
  {
    code: 'MNR',
    name: 'Manesar',
    address: 'IMT Manesar, Sector 8',
    city: 'Manesar',
    state: 'Haryana',
    gateOpenTime: '07:00',
    gateCloseTime: '20:00',
  },
  {
    code: 'CHN',
    name: 'Chennai',
    address: 'Oragadam Industrial Corridor',
    city: 'Chennai',
    state: 'Tamil Nadu',
    gateOpenTime: '07:30',
    gateCloseTime: '20:30',
  },
  {
    code: 'BWL',
    name: 'Bawal',
    address: 'HSIIDC Industrial Area',
    city: 'Bawal',
    state: 'Haryana',
    gateOpenTime: '07:00',
    gateCloseTime: '19:30',
  },
  {
    code: 'BSP',
    name: 'Bilaspur',
    address: 'Industrial Growth Centre',
    city: 'Bilaspur',
    state: 'Himachal Pradesh',
    gateOpenTime: '08:00',
    gateCloseTime: '20:00',
  },
];

/* ─── Departments (created inside every unit) ─────────────────────────────── */
export const DEPARTMENTS = [
  { code: 'PROD', name: 'Production', description: 'Shop floor & assembly lines' },
  { code: 'QLTY', name: 'Quality', description: 'Quality assurance & control' },
  { code: 'MNTC', name: 'Maintenance', description: 'Plant & machine upkeep' },
  { code: 'HR', name: 'HR', description: 'People & administration' },
  { code: 'FIN', name: 'Finance', description: 'Accounts, payroll & treasury' },
  { code: 'IT', name: 'IT', description: 'Applications & infrastructure' },
  { code: 'SCM', name: 'Supply Chain', description: 'Planning, stores & logistics' },
  { code: 'EHS', name: 'EHS', description: 'Environment, health & safety' },
];

/* ─── Roles ───────────────────────────────────────────────────────────────── */
export const ROLES = [
  {
    key: ROLE.SUPER_ADMIN,
    name: 'Super Admin',
    description: 'Unrestricted access to every module and every record.',
    permissions: [...PERMISSIONS],
    dataScope: DATA_SCOPE.ALL,
    level: 100,
    color: '#7c3aed',
  },
  {
    key: ROLE.ADMIN,
    name: 'Administrator',
    description: 'Runs the system day to day, including roles, users and settings.',
    // Admins hold every permission. Tighten this per-deployment if an org wants
    // role definition reserved for the Super Admin alone.
    permissions: [...PERMISSIONS],
    dataScope: DATA_SCOPE.ALL,
    level: 90,
    color: '#4f46e5',
  },
  {
    key: ROLE.HOD,
    name: 'Head of Department',
    description: 'Approves gate passes for their reportees and sees only their slice of the data.',
    permissions: [
      P.DASHBOARD_VIEW,
      P.ANALYTICS_VIEW,
      P.GATEPASS_CREATE,
      P.GATEPASS_VIEW_OWN,
      P.GATEPASS_VIEW_DEPARTMENT,
      P.GATEPASS_APPROVE,
      P.GATEPASS_REJECT,
      P.GATEPASS_REQUEST_CHANGES,
      P.GATEPASS_CANCEL,
      P.GATEPASS_EXPORT,
      P.GATEPASS_PRINT,
      P.REPORTS_VIEW,
      P.NOTIFICATIONS_VIEW,
      P.TUTORIALS_VIEW,
    ],
    dataScope: DATA_SCOPE.REPORTEES,
    level: 50,
    color: '#0ea5e9',
  },
  {
    key: ROLE.HR,
    name: 'Human Resources',
    description: 'Reviews manager-approved passes before they reach security.',
    permissions: [
      P.DASHBOARD_VIEW,
      P.ANALYTICS_VIEW,
      P.HR_REVIEW,
      P.HR_REVIEW_VIEW,
      P.GATEPASS_VIEW_ALL,
      P.GATEPASS_REJECT,
      P.GATEPASS_EXPORT,
      P.GATEPASS_PRINT,
      P.REPORTS_VIEW,
      P.REPORTS_EXPORT,
      P.USERS_VIEW,
      P.NOTIFICATIONS_VIEW,
      P.TUTORIALS_VIEW,
    ],
    dataScope: DATA_SCOPE.ALL,
    level: 60,
    color: '#10b981',
  },
  {
    key: ROLE.SECURITY,
    name: 'Security',
    description:
      'Scans, marks exit and marks return. Deliberately has NO gate pass view_all — the scope shows approved passes only.',
    permissions: [
      P.DASHBOARD_VIEW,
      P.SECURITY_ACCESS,
      P.SECURITY_SCAN,
      P.SECURITY_MARK_EXIT,
      P.SECURITY_MARK_RETURN,
      P.NOTIFICATIONS_VIEW,
      P.TUTORIALS_VIEW,
    ],
    dataScope: DATA_SCOPE.ALL,
    level: 30,
    color: '#f59e0b',
  },
  {
    key: ROLE.EMPLOYEE,
    name: 'Employee',
    description: 'Raises gate passes and tracks their own.',
    permissions: [
      P.DASHBOARD_VIEW,
      P.GATEPASS_CREATE,
      P.GATEPASS_VIEW_OWN,
      P.GATEPASS_CANCEL,
      P.GATEPASS_PRINT,
      P.NOTIFICATIONS_VIEW,
      P.TUTORIALS_VIEW,
    ],
    dataScope: DATA_SCOPE.OWN,
    level: 10,
    color: '#64748b',
  },
];

/* ─── Users ───────────────────────────────────────────────────────────────── */
/**
 * `manager` is an email — the seeder resolves it to an _id on a second pass,
 * so the file can be read top to bottom without worrying about ordering.
 */
export const USERS = [
  // ── Platform staff (Corporate) ──
  {
    employeeId: 'EMP0001',
    name: 'Aarav Mehta',
    email: 'superadmin@gatepasspro.io',
    role: ROLE.SUPER_ADMIN,
    unit: 'CORP',
    department: 'IT',
    designation: 'Chief Technology Officer',
    phone: '+91 98100 00001',
    manager: null,
  },
  {
    employeeId: 'EMP0002',
    name: 'Diya Sharma',
    email: 'admin@gatepasspro.io',
    role: ROLE.ADMIN,
    unit: 'CORP',
    department: 'HR',
    designation: 'System Administrator',
    phone: '+91 98100 00002',
    manager: 'superadmin@gatepasspro.io',
  },
  {
    employeeId: 'EMP0003',
    name: 'Neha Kulkarni',
    email: 'hr@gatepasspro.io',
    role: ROLE.HR,
    unit: 'CORP',
    department: 'HR',
    designation: 'HR Business Partner',
    phone: '+91 98100 00003',
    manager: 'admin@gatepasspro.io',
  },
  {
    employeeId: 'EMP0004',
    name: 'Ramesh Yadav',
    email: 'security@gatepasspro.io',
    role: ROLE.SECURITY,
    unit: 'CORP',
    department: 'EHS',
    designation: 'Security Supervisor',
    phone: '+91 98100 00004',
    manager: 'admin@gatepasspro.io',
  },

  // ── Heads of Department — one per major unit, reporting to the admin ──
  {
    employeeId: 'EMP0101',
    name: 'Vikram Rathore',
    email: 'hod.manesar@gatepasspro.io',
    role: ROLE.HOD,
    unit: 'MNR',
    department: 'PROD',
    designation: 'Head of Production',
    phone: '+91 98100 00101',
    manager: 'admin@gatepasspro.io',
  },
  {
    employeeId: 'EMP0102',
    name: 'Lakshmi Narayanan',
    email: 'hod.chennai@gatepasspro.io',
    role: ROLE.HOD,
    unit: 'CHN',
    department: 'QLTY',
    designation: 'Head of Quality',
    phone: '+91 98100 00102',
    manager: 'admin@gatepasspro.io',
  },
  {
    employeeId: 'EMP0103',
    name: 'Sanjay Grover',
    email: 'hod.bawal@gatepasspro.io',
    role: ROLE.HOD,
    unit: 'BWL',
    department: 'MNTC',
    designation: 'Head of Maintenance',
    phone: '+91 98100 00103',
    manager: 'admin@gatepasspro.io',
  },

  // ── Manesar employees ──
  {
    employeeId: 'EMP1001',
    name: 'Rohit Verma',
    email: 'rohit.verma@gatepasspro.io',
    role: ROLE.EMPLOYEE,
    unit: 'MNR',
    department: 'PROD',
    designation: 'Line Supervisor',
    manager: 'hod.manesar@gatepasspro.io',
  },
  {
    employeeId: 'EMP1002',
    name: 'Priya Nair',
    email: 'priya.nair@gatepasspro.io',
    role: ROLE.EMPLOYEE,
    unit: 'MNR',
    department: 'QLTY',
    designation: 'Quality Engineer',
    manager: 'hod.manesar@gatepasspro.io',
  },
  {
    employeeId: 'EMP1003',
    name: 'Imran Sheikh',
    email: 'imran.sheikh@gatepasspro.io',
    role: ROLE.EMPLOYEE,
    unit: 'MNR',
    department: 'MNTC',
    designation: 'Maintenance Technician',
    manager: 'hod.manesar@gatepasspro.io',
  },
  {
    employeeId: 'EMP1004',
    name: 'Kavita Joshi',
    email: 'kavita.joshi@gatepasspro.io',
    role: ROLE.EMPLOYEE,
    unit: 'MNR',
    department: 'SCM',
    designation: 'Stores Executive',
    manager: 'hod.manesar@gatepasspro.io',
  },

  // ── Chennai employees ──
  {
    employeeId: 'EMP2001',
    name: 'Arjun Subramanian',
    email: 'arjun.s@gatepasspro.io',
    role: ROLE.EMPLOYEE,
    unit: 'CHN',
    department: 'QLTY',
    designation: 'QA Inspector',
    manager: 'hod.chennai@gatepasspro.io',
  },
  {
    employeeId: 'EMP2002',
    name: 'Meera Iyer',
    email: 'meera.iyer@gatepasspro.io',
    role: ROLE.EMPLOYEE,
    unit: 'CHN',
    department: 'FIN',
    designation: 'Accounts Executive',
    manager: 'hod.chennai@gatepasspro.io',
  },
  {
    employeeId: 'EMP2003',
    name: 'Karthik Raja',
    email: 'karthik.raja@gatepasspro.io',
    role: ROLE.EMPLOYEE,
    unit: 'CHN',
    department: 'PROD',
    designation: 'Production Associate',
    manager: 'hod.chennai@gatepasspro.io',
  },
  {
    employeeId: 'EMP2004',
    name: 'Divya Menon',
    email: 'divya.menon@gatepasspro.io',
    role: ROLE.EMPLOYEE,
    unit: 'CHN',
    department: 'IT',
    designation: 'Systems Engineer',
    manager: 'hod.chennai@gatepasspro.io',
  },

  // ── Bawal employees ──
  {
    employeeId: 'EMP3001',
    name: 'Harpreet Singh',
    email: 'harpreet.singh@gatepasspro.io',
    role: ROLE.EMPLOYEE,
    unit: 'BWL',
    department: 'MNTC',
    designation: 'Shift Technician',
    manager: 'hod.bawal@gatepasspro.io',
  },
  {
    employeeId: 'EMP3002',
    name: 'Anjali Gupta',
    email: 'anjali.gupta@gatepasspro.io',
    role: ROLE.EMPLOYEE,
    unit: 'BWL',
    department: 'EHS',
    designation: 'Safety Officer',
    manager: 'hod.bawal@gatepasspro.io',
  },
  {
    employeeId: 'EMP3003',
    name: 'Suresh Patil',
    email: 'suresh.patil@gatepasspro.io',
    role: ROLE.EMPLOYEE,
    unit: 'BWL',
    department: 'PROD',
    designation: 'Machine Operator',
    manager: 'hod.bawal@gatepasspro.io',
  },
  {
    employeeId: 'EMP3004',
    name: 'Farhan Qureshi',
    email: 'farhan.qureshi@gatepasspro.io',
    role: ROLE.EMPLOYEE,
    unit: 'BWL',
    department: 'SCM',
    designation: 'Logistics Coordinator',
    manager: 'hod.bawal@gatepasspro.io',
  },
];

/* ─── Holidays (current year) ─────────────────────────────────────────────── */
export const HOLIDAYS = (year) => [
  { name: 'New Year', date: `${year}-01-01`, type: 'COMPANY', restrictGatePass: false },
  { name: 'Republic Day', date: `${year}-01-26`, type: 'PUBLIC', restrictGatePass: true },
  { name: 'Holi', date: `${year}-03-14`, type: 'PUBLIC', restrictGatePass: true },
  { name: 'Good Friday', date: `${year}-04-18`, type: 'RESTRICTED', restrictGatePass: false },
  { name: 'Labour Day', date: `${year}-05-01`, type: 'PUBLIC', restrictGatePass: true },
  { name: 'Independence Day', date: `${year}-08-15`, type: 'PUBLIC', restrictGatePass: true },
  { name: 'Gandhi Jayanti', date: `${year}-10-02`, type: 'PUBLIC', restrictGatePass: true },
  { name: 'Dussehra', date: `${year}-10-02`, type: 'PUBLIC', restrictGatePass: true },
  { name: 'Diwali', date: `${year}-10-21`, type: 'PUBLIC', restrictGatePass: true },
  { name: 'Founders Day', date: `${year}-11-11`, type: 'COMPANY', restrictGatePass: false },
  { name: 'Christmas', date: `${year}-12-25`, type: 'PUBLIC', restrictGatePass: true },
];

/* ─── Demo gate passes ────────────────────────────────────────────────────── */
export const OFFICIAL_REASONS = [
  { reason: 'Vendor audit at supplier premises', purpose: 'Annual quality audit of the tier-1 vendor' },
  { reason: 'Customer escalation visit', purpose: 'On-site root-cause review with the customer team' },
  { reason: 'Material pickup from the transporter', purpose: 'Urgent line-stopping component collection' },
  { reason: 'Statutory inspection at the pollution board', purpose: 'Submission of the quarterly EHS returns' },
  { reason: 'Bank visit for company documentation', purpose: 'Signature of the revised mandate forms' },
  { reason: 'Off-site machine calibration', purpose: 'Calibration of the CMM probes at the OEM lab' },
  { reason: 'Training session at the corporate office', purpose: 'Leadership development programme, day 1' },
  { reason: 'Site survey for the new warehouse', purpose: 'Layout feasibility check with the contractor' },
];

export const PERSONAL_REASONS = [
  { reason: 'Medical appointment', purpose: 'Scheduled consultation at the city hospital' },
  { reason: 'Family emergency at home', purpose: '' },
  { reason: 'Bank work', purpose: 'Loan documentation that cannot be done online' },
  { reason: 'School parent-teacher meeting', purpose: '' },
  { reason: 'Passport office appointment', purpose: 'Biometrics and document verification slot' },
  { reason: 'Collecting a relative from the station', purpose: '' },
  { reason: 'Dental treatment', purpose: 'Follow-up procedure booked in advance' },
  { reason: 'Vehicle servicing', purpose: '' },
];

/**
 * The demo mix. Roughly 40 passes spread across every status so that the
 * dashboard cards, the charts, the HR queue and the security console all have
 * something real to render.
 */
export const GATEPASS_MIX = [
  { status: GATEPASS_STATUS.PENDING, count: 6, recentDays: 5 },
  { status: GATEPASS_STATUS.HR_REVIEW, count: 4, recentDays: 6 },
  { status: GATEPASS_STATUS.CHANGES_REQUESTED, count: 3, recentDays: 8 },
  { status: GATEPASS_STATUS.APPROVED, count: 5, recentDays: 3 },
  { status: GATEPASS_STATUS.OUT, count: 3, recentDays: 1 },
  { status: GATEPASS_STATUS.REJECTED, count: 5, recentDays: 60 },
  { status: GATEPASS_STATUS.CANCELLED, count: 2, recentDays: 60 },
  { status: GATEPASS_STATUS.COMPLETED, count: 14, recentDays: 60 },
];

export const TYPES = [GATEPASS_TYPE.OFFICIAL, GATEPASS_TYPE.PERSONAL];

/* ─── Settings singleton ──────────────────────────────────────────────────── */
export const SETTINGS = {
  company: {
    name: 'Amson Group',
    logo: 'https://i.postimg.cc/Mq6kj4FN/AMSONS-GROUP-LOGO-MASTER-(1).png',
    email: 'facilities@amsongroup.com',
    phone: '+91 124 400 0000',
    address: 'Plot 1, Cyber City, Gurugram, Haryana 122002',
  },
  limits: {
    official: { daily: 3, weekly: 10, monthly: 30, yearly: 250 },
    personal: { daily: 1, weekly: 3, monthly: 8, yearly: 60 },
  },
  maxActiveGatePasses: 2,
  allowMultiplePending: false,
  workingHours: {
    gateOpenTime: '08:00',
    gateCloseTime: '20:00',
    weekendDays: [0],
    restrictWeekend: false,
    restrictHolidays: true,
    enforceGateHours: true,
  },
  workflow: {
    approvalRequired: true,
    hrReviewRequired: true,
    securityApprovalRequired: true,
    attachmentMandatory: false,
    reasonMandatory: true,
    purposeMandatory: false,
    hrReviewForPersonalOnly: false,
    autoClosePass: true,
    expiryHours: 24,
    autoReminder: true,
    reminderBeforeMinutes: 30,
  },
  notifications: { email: true, push: true, sms: false, whatsapp: false, inApp: true },
  security: {
    requireExitPhoto: false,
    requireEntryPhoto: false,
    allowManualVerification: true,
    qrEnabled: true,
  },
  branding: { primaryColor: '#6366f1', accentColor: '#06b6d4', defaultTheme: 'system' },
};

export default {
  UNITS,
  DEPARTMENTS,
  ROLES,
  USERS,
  HOLIDAYS,
  OFFICIAL_REASONS,
  PERSONAL_REASONS,
  GATEPASS_MIX,
  TYPES,
  SETTINGS,
};
