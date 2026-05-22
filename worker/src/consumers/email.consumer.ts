import { Injectable, Logger } from '@nestjs/common';
import { EmailStatus, JobStatus } from '@prisma/client';
import { Resend } from 'resend';

import { RabbitMQService } from '../../../backend/src/rabbitmq/rabbitmq.service';
import { QUEUES } from '../../../backend/src/rabbitmq/rabbitmq.constants';
import { PrismaService } from '../../../backend/src/prisma/prisma.service';
import { AnalyticsService } from '../../../backend/src/analytics/analytics.service';

interface EmailJob {
  messageId: string;
  workspaceId: string;
}

/**
 * Supported delivery providers.
 *
 * `EMAIL_PROVIDER` env var selects which one is active.
 *   - "resend"  → uses RESEND_API_KEY  (recommended once you own a domain)
 *   - "brevo"   → uses BREVO_API_KEY   (free, no domain required to send to anyone)
 *   - "mock"    → no-op, logs only     (default when no key is configured)
 *
 * The interface keeps `EmailConsumer.deliver` agnostic so swapping providers
 * is one env var change, no code redeploy.
 */
type Provider = 'resend' | 'brevo' | 'mock';

@Injectable()
export class EmailConsumer {
  private readonly logger = new Logger(EmailConsumer.name);
  private readonly provider: Provider;
  private readonly resend: Resend | null = null;
  private readonly brevoApiKey: string | null = null;
  private readonly fromAddress: string;
  private readonly fromName: string;
  private readonly fromEmail: string;

  constructor(
    private readonly mq: RabbitMQService,
    private readonly prisma: PrismaService,
    private readonly analytics: AnalyticsService,
  ) {
    this.fromAddress = process.env.EMAIL_FROM ?? 'FlowForge AI <onboarding@resend.dev>';
    // Brevo's API wants name + email split; parse "Name <email@domain>" once.
    const parsed = parseFromAddress(this.fromAddress);
    this.fromName = parsed.name;
    this.fromEmail = parsed.email;

    this.provider = pickProvider();
    switch (this.provider) {
      case 'resend':
        this.resend = new Resend(process.env.RESEND_API_KEY!);
        this.logger.log(`Resend client ready — sending from "${this.fromAddress}"`);
        break;
      case 'brevo':
        this.brevoApiKey = process.env.BREVO_API_KEY!;
        this.logger.log(`Brevo client ready — sending from "${this.fromName} <${this.fromEmail}>"`);
        break;
      case 'mock':
      default:
        this.logger.warn('No email provider configured — emails will be mocked (logged only).');
        break;
    }
  }

  async start() {
    await this.mq.consume(QUEUES.EMAIL_SEND, async (raw, meta) => {
      const payload = raw as EmailJob;
      this.logger.log(`email.send for ${payload.messageId} (attempt ${meta.attempt})`);

      const msg = await this.prisma.emailMessage.findUnique({ where: { id: payload.messageId } });
      if (!msg) return;
      if (msg.status === EmailStatus.SENT) return;

      await this.prisma.emailMessage.update({
        where: { id: msg.id },
        data: { status: EmailStatus.SENDING },
      });

      try {
        const providerId = await this.deliver(msg.toEmail, msg.subject, msg.bodyHtml, msg.bodyText);
        await this.prisma.emailMessage.update({
          where: { id: msg.id },
          data: { status: EmailStatus.SENT, sentAt: new Date(), providerId },
        });
        await this.analytics.record(msg.workspaceId, 'email.sent', { messageId: msg.id, toEmail: msg.toEmail });
        await this.prisma.jobLog.create({
          data: {
            workspaceId: msg.workspaceId,
            queue: QUEUES.EMAIL_SEND,
            jobName: 'deliver',
            idempotencyKey: meta.messageId,
            status: JobStatus.SUCCESS,
            attempts: meta.attempt + 1,
            payload: payload as any,
            result: { providerId, provider: this.provider } as any,
            finishedAt: new Date(),
          },
        }).catch(() => undefined);
      } catch (err) {
        await this.prisma.emailMessage.update({
          where: { id: msg.id },
          data: { status: EmailStatus.FAILED, error: (err as Error).message },
        });
        throw err;
      }
    });
  }

  private async deliver(to: string, subject: string, html: string, text: string | null): Promise<string> {
    this.logger.log(`[email/${this.provider}] -> ${to}  "${subject}"`);
    const finalHtml = html || `<pre>${escapeHtml(text ?? '')}</pre>`;

    switch (this.provider) {
      case 'resend':
        return this.deliverViaResend(to, subject, finalHtml, text);
      case 'brevo':
        return this.deliverViaBrevo(to, subject, finalHtml, text);
      case 'mock':
      default:
        if (process.env.NODE_ENV !== 'production') {
          this.logger.debug(`[email] body: ${(text || html).slice(0, 200)}`);
        }
        await new Promise((r) => setTimeout(r, 50));
        return `mock-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    }
  }

  private async deliverViaResend(to: string, subject: string, html: string, text: string | null): Promise<string> {
    const { data, error } = await this.resend!.emails.send({
      from: this.fromAddress,
      to,
      subject,
      html,
      text: text ?? undefined,
    });
    if (error) throw new Error(`Resend error: ${error.name} — ${error.message}`);
    if (!data?.id) throw new Error('Resend returned no message id');
    return data.id;
  }

  private async deliverViaBrevo(to: string, subject: string, html: string, text: string | null): Promise<string> {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': this.brevoApiKey!,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        sender: { name: this.fromName, email: this.fromEmail },
        to: [{ email: to }],
        subject,
        htmlContent: html,
        textContent: text ?? undefined,
      }),
    });
    const body = (await res.json().catch(() => ({}))) as { messageId?: string; message?: string; code?: string };
    if (!res.ok) {
      // 401 from Brevo usually means unverified sender or wrong API key; surface clearly.
      throw new Error(`Brevo error: ${res.status} ${body.code ?? ''} ${body.message ?? res.statusText}`);
    }
    if (!body.messageId) throw new Error('Brevo returned no message id');
    return body.messageId;
  }
}

function pickProvider(): Provider {
  const explicit = (process.env.EMAIL_PROVIDER ?? '').toLowerCase().trim();
  if (explicit === 'resend' || explicit === 'brevo' || explicit === 'mock') return explicit;
  // Implicit detection if EMAIL_PROVIDER isn't set: prefer Resend if its key
  // is present, otherwise Brevo, otherwise mock.
  if (process.env.RESEND_API_KEY) return 'resend';
  if (process.env.BREVO_API_KEY) return 'brevo';
  return 'mock';
}

function parseFromAddress(input: string): { name: string; email: string } {
  // Accepts "Name <email@host>" or just "email@host".
  const match = input.match(/^\s*(.*?)\s*<\s*([^>]+)\s*>\s*$/);
  if (match) return { name: match[1] || 'FlowForge AI', email: match[2] };
  return { name: 'FlowForge AI', email: input.trim() };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
