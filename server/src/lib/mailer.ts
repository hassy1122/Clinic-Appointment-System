import { env, isTest } from '../config/env';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

interface Transport {
  send(msg: MailMessage): Promise<void>;
}

/** Dev transport: logs to console (used in tests and as a fallback). */
const consoleTransport: Transport = {
  async send(msg) {
    if (!isTest) {
      console.log(`[mail:console] to=${msg.to} subject="${msg.subject}"`);
    }
  },
};

/** Local dev transport: MailHog SMTP (docker-compose.yml, ports 1025/8025). */
const smtpTransport: Transport = {
  async send(msg) {
    const { createTransport } = await import('nodemailer');
    const transport = createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: false,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    });
    await transport.sendMail({
      from: env.MAIL_FROM,
      to: msg.to,
      subject: msg.subject,
      text: msg.text,
      html: msg.html,
    });
  },
};

/** Production transport: Resend HTTP API (no SDK needed). */
const resendTransport: Transport = {
  async send(msg) {
    if (!env.RESEND_API_KEY) throw new Error('RESEND_API_KEY is not set');
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.MAIL_FROM,
        to: [msg.to],
        subject: msg.subject,
        text: msg.text,
        html: msg.html,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Resend API error ${res.status}: ${body}`);
    }
  },
};

function transportFor(): Transport {
  if (isTest) return consoleTransport;
  switch (env.MAIL_TRANSPORT) {
    case 'provider':
      return resendTransport;
    case 'console':
      return consoleTransport;
    case 'smtp':
    default:
      return smtpTransport;
  }
}

export async function sendMail(msg: MailMessage): Promise<void> {
  await transportFor().send(msg);
}
