/**
 * Inline-styled, client-safe email shell. Kept dependency-free on purpose:
 * table layout and inline styles are what actually survive Outlook and Gmail.
 *
 * Branded for Amsons Group / GatePass Pro. The signature is unchanged
 * (`{ title, body }`), so `email.service.js` and `gmail.service.js` both keep
 * working without modification.
 */
export const emailLayout = ({ title, body }) => `
<!DOCTYPE html>
<html lang="en">
  <head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${title}</title></head>
  <body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 8px 32px rgba(15,23,42,0.08);">
          <tr>
            <td style="background:linear-gradient(135deg,#6366f1,#06b6d4);padding:26px 32px;">
              <div style="color:#fff;font-size:21px;font-weight:700;letter-spacing:-0.02em;">Amsons&nbsp;Group</div>
              <div style="color:rgba(255,255,255,0.85);font-size:13px;margin-top:3px;">GatePass&nbsp;Pro &middot; Enterprise Gate Pass &amp; Leave Management</div>
            </td>
          </tr>
          <tr><td style="padding:30px 32px;font-size:15px;line-height:1.65;">${body}</td></tr>
          <tr>
            <td style="padding:18px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;color:#64748b;font-size:12px;line-height:1.6;">
              This is an automated message from <strong style="color:#475569;">GatePass&nbsp;Pro</strong>, Amsons Group. Please do not reply to this email.<br />
              If an action is required, sign in to the portal using the button above.
            </td>
          </tr>
        </table>
        <div style="max-width:600px;margin:14px auto 0;color:#94a3b8;font-size:11px;">
          &copy; ${new Date().getFullYear()} Amsons Group. Sent to you because you are part of this request's workflow.
        </div>
      </td></tr>
    </table>
  </body>
</html>`;

/* ─── Reusable building blocks ────────────────────────────────────────────────
 * Shared by every template so no controller or service ever writes HTML.
 * ────────────────────────────────────────────────────────────────────────────*/

/** Coloured status pill. Falls back to neutral for an unknown status. */
const STATUS_TONE = {
  PENDING: ['#fef3c7', '#92400e'],
  CHANGES_REQUESTED: ['#dbeafe', '#1e40af'],
  HR_REVIEW: ['#e0e7ff', '#3730a3'],
  APPROVED: ['#d1fae5', '#065f46'],
  REJECTED: ['#fee2e2', '#991b1b'],
  OUT: ['#cffafe', '#155e75'],
  COMPLETED: ['#d1fae5', '#065f46'],
  CANCELLED: ['#e2e8f0', '#475569'],
  EXPIRED: ['#fee2e2', '#991b1b'],
};

export const statusBadge = (status) => {
  const [bg, fg] = STATUS_TONE[status] ?? ['#e2e8f0', '#475569'];
  const label = String(status ?? '').replace(/_/g, ' ');
  return `<span style="display:inline-block;padding:5px 12px;border-radius:999px;background:${bg};color:${fg};font-size:12px;font-weight:700;letter-spacing:0.03em;text-transform:uppercase;">${label}</span>`;
};

const button = (href, label) =>
  !href
    ? ''
    : `<a href="${href}" style="display:inline-block;margin:22px 0 4px;padding:12px 26px;background:#6366f1;color:#fff;text-decoration:none;border-radius:10px;font-weight:600;font-size:14px;">${label}</a>`;

const detail = (label, value) =>
  value === undefined || value === null || value === ''
    ? ''
    : `<tr>
    <td style="padding:7px 0;color:#64748b;font-size:13px;width:170px;vertical-align:top;">${label}</td>
    <td style="padding:7px 0;color:#0f172a;font-size:13px;font-weight:600;">${value}</td>
  </tr>`;

const detailTable = (rows) => {
  const body = rows.filter(Boolean).join('');
  return !body
    ? ''
    : `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:18px 0;padding:16px 18px;background:#f8fafc;border-radius:12px;border:1px solid #e2e8f0;">${body}</table>`;
};

/** "Action required" call-out. Used only when the recipient must do something. */
const actionRequired = (text) =>
  !text
    ? ''
    : `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:18px 0;">
    <tr><td style="padding:14px 16px;background:#fffbeb;border-left:4px solid #f59e0b;border-radius:8px;color:#92400e;font-size:13px;line-height:1.6;">
      <strong style="display:block;margin-bottom:3px;">Action required</strong>${text}
    </td></tr>
  </table>`;

const heading = (text, status) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;">
    <tr>
      <td style="font-size:19px;font-weight:700;color:#0f172a;padding-bottom:6px;">${text}</td>
      ${status ? `<td align="right" style="padding-bottom:6px;">${statusBadge(status)}</td>` : ''}
    </tr>
  </table>`;

const lead = (text) => `<p style="margin:0 0 6px;color:#475569;">${text}</p>`;

/** Shared identity block — the same five rows on every gate pass email. */
const employeeRows = ({ employeeName, employeeCode, departmentName, unitName, designation }) => [
  detail('Employee', employeeName),
  detail('Employee code', employeeCode),
  detail('Department', departmentName),
  detail('Unit', unitName),
  detail('Designation', designation),
];

/*
 * The previous `button` / `detail` / `detailTable` helpers lived here. They are
 * now defined once above, alongside the other shared blocks, with the same
 * signatures — so every template below keeps working unchanged.
 */

export const templates = {
  welcome: ({ name, email, password, loginUrl }) => ({
    subject: 'Welcome to GatePass Pro',
    body: `
      <h2 style="margin:0 0 8px;font-size:20px;">Welcome, ${name}!</h2>
      <p style="margin:0 0 8px;color:#475569;">An account has been created for you on GatePass Pro. Use the credentials below to sign in, then change your password from your profile.</p>
      ${detailTable([detail('Email', email), detail('Temporary password', password)])}
      ${button(loginUrl, 'Sign in to GatePass Pro')}`,
  }),

  resetPassword: ({ name, resetUrl, expiresInMinutes }) => ({
    subject: 'Reset your GatePass Pro password',
    body: `
      <h2 style="margin:0 0 8px;font-size:20px;">Password reset requested</h2>
      <p style="margin:0 0 8px;color:#475569;">Hi ${name}, click the button below to choose a new password. The link expires in ${expiresInMinutes} minutes.</p>
      ${button(resetUrl, 'Reset password')}
      <p style="margin:8px 0 0;color:#94a3b8;font-size:13px;">If you did not request this, you can safely ignore this email.</p>`,
  }),

  otp: ({ name, otp, expiresInMinutes }) => ({
    subject: `${otp} is your GatePass Pro verification code`,
    body: `
      <h2 style="margin:0 0 8px;font-size:20px;">Verification code</h2>
      <p style="margin:0 0 8px;color:#475569;">Hi ${name}, use this code to continue. It expires in ${expiresInMinutes} minutes.</p>
      <div style="margin:24px 0;padding:20px;text-align:center;background:#f1f5f9;border-radius:12px;font-size:32px;font-weight:700;letter-spacing:10px;color:#4f46e5;">${otp}</div>`,
  }),

  /* ── Gate pass ─────────────────────────────────────────────────────────── */

  gatePassSubmitted: (d) => ({
    subject: `Gate Pass Approval Required — ${d.gatePassNumber}`,
    body: `
      ${heading('A gate pass needs your approval', 'PENDING')}
      ${lead(`Hi ${d.name}, <strong>${d.employeeName}</strong> has raised a gate pass that is waiting on your decision.`)}
      ${detailTable([
        detail('Gate Pass', d.gatePassNumber),
        ...employeeRows(d),
        detail('Type', d.type),
        detail('Reason', d.reason),
        detail('Purpose', d.purpose),
        detail('Expected out', d.expectedOutTime),
        detail('Expected in', d.expectedInTime),
        detail('Current stage', 'Reporting manager (HOD)'),
      ])}
      ${actionRequired('Approve or reject this request in GatePass Pro. The employee cannot leave the premises until it is decided.')}
      ${button(d.link, 'Review the request')}`,
  }),

  gatePassApproved: (d) => ({
    subject: `Gate Pass Approved — ${d.gatePassNumber}`,
    body: `
      ${heading('Your gate pass was approved', 'APPROVED')}
      ${lead(`Hi ${d.name}, <strong>${d.approvedBy}</strong> approved your gate pass. Show the QR code at the gate when you leave.`)}
      ${detailTable([
        detail('Gate Pass', d.gatePassNumber),
        detail('Approved by', d.approvedBy),
        detail('Type', d.type),
        detail('Reason', d.reason),
        detail('Expected out', d.expectedOutTime),
        detail('Expected in', d.expectedInTime),
        detail('Next step', d.nextStep ?? 'Present the QR code to Security at the gate'),
      ])}
      ${button(d.link, 'View the gate pass')}`,
  }),

  gatePassRejected: (d) => ({
    subject: `Gate Pass Rejected — ${d.gatePassNumber}`,
    body: `
      ${heading('Your gate pass was rejected', 'REJECTED')}
      ${lead(`Hi ${d.name}, <strong>${d.rejectedBy}</strong> rejected your gate pass.`)}
      ${detailTable([
        detail('Gate Pass', d.gatePassNumber),
        detail('Rejected by', d.rejectedBy),
        detail('Stage', d.stage),
        detail('Reason given', d.comment || 'No reason was provided'),
      ])}
      ${button(d.link, 'View the gate pass')}`,
  }),

  changesRequested: (d) => ({
    subject: `Changes Requested — Gate Pass ${d.gatePassNumber}`,
    body: `
      ${heading('Changes were requested', 'CHANGES_REQUESTED')}
      ${lead(`Hi ${d.name}, <strong>${d.requestedBy}</strong> has asked you to update your gate pass before it can proceed.`)}
      ${detailTable([detail('Gate Pass', d.gatePassNumber), detail('Comment', d.comment)])}
      ${actionRequired('Update the request and resubmit it for approval.')}
      ${button(d.link, 'Update the gate pass')}`,
  }),

  hrReviewPending: (d) => ({
    subject: `HR Review Required — ${d.gatePassNumber}`,
    body: `
      ${heading('A gate pass is waiting for HR review', 'HR_REVIEW')}
      ${lead(`Hi ${d.name}, <strong>${d.employeeName}</strong>'s gate pass has cleared their reporting manager and is now in the HR queue.`)}
      ${detailTable([
        detail('Gate Pass', d.gatePassNumber),
        ...employeeRows(d),
        detail('Type', d.type),
        detail('Reason', d.reason),
        detail('Expected out', d.expectedOutTime),
        detail('Expected in', d.expectedInTime),
        detail('Approved by', d.approvedBy),
        detail('Current stage', 'HR review'),
      ])}
      ${actionRequired('Review this gate pass and mark it OK or Not OK.')}
      ${button(d.link, 'Open the HR queue')}`,
  }),

  securityActionRequired: (d) => ({
    subject: `Security Action Required — ${d.gatePassNumber}`,
    body: `
      ${heading('An approved gate pass is cleared for the gate', 'APPROVED')}
      ${lead(`Hi ${d.name}, <strong>${d.employeeName}</strong> is cleared to exit. Scan the QR code and record the movement at the gate.`)}
      ${detailTable([
        detail('Gate Pass', d.gatePassNumber),
        ...employeeRows(d),
        detail('Type', d.type),
        detail('Reason', d.reason),
        detail('Expected out', d.expectedOutTime),
        detail('Expected in', d.expectedInTime),
        detail('Current stage', 'Security'),
      ])}
      ${actionRequired('Scan the QR code and mark the exit, then mark the return when the employee is back.')}
      ${button(d.link, 'Open the security console')}`,
  }),

  gatePassCompleted: (d) => ({
    subject: `Gate Pass Completed — ${d.gatePassNumber}`,
    body: `
      ${heading('Gate pass completed', 'COMPLETED')}
      ${lead(`Hi ${d.name}, your return has been recorded at the gate and the pass is now closed.`)}
      ${detailTable([
        detail('Gate Pass', d.gatePassNumber),
        detail('Actual out', d.outTime),
        detail('Actual in', d.inTime),
        detail('Late by', d.lateBy),
      ])}
      ${button(d.link, 'View the gate pass')}`,
  }),

  reminder: (d) => ({
    subject: `Reminder — Gate Pass ${d.gatePassNumber}`,
    body: `
      ${heading('Reminder')}
      ${lead(`Hi ${d.name}, ${d.message}`)}
      ${button(d.link, 'Open GatePass Pro')}`,
  }),

  /* ── Leave ─────────────────────────────────────────────────────────────── */

  /** Shared identity rows for leave, mirroring the gate pass block. */
  leaveSubmitted: (d) => ({
    subject: `Leave Approval Required — ${d.leaveNumber}`,
    body: `
      ${heading('A leave application needs your approval', 'PENDING')}
      ${lead(`Hi ${d.name}, <strong>${d.employeeName}</strong> has applied for leave and it is waiting on your decision.`)}
      ${detailTable([
        detail('Leave request', d.leaveNumber),
        ...employeeRows(d),
        detail('Leave type', d.leaveTypeName),
        detail('From', d.fromDate),
        detail('To', d.toDate),
        detail('Total days', d.totalDays),
        detail('Reason', d.reason),
        detail('Contact during leave', d.contactDuringLeave),
        detail('Current stage', 'Reporting manager (HOD)'),
      ])}
      ${actionRequired('Approve or reject this leave application in GatePass Pro.')}
      ${button(d.link, 'Review the application')}`,
  }),

  leaveHrReview: (d) => ({
    subject: `Leave HR Review Required — ${d.leaveNumber}`,
    body: `
      ${heading('A leave application is waiting for HR review', 'HR_REVIEW')}
      ${lead(`Hi ${d.name}, <strong>${d.employeeName}</strong>'s leave has cleared their reporting manager and is now with HR.`)}
      ${detailTable([
        detail('Leave request', d.leaveNumber),
        ...employeeRows(d),
        detail('Leave type', d.leaveTypeName),
        detail('From', d.fromDate),
        detail('To', d.toDate),
        detail('Total days', d.totalDays),
        detail('Reason', d.reason),
        detail('Approved by', d.approvedBy),
        detail('Current stage', 'HR review'),
      ])}
      ${actionRequired('Approving here is the FINAL step — the balance is deducted at that point.')}
      ${button(d.link, 'Open the HR queue')}`,
  }),

  leaveApproved: (d) => ({
    subject: `Leave Approved — ${d.leaveNumber}`,
    body: `
      ${heading('Your leave was approved', 'APPROVED')}
      ${lead(`Hi ${d.name}, your leave application has been approved by <strong>${d.approvedBy}</strong>.`)}
      ${detailTable([
        detail('Leave request', d.leaveNumber),
        detail('Leave type', d.leaveTypeName),
        detail('From', d.fromDate),
        detail('To', d.toDate),
        detail('Total days', d.totalDays),
        detail('Approved by', d.approvedBy),
        detail('Remarks', d.remarks),
        detail('Balance deducted', d.balanceDeducted),
      ])}
      ${button(d.link, 'View my leaves')}`,
  }),

  leaveForwarded: (d) => ({
    subject: `Leave Forwarded to HR — ${d.leaveNumber}`,
    body: `
      ${heading('Your leave cleared your manager', 'HR_REVIEW')}
      ${lead(`Hi ${d.name}, <strong>${d.approvedBy}</strong> approved your leave. It is now with HR for the final decision.`)}
      ${detailTable([
        detail('Leave request', d.leaveNumber),
        detail('Leave type', d.leaveTypeName),
        detail('From', d.fromDate),
        detail('To', d.toDate),
        detail('Total days', d.totalDays),
        detail('Remarks', d.remarks),
        detail('Next step', 'HR review'),
      ])}
      ${button(d.link, 'View my leaves')}`,
  }),

  leaveRejected: (d) => ({
    subject: `Leave Rejected — ${d.leaveNumber}`,
    body: `
      ${heading('Your leave was rejected', 'REJECTED')}
      ${lead(`Hi ${d.name}, <strong>${d.rejectedBy}</strong> rejected your leave application. Your leave balance is unchanged.`)}
      ${detailTable([
        detail('Leave request', d.leaveNumber),
        detail('Leave type', d.leaveTypeName),
        detail('From', d.fromDate),
        detail('To', d.toDate),
        detail('Total days', d.totalDays),
        detail('Rejected at', d.stage),
        detail('Reason given', d.remarks || 'No reason was provided'),
      ])}
      ${button(d.link, 'View my leaves')}`,
  }),

  leaveSentBack: (d) => ({
    subject: `Leave Returned for Review — ${d.leaveNumber}`,
    body: `
      ${heading('HR sent a leave application back', 'PENDING')}
      ${lead(`Hi ${d.name}, HR has returned <strong>${d.employeeName}</strong>'s leave application for another look.`)}
      ${detailTable([
        detail('Leave request', d.leaveNumber),
        detail('Employee', d.employeeName),
        detail('Leave type', d.leaveTypeName),
        detail('From', d.fromDate),
        detail('To', d.toDate),
        detail('HR remarks', d.remarks),
      ])}
      ${actionRequired('Reconsider this application and approve or reject it.')}
      ${button(d.link, 'Open the approval queue')}`,
  }),

  leaveCancelled: (d) => ({
    subject: `Leave Record Deleted — ${d.leaveNumber}`,
    body: `
      ${heading('A leave record was deleted', 'CANCELLED')}
      ${lead(`Hi ${d.name}, <strong>${d.deletedBy}</strong> deleted one of your leave records.`)}
      ${detailTable([
        detail('Leave request', d.leaveNumber),
        detail('Leave type', d.leaveTypeName),
        detail('From', d.fromDate),
        detail('To', d.toDate),
        detail('Total days', d.totalDays),
        detail('Days returned to balance', d.restoredDays),
        detail('Reason', d.reason),
      ])}
      ${button(d.link, 'View my leaves')}`,
  }),

  leaveAppliedOnBehalf: (d) => ({
    subject: `Leave Applied On Your Behalf — ${d.leaveNumber}`,
    body: `
      ${heading('Leave was applied for you', 'PENDING')}
      ${lead(`Hi ${d.name}, <strong>${d.appliedBy}</strong> raised a leave application on your behalf. It is now with your reporting manager.`)}
      ${detailTable([
        detail('Leave request', d.leaveNumber),
        detail('Leave type', d.leaveTypeName),
        detail('From', d.fromDate),
        detail('To', d.toDate),
        detail('Total days', d.totalDays),
        detail('Reason', d.reason),
      ])}
      ${button(d.link, 'View my leaves')}`,
  }),
};

export default { emailLayout, templates, statusBadge };
