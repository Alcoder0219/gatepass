import nodemailer from 'nodemailer';
import env from '../config/env.js';
import logger from '../utils/logger.js';
import { emailLayout, templates } from '../helpers/emailTemplates.js';

let transporter = null;

/**
 * When SMTP is not configured (the default in dev) we fall back to a "console
 * transport" that logs the mail instead of sending it — so the whole app runs
 * with zero external dependencies.
 */
const getTransporter = () => {
  if (transporter) return transporter;

  if (!env.mail.host) {
    transporter = {
      sendMail: async (options) => {
        logger.info(`[mail:console] → ${options.to} | ${options.subject}`);
        return { messageId: 'console', accepted: [options.to] };
      },
      verify: async () => true,
    };
    logger.warn('SMTP is not configured — emails will be logged to the console');
    return transporter;
  }

  transporter = nodemailer.createTransport({
    host: env.mail.host,
    port: env.mail.port,
    secure: env.mail.secure,
    auth: env.mail.user ? { user: env.mail.user, pass: env.mail.pass } : undefined,
  });

  transporter
    .verify()
    .then(() => logger.info(`SMTP ready → ${env.mail.host}`))
    .catch((error) => logger.error(`SMTP verification failed: ${error.message}`));

  return transporter;
};

export const sendMail = async ({ to, subject, html, text }) => {
  if (!to) return null;
  try {
    return await getTransporter().sendMail({
      from: env.mail.from,
      to,
      subject,
      html,
      text: text ?? subject,
    });
  } catch (error) {
    logger.error(`Failed to send mail to ${to}: ${error.message}`);
    return null;
  }
};

/** Renders one of the named templates in `helpers/emailTemplates.js` and sends it. */
export const sendTemplate = async (template, { to, ...data }) => {
  const builder = templates[template];
  if (!builder) {
    logger.error(`Unknown email template: ${template}`);
    return null;
  }
  const { subject, body } = builder(data);
  return sendMail({ to, subject, html: emailLayout({ title: subject, body }) });
};

export default { sendMail, sendTemplate };
