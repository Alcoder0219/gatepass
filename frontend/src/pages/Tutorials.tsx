import { useMemo, useState, type ComponentType } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowRight,
  BadgeCheck,
  Bell,
  Building2,
  CalendarClock,
  Camera,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  ClipboardList,
  Clock,
  FileText,
  GraduationCap,
  KeyRound,
  LogIn,
  LogOut,
  Mail,
  MessageSquare,
  Paperclip,
  Printer,
  QrCode,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  UserPlus,
  Users,
  XCircle,
} from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { Badge, Button, Card, EmptyState, Input, Modal, Tabs, type TabItem } from '@/components/ui';
import { cn } from '@/utils/cn';
import { staggerContainer, staggerItem } from '@/animations/variants';

/* ─── Content ────────────────────────────────────────────────────────────────
 * Every step below describes a flow that actually exists in this app:
 * DRAFT → PENDING → (CHANGES_REQUESTED) → HR_REVIEW → APPROVED → OUT → COMPLETED.
 * ────────────────────────────────────────────────────────────────────────────*/

type Group = 'Employee' | 'Manager' | 'HR' | 'Security' | 'Admin';

interface Step {
  icon: ComponentType<{ className?: string }>;
  title: string;
  text: string;
}

interface Tutorial {
  id: string;
  group: Group;
  title: string;
  summary: string;
  minutes: number;
  icon: ComponentType<{ className?: string }>;
  steps: Step[];
}

const GROUP_TONE: Record<Group, string> = {
  Employee: 'bg-brand-500/15 text-brand-500',
  Manager: 'bg-accent-500/15 text-accent-500',
  HR: 'bg-warning-500/15 text-warning-500',
  Security: 'bg-success-500/15 text-success-500',
  Admin: 'bg-info-500/15 text-info-500',
};

const TUTORIALS: Tutorial[] = [
  {
    id: 'raise',
    group: 'Employee',
    title: 'Raise a gate pass',
    summary: 'From an empty form to a PENDING request sitting with your manager.',
    minutes: 3,
    icon: ClipboardList,
    steps: [
      {
        icon: ClipboardList,
        title: 'Open New Gate Pass',
        text: 'Go to Gate Pass → New. Your employee code, department, unit and reporting manager are pre-filled from your profile — if any of them is wrong, stop and ask an administrator to fix it first.',
      },
      {
        icon: FileText,
        title: 'Pick the type: OFFICIAL or PERSONAL',
        text: 'OFFICIAL is company business — a customer visit, a vendor pickup. PERSONAL is your own time. The type decides which quota is consumed and, in most configurations, whether HR has to review it.',
      },
      {
        icon: CalendarClock,
        title: 'Set expected out and in times',
        text: 'Give the honest window. The gate uses your expected in-time to decide whether a return is late — a pass that comes back after it is flagged, with the lateness recorded in minutes.',
      },
      {
        icon: Paperclip,
        title: 'Attach evidence if you have it',
        text: 'A visit letter, an approval mail, a delivery challan. Attachments are optional unless your administrator has made them mandatory, in which case the form will not submit without one.',
      },
      {
        icon: Send,
        title: 'Submit — the pass becomes PENDING',
        text: 'It goes straight to the reporting manager named on the pass, and it appears in your My Gate Passes list. Your manager gets a notification within seconds.',
      },
      {
        icon: MessageSquare,
        title: 'If it comes back as CHANGES_REQUESTED',
        text: 'Your manager wanted something altered. Open the pass, read the comment on the timeline, edit the pass and resubmit — it returns to PENDING with the whole exchange preserved in the audit trail.',
      },
    ],
  },
  {
    id: 'track',
    group: 'Employee',
    title: 'Track a pass to the gate',
    summary: 'Read the timeline, get your QR, and walk out cleanly.',
    minutes: 2,
    icon: QrCode,
    steps: [
      {
        icon: Clock,
        title: 'Watch the status, not your inbox',
        text: 'PENDING means your manager has it. HR_REVIEW means they approved and HR is checking. APPROVED means you may leave. OUT means the guard has recorded your exit. COMPLETED means you are back and the pass is closed.',
      },
      {
        icon: Bell,
        title: 'Let the notifications do the chasing',
        text: 'Every stage change raises a notification. Open Notifications to see the full history, or click any row to jump straight to the pass it belongs to.',
      },
      {
        icon: QrCode,
        title: 'Get your QR once APPROVED',
        text: 'Open the pass and the QR appears. It encodes a signed token tied to that pass alone — screenshots of somebody else\'s QR will fail verification at the gate.',
      },
      {
        icon: Printer,
        title: 'Print only if your gate still wants paper',
        text: 'The print view drops the app chrome and gives you a clean single page. Most gates just scan the phone.',
      },
      {
        icon: LogIn,
        title: 'Come back before your expected in-time',
        text: 'The guard scans you back in and the pass moves to COMPLETED. Return late and the pass is marked late, with the delay recorded against you in reports.',
      },
    ],
  },
  {
    id: 'approve',
    group: 'Manager',
    title: 'Approve or reject your team\'s passes',
    summary: 'Clear the PENDING queue without rubber-stamping it.',
    minutes: 3,
    icon: ClipboardCheck,
    steps: [
      {
        icon: ClipboardCheck,
        title: 'Open Pending Approvals',
        text: 'The queue shows every PENDING pass where you are the named reporting manager. Nothing else can reach it — a pass belongs to exactly one approver.',
      },
      {
        icon: Search,
        title: 'Read before you act',
        text: 'Open the pass. Check the reason, the type, the expected window and the attachments. The timeline shows everything that has already happened to it.',
      },
      {
        icon: CheckCircle2,
        title: 'Approve',
        text: 'If HR review is enabled for that type, the pass moves to HR_REVIEW, not APPROVED — HR gets the next word. If it is not, the pass goes straight to APPROVED and the QR is issued.',
      },
      {
        icon: MessageSquare,
        title: 'Or request changes instead of rejecting',
        text: 'Wrong times? Missing letter? Request changes with a comment. The pass returns to the employee as CHANGES_REQUESTED, and they can fix and resubmit without starting over.',
      },
      {
        icon: XCircle,
        title: 'Reject with a reason',
        text: 'Rejection is terminal — the pass cannot be revived. The comment is mandatory, it is shown to the employee, and it is written into the audit log under your name.',
      },
    ],
  },
  {
    id: 'hr-review',
    group: 'HR',
    title: 'Run an HR review',
    summary: 'The gate between a manager\'s approval and the actual gate.',
    minutes: 3,
    icon: BadgeCheck,
    steps: [
      {
        icon: BadgeCheck,
        title: 'Open the HR Review queue',
        text: 'It lists every pass at HR_REVIEW — approved by a manager, waiting on you. Depending on the settings, this may be PERSONAL passes only.',
      },
      {
        icon: FileText,
        title: 'Check it against policy, not against the manager',
        text: 'Quota consumption, attendance implications, whether the employee already has an active pass. The manager judged the business case; you judge the policy.',
      },
      {
        icon: CheckCircle2,
        title: 'Mark OK — the pass becomes APPROVED',
        text: 'The QR is issued the moment you do, the employee is notified, and the pass appears in the security queue at the gate.',
      },
      {
        icon: XCircle,
        title: 'Mark NOT_OK, or reject outright',
        text: 'NOT_OK records a failed review against the pass with your comment. Rejecting sends the pass to REJECTED and it dies there. Both are permanent and both carry your name.',
      },
      {
        icon: ClipboardList,
        title: 'Your reviews are a record',
        text: 'Every decision is stored as an HR review record — reviewer, outcome, comment, timestamp — and is queryable from Reports.',
      },
    ],
  },
  {
    id: 'gate',
    group: 'Security',
    title: 'Scan at the gate',
    summary: 'Verify, record the exit, and close the pass on the way back.',
    minutes: 3,
    icon: ShieldCheck,
    steps: [
      {
        icon: QrCode,
        title: 'Scan the QR in the Security Console',
        text: 'Point the scanner at the employee\'s phone. The pass is verified server-side: it must be APPROVED (to exit) or OUT (to return), and it must not have expired.',
      },
      {
        icon: Search,
        title: 'No phone? Verify manually',
        text: 'If manual verification is enabled, search by gate pass number or employee code. The same checks run — the code is just how you found the pass, not a way around the rules.',
      },
      {
        icon: Camera,
        title: 'Capture the exit photo if required',
        text: 'When the exit photo is mandatory, the console will not let you record the exit without one. It is attached to the security log for that movement.',
      },
      {
        icon: LogOut,
        title: 'Mark exit — the pass becomes OUT',
        text: 'The actual out-time is stamped from the server clock, not the employee\'s. The pass now shows on the "Currently out" board, and it turns overdue once the expected in-time passes.',
      },
      {
        icon: LogIn,
        title: 'Mark return — the pass becomes COMPLETED',
        text: 'Scan them back in. If they are past their expected in-time, the pass is flagged late and the lateness in minutes is recorded on the pass and in the security log.',
      },
    ],
  },
  {
    id: 'create-user',
    group: 'Admin',
    title: 'Create a user',
    summary: 'Employee record, role, unit, department and reporting manager.',
    minutes: 3,
    icon: UserPlus,
    steps: [
      {
        icon: UserPlus,
        title: 'Users → New user',
        text: 'Employee ID, name and work email are the identity. The email is what they sign in with, and it is where their one-time codes and reset links go.',
      },
      {
        icon: Building2,
        title: 'Set unit and department',
        text: 'These decide which passes the person appears under in reports, and which quota limits apply — limits can be set globally, per unit, per department or per role.',
      },
      {
        icon: ShieldCheck,
        title: 'Assign a role',
        text: 'The role carries the permission set and the data scope: OWN, DEPARTMENT, REPORTEES, UNIT or ALL. An HOD with a DEPARTMENT scope sees their department and nothing beyond it.',
      },
      {
        icon: Users,
        title: 'Name the reporting manager',
        text: 'This is the single most consequential field. Every gate pass this person raises will go to this manager for approval — get it wrong and the pass lands in the wrong queue.',
      },
      {
        icon: Mail,
        title: 'They set their own password',
        text: 'Give them the temporary password, or point them at "Forgot password" — the reset link lands in their inbox and expires. They can also sign in with a one-time code and never type a password at all.',
      },
    ],
  },
  {
    id: 'build-role',
    group: 'Admin',
    title: 'Build a role',
    summary: 'Permissions and data scope, without handing out the keys.',
    minutes: 4,
    icon: KeyRound,
    steps: [
      {
        icon: KeyRound,
        title: 'Roles → New role',
        text: 'Give it a key, a name and a level. The level orders roles against each other — a lower-level role cannot be handed permissions its creator does not hold.',
      },
      {
        icon: ClipboardCheck,
        title: 'Tick permissions from the catalogue',
        text: 'They are grouped by area: gate pass, HR, security, reports, administration. A permission like gatepass.approve is what puts the Pending Approvals page in someone\'s sidebar at all.',
      },
      {
        icon: Users,
        title: 'Choose the data scope',
        text: 'OWN sees only their own passes. DEPARTMENT sees the department. REPORTEES sees their direct reports. UNIT sees the whole plant. ALL sees everything. Scope is enforced on the server, not just hidden in the UI.',
      },
      {
        icon: Sparkles,
        title: 'Grant exceptions per user, not per role',
        text: 'If exactly one person needs one extra permission, do not clone the role. Add it to that user as an extra permission — or take one away with a denied permission.',
      },
      {
        icon: CheckCircle2,
        title: 'Save, then test with a real account',
        text: 'Assign the role to a test user and sign in as them. The sidebar, the pages and the API all narrow to what the role actually allows — that is the honest test.',
      },
    ],
  },
];

const GROUPS: Group[] = ['Employee', 'Manager', 'HR', 'Security', 'Admin'];

const FAQS = [
  {
    question: 'What do the statuses actually mean?',
    answer:
      'PENDING — with your reporting manager. CHANGES_REQUESTED — sent back to you to fix. HR_REVIEW — approved by the manager, waiting on HR. APPROVED — cleared to leave, QR issued. OUT — the guard recorded your exit. COMPLETED — you are back and the pass is closed. REJECTED, CANCELLED and EXPIRED are all terminal.',
  },
  {
    question: 'Why is my pass at HR_REVIEW instead of APPROVED?',
    answer:
      'Because HR review is switched on for that pass type. In most setups it applies to PERSONAL passes only, so an OFFICIAL pass goes straight from your manager to APPROVED while a PERSONAL one takes the extra hop through HR.',
  },
  {
    question: 'Can I edit a pass after submitting it?',
    answer:
      'Only while it is a DRAFT, or after a manager has sent it back as CHANGES_REQUESTED. Once it is APPROVED it is frozen — cancel it and raise a new one if the plan changed.',
  },
  {
    question: 'What happens if I return late?',
    answer:
      'The guard still scans you in and the pass still moves to COMPLETED, but it is flagged late and the delay is recorded in minutes on the pass, in the security log and in reports. Nothing is hidden.',
  },
  {
    question: 'My QR will not scan at the gate.',
    answer:
      'The QR only works while the pass is APPROVED (to exit) or OUT (to return), and only before it expires. If the guard has manual verification enabled they can find the pass by its number or your employee code instead.',
  },
  {
    question: 'Why can I not see the Approvals or HR Review pages?',
    answer:
      'Those pages are gated on permissions — gatepass.approve and hr.review_view. If your role does not carry them, the pages are not in your sidebar and the API would refuse them anyway. Ask an administrator to adjust your role.',
  },
  {
    question: 'I hit a quota limit. Now what?',
    answer:
      'Limits are set per period — daily, weekly, monthly, yearly — and can differ by unit, department or role, separately for OFFICIAL and PERSONAL. The gate pass form shows your remaining quota before you submit. Wait for the window to roll over, or ask an administrator to review the limit.',
  },
  {
    question: 'I forgot my password.',
    answer:
      'Use "Forgot password" on the sign-in screen — a reset link goes to your work email. Or skip the password entirely: "Email me a one-time code" sends a 6-digit code that signs you in directly.',
  },
];

/* ─── FAQ accordion ──────────────────────────────────────────────────────── */
const FaqRow = ({ question, answer }: { question: string; answer: string }) => {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-b border-line last:border-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-4 py-4 text-left transition-colors hover:text-brand-600 dark:hover:text-brand-300"
      >
        <span className="text-sm font-semibold text-content">{question}</span>
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="shrink-0"
        >
          <ChevronDown className="h-4 w-4 text-content-subtle" />
        </motion.span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <p className="pb-4 pr-8 text-sm leading-relaxed text-content-muted">{answer}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

/* ─── Page ───────────────────────────────────────────────────────────────── */
const Tutorials = () => {
  const [search, setSearch] = useState('');
  const [group, setGroup] = useState('ALL');
  const [active, setActive] = useState<Tutorial | null>(null);

  const matches = useMemo(() => {
    const query = search.trim().toLowerCase();
    return TUTORIALS.filter((tutorial) => {
      if (group !== 'ALL' && tutorial.group !== group) return false;
      if (!query) return true;
      return (
        tutorial.title.toLowerCase().includes(query) ||
        tutorial.summary.toLowerCase().includes(query) ||
        tutorial.group.toLowerCase().includes(query) ||
        tutorial.steps.some(
          (step) =>
            step.title.toLowerCase().includes(query) || step.text.toLowerCase().includes(query)
        )
      );
    });
  }, [search, group]);

  const byGroup = useMemo(
    () => GROUPS.map((name) => ({ name, items: matches.filter((item) => item.group === name) })),
    [matches]
  );

  const tabs: TabItem[] = [
    { value: 'ALL', label: 'Everything', count: TUTORIALS.length },
    ...GROUPS.map((name) => ({
      value: name,
      label: name,
      count: TUTORIALS.filter((item) => item.group === name).length,
    })),
  ];

  return (
    <div>
      <PageHeader
        title="Tutorials"
        subtitle="Step-by-step walkthroughs of the real workflows in GatePass Pro"
        icon={<GraduationCap className="h-5 w-5" />}
        breadcrumbs={[{ label: 'Home', to: '/dashboard' }, { label: 'Tutorials' }]}
      />

      {/* ── Search + group filter ─────────────────────────────────────────── */}
      <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="w-full lg:max-w-sm">
          <Input
            aria-label="Search tutorials"
            placeholder="Search a workflow, a step, a status…"
            leftIcon={<Search className="h-4 w-4" />}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <Tabs
          tabs={tabs}
          value={group}
          onChange={setGroup}
          layoutId="tutorial-tab"
          className="w-full lg:w-auto"
        />
      </div>

      {/* ── Cards ─────────────────────────────────────────────────────────── */}
      {!matches.length ? (
        <EmptyState
          icon={<Search className="h-7 w-7" />}
          title="No tutorial matches that"
          message="Try a status like “HR_REVIEW”, an action like “scan”, or clear the filters."
          action={
            <Button
              variant="secondary"
              onClick={() => {
                setSearch('');
                setGroup('ALL');
              }}
            >
              Clear filters
            </Button>
          }
        />
      ) : (
        <div className="space-y-10">
          {byGroup
            .filter((section) => section.items.length > 0)
            .map((section) => (
              <section key={section.name}>
                <div className="mb-4 flex items-center gap-3">
                  <span
                    className={cn(
                      'flex h-8 w-8 items-center justify-center rounded-xl',
                      GROUP_TONE[section.name]
                    )}
                  >
                    <ShieldCheck className="h-4 w-4" />
                  </span>
                  <h2 className="text-base font-semibold text-content">{section.name}</h2>
                  <span className="h-px flex-1 bg-line" />
                  <Badge tone="neutral">{section.items.length}</Badge>
                </div>

                <motion.div
                  variants={staggerContainer(0.05)}
                  initial="initial"
                  animate="animate"
                  className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
                >
                  {section.items.map((tutorial) => {
                    const Icon = tutorial.icon;
                    return (
                      <motion.div key={tutorial.id} variants={staggerItem} className="h-full">
                        <Card interactive padding="lg" className="group flex h-full flex-col">
                          {/* Stretched hit area — the whole card is one button, but the
                              text below still lays out normally. */}
                          <button
                            type="button"
                            onClick={() => setActive(tutorial)}
                            aria-label={`Open the walkthrough: ${tutorial.title}`}
                            className="absolute inset-0 z-10 rounded-2xl"
                          />

                          <div
                            className={cn(
                              'mb-4 flex h-11 w-11 items-center justify-center rounded-2xl transition-transform duration-300 group-hover:scale-110',
                              GROUP_TONE[tutorial.group]
                            )}
                          >
                            <Icon className="h-5 w-5" />
                          </div>

                          <h3 className="text-base font-semibold text-content">{tutorial.title}</h3>
                          <p className="mt-1.5 flex-1 text-sm leading-relaxed text-content-muted">
                            {tutorial.summary}
                          </p>

                          <div className="mt-5 flex items-center justify-between gap-3">
                            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-content-subtle">
                              <Clock className="h-3.5 w-3.5" />
                              {tutorial.steps.length} steps · {tutorial.minutes} min
                            </span>
                            <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-semibold text-brand-600 transition-transform group-hover:translate-x-0.5 dark:text-brand-300">
                              Walk me through it
                              <ArrowRight className="h-3.5 w-3.5" />
                            </span>
                          </div>
                        </Card>
                      </motion.div>
                    );
                  })}
                </motion.div>
              </section>
            ))}
        </div>
      )}

      {/* ── FAQ ───────────────────────────────────────────────────────────── */}
      <section className="mt-12">
        <Card padding="lg">
          <div className="mb-2 flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-gradient-soft text-brand-600 dark:text-brand-300">
              <Sparkles className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-base font-semibold text-content">Quick answers</h2>
              <p className="text-sm text-content-muted">The questions the help desk actually gets</p>
            </div>
          </div>

          <div className="mt-4">
            {FAQS.map((faq) => (
              <FaqRow key={faq.question} question={faq.question} answer={faq.answer} />
            ))}
          </div>
        </Card>
      </section>

      {/* ── Walkthrough modal ─────────────────────────────────────────────── */}
      <Modal
        open={Boolean(active)}
        onClose={() => setActive(null)}
        size="lg"
        title={active?.title}
        description={active ? `${active.group} · ${active.steps.length} steps` : undefined}
        icon={active ? <active.icon className="h-4 w-4" /> : undefined}
        footer={
          <Button onClick={() => setActive(null)}>Got it</Button>
        }
      >
        {active && (
          <motion.ol
            variants={staggerContainer(0.05)}
            initial="initial"
            animate="animate"
            className="space-y-1"
          >
            {active.steps.map((step, index) => {
              const StepIcon = step.icon;
              const last = index === active.steps.length - 1;
              return (
                <motion.li key={step.title} variants={staggerItem} className="flex gap-4">
                  {/* Numbered rail — the connector line makes it read as a sequence. */}
                  <div className="flex flex-col items-center">
                    <span
                      className={cn(
                        'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-bold',
                        GROUP_TONE[active.group]
                      )}
                    >
                      {index + 1}
                    </span>
                    {!last && <span className="my-1 w-px flex-1 bg-line" />}
                  </div>

                  <div className={cn('min-w-0 flex-1', !last && 'pb-6')}>
                    <div className="flex items-center gap-2">
                      <StepIcon className="h-4 w-4 shrink-0 text-content-subtle" />
                      <h3 className="text-sm font-semibold text-content">{step.title}</h3>
                    </div>
                    <p className="mt-1.5 text-sm leading-relaxed text-content-muted">{step.text}</p>
                  </div>
                </motion.li>
              );
            })}
          </motion.ol>
        )}
      </Modal>
    </div>
  );
};

export default Tutorials;
