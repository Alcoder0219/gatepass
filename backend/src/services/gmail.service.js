import fs from 'node:fs';
import path from 'node:path';
import { google } from 'googleapis';
import MailComposer from 'nodemailer/lib/mail-composer/index.js';

import env from '../config/env.js';
import logger from '../utils/logger.js';
import ApiError from '../utils/ApiError.js';
import { emailLayout, templates } from '../helpers/emailTemplates.js';

/**
 * Gmail API transport — service account + domain-wide delegation.
 *
 * LAYERING. This file is the transport and nothing else: it knows how to
 * authenticate, build a MIME message and hand it to Gmail. It contains no
 * GatePass or Leave wording, and no workflow ever calls the Gmail SDK directly.
 *
 *     business workflow  →  template (helpers/emailTemplates.js)
 *                        →  this transport  →  Gmail API
 *
 * It is ADDITIVE. `services/email.service.js` (SMTP/nodemailer) is untouched
 * and still serves every existing notification path; nothing is routed here
 * until a caller opts in.
 *
 * Auth uses a JWT assertion with `subject` set to the impersonated Workspace
 * user — no browser OAuth, no refresh tokens stored anywhere, scope limited to
 * gmail.send.
 */

/* Cached across calls: minting a JWT and fetching a token on every send would
 * add a round trip to Google for each email. google-auth-library refreshes the
 * access token internally when it expires. */
let cachedClient = null;
let cachedGmail = null;

/** Never let a key, token or assertion reach the logs. */
const REDACTED = '[redacted]';

/**
 * Strips anything credential-shaped out of an error before it is logged.
 *
 * This is not theoretical. Google's token endpoint echoes the signed assertion
 * back inside the failure message — e.g.
 *   "SignatureException: Invalid signature for token: eyJhbGciOi..."
 * A keyword-anchored filter misses that, because the word there is "token",
 * not "access_token". The assertion is a bearer credential, so the JWT SHAPE
 * itself is matched rather than any label that happens to precede it.
 */
const safeErrorMessage = (error) => {
  const raw = error?.response?.data?.error_description || error?.message || String(error);
  return String(raw)
    // PEM blocks.
    .replace(/-----BEGIN[\s\S]*?-----END[^-]*-----/g, REDACTED)
    // Any JWT / signed assertion, labelled or not: three base64url segments.
    .replace(/\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]+/g, REDACTED)
    .replace(/\b[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\b/g, REDACTED)
    // Labelled secrets, including bare "token".
    .replace(
      /\b(assertion|access[_-]?token|id[_-]?token|refresh[_-]?token|private[_-]?key|client[_-]?secret|token)\b\s*[:=]\s*["']?[\w.\-+/=]+/gi,
      `$1: ${REDACTED}`
    )
    // Long opaque blobs (e.g. ya29.* access tokens).
    .replace(/\bya29\.[\w.\-]+/g, REDACTED)
    .slice(0, 500);
};

/**
 * Resolves the service-account credentials from one of two sources.
 *
 *   1. GMAIL_SERVICE_ACCOUNT_EMAIL + GMAIL_SERVICE_ACCOUNT_PRIVATE_KEY
 *      → Cloud Run. Set through Variables & Secrets; no file on disk.
 *   2. GMAIL_SERVICE_ACCOUNT_KEY_PATH
 *      → local development. Reads backend/secrets/service-account.json.
 *
 * The env vars WIN. Production must never depend on a file that may or may not
 * have been baked into the image, and a stray local key must not be able to
 * override a deployed configuration.
 *
 * Read lazily and cached: nothing touches the disk until the first email, and
 * an app that never sends never opens the file at all.
 */
let cachedCredentials = null;

const resolveCredentials = () => {
  if (cachedCredentials) return cachedCredentials;

  const { serviceAccountEmail, serviceAccountPrivateKey, serviceAccountKeyPath } = env.gmail;

  // ── 1. Environment variables (Cloud Run) ────────────────────────────────
  if (serviceAccountEmail && serviceAccountPrivateKey) {
    cachedCredentials = {
      clientEmail: serviceAccountEmail,
      privateKey: serviceAccountPrivateKey,
      source: 'env',
    };
    return cachedCredentials;
  }

  // ── 2. JSON key file (local development) ────────────────────────────────
  if (serviceAccountKeyPath) {
    // Relative paths resolve from `backend/`, matching how the app is started.
    const resolved = path.isAbsolute(serviceAccountKeyPath)
      ? serviceAccountKeyPath
      : path.resolve(process.cwd(), serviceAccountKeyPath);

    if (!fs.existsSync(resolved)) {
      // Path only — never the contents.
      logger.warn(`[gmail] key file not found at ${resolved}`);
      return null;
    }

    try {
      const parsed = JSON.parse(fs.readFileSync(resolved, 'utf8'));
      if (!parsed.client_email || !parsed.private_key) {
        logger.error('[gmail] key file is missing client_email or private_key');
        return null;
      }

      cachedCredentials = {
        clientEmail: parsed.client_email,
        // Keys inside a JSON file already carry real newlines, but normalise
        // anyway so a hand-edited file behaves the same as an env var.
        privateKey: String(parsed.private_key).replace(/\\n/g, '\n'),
        source: 'file',
        // Non-secret metadata, useful in diagnostics.
        projectId: parsed.project_id,
        clientId: parsed.client_id,
      };
      // Deliberately logs only the path and the client email — never the key,
      // and never the parsed object (which would dump the whole credential).
      logger.info(`[gmail] credentials loaded from ${resolved} (${parsed.client_email})`);
      return cachedCredentials;
    } catch (error) {
      logger.error(`[gmail] could not read the key file: ${error.message}`);
      return null;
    }
  }

  return null;
};

/** True when the Gmail transport is switched on AND fully configured. */
export const isEmailEnabled = () => {
  const { enabled, impersonateUser } = env.gmail;
  return Boolean(enabled && impersonateUser && resolveCredentials());
};

/** Which required settings are missing — for diagnostics, never values. */
export const missingGmailConfig = () => {
  const { enabled, impersonateUser } = env.gmail;
  const missing = [];
  if (!enabled) missing.push('GMAIL_ENABLED');
  if (!impersonateUser) missing.push('GMAIL_IMPERSONATE_USER');
  if (!resolveCredentials()) {
    missing.push(
      'credentials (set GMAIL_SERVICE_ACCOUNT_EMAIL + GMAIL_SERVICE_ACCOUNT_PRIVATE_KEY, ' +
        'or GMAIL_SERVICE_ACCOUNT_KEY_PATH)'
    );
  }
  return missing;
};

/** Where the credentials came from — 'env', 'file' or null. Never the values. */
export const credentialSource = () => resolveCredentials()?.source ?? null;

/**
 * Builds (once) the delegated JWT client and the Gmail API binding.
 * Throws an ApiError rather than a raw SDK error so callers see something
 * actionable and nothing sensitive escapes.
 */
const getGmailClient = () => {
  if (cachedGmail) return cachedGmail;

  const missing = missingGmailConfig();
  if (missing.length) {
    throw ApiError.internal(`Gmail transport is not configured: ${missing.join(', ')}`);
  }

  const { impersonateUser, scopes } = env.gmail;
  const credentials = resolveCredentials();

  // A PEM that still carries literal \n is normalised on the way in; this
  // catches a key mangled some other way, before Google returns an opaque
  // "DECODER routines::unsupported" error that says nothing useful.
  if (!credentials.privateKey.includes('BEGIN') || !credentials.privateKey.includes('\n')) {
    throw ApiError.internal(
      'The Gmail private key does not look like a PEM. Supply the full key including ' +
        'the BEGIN/END lines (escaped \\n is handled automatically), or point ' +
        'GMAIL_SERVICE_ACCOUNT_KEY_PATH at the downloaded JSON.'
    );
  }

  cachedClient = new google.auth.JWT({
    email: credentials.clientEmail,
    key: credentials.privateKey,
    scopes,
    // Domain-wide delegation: act as this Workspace user.
    subject: impersonateUser,
  });

  cachedGmail = google.gmail({ version: 'v1', auth: cachedClient });
  return cachedGmail;
};

/** Drops the cached client and credentials. Useful after a config change. */
export const resetGmailClient = () => {
  cachedClient = null;
  cachedGmail = null;
  cachedCredentials = null;
};

/**
 * Confirms the service account can mint a delegated token, without sending
 * anything. This is the call that fails loudly when domain-wide delegation is
 * not authorised for the client ID / scope.
 */
export const verifyGmailAuth = async () => {
  const missing = missingGmailConfig();
  if (missing.length) return { ok: false, configured: false, missing };

  try {
    getGmailClient();
    await cachedClient.authorize(); // token is held in the client, never returned
    return {
      ok: true,
      configured: true,
      impersonating: env.gmail.impersonateUser,
      // From the resolved credentials, which may have come from the JSON file.
      serviceAccount: resolveCredentials()?.clientEmail ?? null,
      credentialSource: credentialSource(),
      scopes: env.gmail.scopes,
    };
  } catch (error) {
    const message = safeErrorMessage(error);
    logger.error(`Gmail auth verification failed: ${message}`);
    return { ok: false, configured: true, error: message };
  }
};

const asAddressList = (value) => {
  if (!value) return undefined;
  const list = (Array.isArray(value) ? value : String(value).split(','))
    .map((entry) => String(entry).trim())
    .filter(Boolean);
  return list.length ? list.join(', ') : undefined;
};

/**
 * Renders an RFC 2822 message and base64url-encodes it for the Gmail API.
 *
 * MailComposer comes from nodemailer, already a dependency. Hand-rolling
 * multipart/alternative plus multipart/mixed is where these integrations
 * usually break — encodings, boundaries, long headers and non-ASCII subjects.
 * Reusing the composer gets all of that right and adds no new package.
 */
export const buildRawMessage = async ({ from, to, cc, bcc, subject, html, text, replyTo, attachments, headers }) => {
  const mail = new MailComposer({
    from,
    to: asAddressList(to),
    cc: asAddressList(cc),
    bcc: asAddressList(bcc),
    replyTo: asAddressList(replyTo),
    subject,
    html: html || undefined,
    // Plain-text fallback: explicit when given, otherwise derived from the HTML
    // so a text-only client never receives an empty body.
    text: text || (html ? htmlToText(html) : undefined),
    attachments,
    headers,
  });

  /*
   * keepBcc is REQUIRED here and easy to miss.
   *
   * MailComposer drops the Bcc header when it builds, which is right for SMTP:
   * there the recipients come from the envelope (RCPT TO), so keeping the
   * header would only leak the blind copy to everyone else.
   *
   * The Gmail API has no envelope — `users.messages.send` derives recipients
   * from the headers of the raw message. Without this the BCC address is
   * silently dropped and never receives the mail, with no error anywhere.
   * Gmail strips the header itself before delivery, so blindness is preserved.
   *
   * It has to be set on the compiled MimeNode: MailComposer does not forward
   * `keepBcc` from the mail object, and `build()` takes no options.
   */
  const node = mail.compile();
  node.keepBcc = true;

  const message = await node.build();
  return message.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

/** Crude but dependency-free HTML → text for the multipart fallback. */
export const htmlToText = (html) =>
  String(html)
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();

/**
 * Sends one email through Gmail.
 *
 * NEVER THROWS. Email is a side effect of a business action — a failed
 * notification must not roll back the gate pass or leave request that
 * triggered it. Callers get `{ ok, skipped?, messageId?, error? }` and can
 * ignore it safely. This mirrors how `notification.service.js` already treats
 * delivery failures.
 *
 * @param {object}   options
 * @param {string|string[]} options.to        required
 * @param {string|string[]} [options.cc]
 * @param {string|string[]} [options.bcc]
 * @param {string}   options.subject
 * @param {string}   [options.html]
 * @param {string}   [options.text]           falls back to a text render of `html`
 * @param {string|string[]} [options.replyTo]
 * @param {Array}    [options.attachments]    nodemailer attachment objects
 * @param {object}   [options.headers]
 */
export const sendEmail = async ({
  to,
  cc,
  bcc,
  subject,
  html,
  text,
  replyTo,
  attachments = [],
  from,
  headers,
} = {}) => {
  const recipients = asAddressList(to);

  if (!recipients) {
    logger.warn('[gmail] send skipped — no recipient supplied');
    return { ok: false, skipped: true, reason: 'NO_RECIPIENT' };
  }

  if (!isEmailEnabled()) {
    // Not an error: this is the normal state in dev and before the Cloud Run
    // variables are set. Logged at info so the intent is still visible.
    logger.info(`[gmail] disabled — would have sent "${subject}" to ${recipients}`);
    return { ok: false, skipped: true, reason: 'DISABLED', missing: missingGmailConfig() };
  }

  try {
    const gmail = getGmailClient();

    const raw = await buildRawMessage({
      from: from || env.gmail.from || env.gmail.impersonateUser,
      to,
      cc,
      bcc,
      subject,
      html,
      text,
      replyTo,
      attachments,
      headers,
    });

    const { data } = await gmail.users.messages.send({ userId: 'me', requestBody: { raw } });

    logger.info(
      `[gmail] sent "${subject}" → ${recipients}` +
        `${cc ? ` cc:${asAddressList(cc)}` : ''}` +
        `${attachments.length ? ` (${attachments.length} attachment(s))` : ''}` +
        ` id=${data.id}`
    );

    return { ok: true, messageId: data.id, threadId: data.threadId, to: recipients };
  } catch (error) {
    const message = safeErrorMessage(error);
    logger.error(`[gmail] failed to send "${subject}" to ${recipients}: ${message}`);
    return { ok: false, error: message, to: recipients };
  }
};

/**
 * Renders one of the shared templates and sends it.
 *
 * Templates live in `helpers/emailTemplates.js` — the same registry the SMTP
 * transport uses — so wording is defined once and both transports stay in
 * step. Adding a template means editing that file only; this transport never
 * needs to change.
 */
export const sendTemplateEmail = async (template, { to, cc, bcc, replyTo, attachments, ...data } = {}) => {
  const builder = templates[template];
  if (!builder) {
    logger.error(`[gmail] unknown email template: ${template}`);
    return { ok: false, error: `Unknown email template: ${template}` };
  }

  const { subject, body } = builder(data);
  return sendEmail({
    to,
    cc,
    bcc,
    replyTo,
    attachments,
    subject,
    html: emailLayout({ title: subject, body }),
  });
};

/** Template names available to callers — handy for a future admin screen. */
export const availableTemplates = () => Object.keys(templates);

export default {
  sendEmail,
  sendTemplateEmail,
  isEmailEnabled,
  missingGmailConfig,
  credentialSource,
  verifyGmailAuth,
  resetGmailClient,
  availableTemplates,
  htmlToText,
};
