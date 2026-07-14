/** Inline-styled, dark-friendly email shell. Kept dependency-free on purpose. */
export const emailLayout = ({ title, body }) => `
<!DOCTYPE html>
<html lang="en">
  <head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${title}</title></head>
  <body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 8px 32px rgba(15,23,42,0.08);">
          <tr>
            <td style="background:linear-gradient(135deg,#6366f1,#06b6d4);padding:28px 32px;">
              <span style="color:#fff;font-size:20px;font-weight:700;letter-spacing:-0.02em;">GatePass&nbsp;Pro</span>
              <div style="color:rgba(255,255,255,0.82);font-size:13px;margin-top:4px;">Enterprise Gate Pass Management</div>
            </td>
          </tr>
          <tr><td style="padding:32px;font-size:15px;line-height:1.65;">${body}</td></tr>
          <tr>
            <td style="padding:20px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;color:#64748b;font-size:12px;">
              This is an automated message from GatePass Pro. Please do not reply.
            </td>
          </tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;

const button = (href, label) => `
  <a href="${href}" style="display:inline-block;margin:20px 0;padding:12px 24px;background:#6366f1;color:#fff;text-decoration:none;border-radius:10px;font-weight:600;font-size:14px;">${label}</a>`;

const detail = (label, value) => `
  <tr>
    <td style="padding:6px 0;color:#64748b;font-size:13px;width:150px;">${label}</td>
    <td style="padding:6px 0;color:#0f172a;font-size:13px;font-weight:600;">${value ?? '—'}</td>
  </tr>`;

const detailTable = (rows) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:16px 0;padding:16px;background:#f8fafc;border-radius:12px;">${rows.join('')}</table>`;

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

  gatePassSubmitted: ({ name, gatePassNumber, employeeName, type, reason, link }) => ({
    subject: `Approval needed — Gate Pass ${gatePassNumber}`,
    body: `
      <h2 style="margin:0 0 8px;font-size:20px;">A gate pass needs your approval</h2>
      <p style="margin:0 0 8px;color:#475569;">Hi ${name}, ${employeeName} has raised a gate pass that is waiting for your decision.</p>
      ${detailTable([detail('Gate Pass', gatePassNumber), detail('Employee', employeeName), detail('Type', type), detail('Reason', reason)])}
      ${button(link, 'Review the request')}`,
  }),

  gatePassApproved: ({ name, gatePassNumber, approvedBy, link }) => ({
    subject: `Approved — Gate Pass ${gatePassNumber}`,
    body: `
      <h2 style="margin:0 0 8px;font-size:20px;">Your gate pass was approved 🎉</h2>
      <p style="margin:0 0 8px;color:#475569;">Hi ${name}, ${approvedBy} approved your gate pass. Show the QR code at the gate when you leave.</p>
      ${detailTable([detail('Gate Pass', gatePassNumber), detail('Approved by', approvedBy)])}
      ${button(link, 'View the gate pass')}`,
  }),

  gatePassRejected: ({ name, gatePassNumber, rejectedBy, comment, link }) => ({
    subject: `Rejected — Gate Pass ${gatePassNumber}`,
    body: `
      <h2 style="margin:0 0 8px;font-size:20px;">Your gate pass was rejected</h2>
      <p style="margin:0 0 8px;color:#475569;">Hi ${name}, ${rejectedBy} rejected your gate pass.</p>
      ${detailTable([detail('Gate Pass', gatePassNumber), detail('Rejected by', rejectedBy), detail('Reason', comment)])}
      ${button(link, 'View the gate pass')}`,
  }),

  changesRequested: ({ name, gatePassNumber, requestedBy, comment, link }) => ({
    subject: `Changes requested — Gate Pass ${gatePassNumber}`,
    body: `
      <h2 style="margin:0 0 8px;font-size:20px;">Changes were requested</h2>
      <p style="margin:0 0 8px;color:#475569;">Hi ${name}, ${requestedBy} has asked you to update your gate pass before it can proceed.</p>
      ${detailTable([detail('Gate Pass', gatePassNumber), detail('Comment', comment)])}
      ${button(link, 'Update the gate pass')}`,
  }),

  hrReviewPending: ({ name, gatePassNumber, employeeName, link }) => ({
    subject: `HR review — Gate Pass ${gatePassNumber}`,
    body: `
      <h2 style="margin:0 0 8px;font-size:20px;">A gate pass is waiting for HR review</h2>
      <p style="margin:0 0 8px;color:#475569;">Hi ${name}, ${employeeName}'s gate pass has been approved by their manager and is now in the HR queue.</p>
      ${detailTable([detail('Gate Pass', gatePassNumber), detail('Employee', employeeName)])}
      ${button(link, 'Open the HR queue')}`,
  }),

  gatePassCompleted: ({ name, gatePassNumber, outTime, inTime, link }) => ({
    subject: `Completed — Gate Pass ${gatePassNumber}`,
    body: `
      <h2 style="margin:0 0 8px;font-size:20px;">Gate pass completed</h2>
      <p style="margin:0 0 8px;color:#475569;">Hi ${name}, your return has been recorded at the gate and the pass is now closed.</p>
      ${detailTable([detail('Gate Pass', gatePassNumber), detail('Actual out', outTime), detail('Actual in', inTime)])}
      ${button(link, 'View the gate pass')}`,
  }),

  reminder: ({ name, gatePassNumber, message, link }) => ({
    subject: `Reminder — Gate Pass ${gatePassNumber}`,
    body: `
      <h2 style="margin:0 0 8px;font-size:20px;">Reminder</h2>
      <p style="margin:0 0 8px;color:#475569;">Hi ${name}, ${message}</p>
      ${button(link, 'Open GatePass Pro')}`,
  }),
};

export default { emailLayout, templates };
