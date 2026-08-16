import asyncHandler from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/ApiResponse.js';
import env from '../config/env.js';
import {
  sendEmail,
  sendTemplateEmail,
  isEmailEnabled,
  missingGmailConfig,
  credentialSource,
  verifyGmailAuth,
  availableTemplates,
} from '../services/gmail.service.js';

/**
 * Diagnostics for the Gmail transport. Mounted only outside production (see
 * `routes/index.js`) and additionally gated on `settings.update`, so it is
 * unreachable in a deployed environment and privileged even in development.
 *
 * Nothing here echoes a key, token or assertion — only whether a value is set.
 */

/* ─── GET /email-test/status ──────────────────────────────────────────────── */
export const status = asyncHandler(async (_req, res) => {
  const missing = missingGmailConfig();

  return sendSuccess(res, {
    message: 'Gmail transport status',
    data: {
      enabled: isEmailEnabled(),
      missing,
      // Booleans only — the values themselves are never returned.
      configured: {
        GMAIL_ENABLED: env.gmail.enabled,
        GMAIL_SERVICE_ACCOUNT_EMAIL: Boolean(env.gmail.serviceAccountEmail),
        GMAIL_SERVICE_ACCOUNT_PRIVATE_KEY: Boolean(env.gmail.serviceAccountPrivateKey),
        GMAIL_SERVICE_ACCOUNT_KEY_PATH: Boolean(env.gmail.serviceAccountKeyPath),
        GMAIL_IMPERSONATE_USER: Boolean(env.gmail.impersonateUser),
        GMAIL_PROJECT_ID: Boolean(env.gmail.projectId),
        MAIL_FROM: Boolean(env.gmail.from),
      },
      /** 'env' (Cloud Run) | 'file' (local JSON) | null (unresolved). */
      credentialSource: credentialSource(),
      impersonating: env.gmail.impersonateUser || null,
      projectId: env.gmail.projectId || null,
      scopes: env.gmail.scopes,
      from: env.gmail.from || null,
      templates: availableTemplates(),
    },
  });
});

/* ─── POST /email-test/verify ─────────────────────────────────────────────── */
/** Mints a delegated token without sending anything — proves DWD is authorised. */
export const verify = asyncHandler(async (_req, res) => {
  const result = await verifyGmailAuth();
  return sendSuccess(res, {
    message: result.ok
      ? 'Gmail authentication and domain-wide delegation are working'
      : 'Gmail authentication failed',
    data: result,
  });
});

/* ─── POST /email-test/send ───────────────────────────────────────────────── */
export const send = asyncHandler(async (req, res) => {
  const { to, cc, bcc, subject, html, text, replyTo, template, withAttachment } = req.body;

  // Exercises the attachment path end to end without needing an upload.
  const attachments = withAttachment
    ? [
        {
          filename: 'gatepass-email-test.txt',
          content: `Gmail transport test\nGenerated ${new Date().toISOString()}\n`,
          contentType: 'text/plain',
        },
      ]
    : [];

  if (template) {
    const result = await sendTemplateEmail(template, {
      to,
      cc,
      bcc,
      replyTo,
      attachments,
      // Filler so any template renders; unused keys are simply ignored.
      name: req.user?.name ?? 'Tester',
      email: to,
      password: '••••••••',
      otp: '123456',
      expiresInMinutes: 10,
      loginUrl: env.clientUrl,
      resetUrl: `${env.clientUrl}/reset-password?token=test`,
      link: env.clientUrl,
      gatePassNumber: 'GP-TEST-0000-000000',
      employeeName: req.user?.name ?? 'Tester',
      type: 'OFFICIAL',
      reason: 'Gmail transport verification',
    });
    return sendSuccess(res, { message: 'Template email dispatched', data: result });
  }

  const result = await sendEmail({
    to,
    cc,
    bcc,
    replyTo,
    attachments,
    subject: subject || 'GatePass Pro — Gmail transport test',
    html:
      html ||
      `<h2 style="margin:0 0 8px;font-family:Segoe UI,Arial,sans-serif;">Gmail transport is working</h2>
       <p style="font-family:Segoe UI,Arial,sans-serif;color:#475569;">
         Sent via the Gmail API using a service account with domain-wide delegation,
         impersonating <strong>${env.gmail.impersonateUser}</strong>.
       </p>
       <p style="font-family:Segoe UI,Arial,sans-serif;color:#94a3b8;font-size:13px;">
         Generated ${new Date().toISOString()}
       </p>`,
    text,
  });

  return sendSuccess(res, { message: 'Email dispatched', data: result });
});

export default { status, verify, send };
