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

@Injectable()
export class EmailConsumer {
  private readonly logger = new Logger(EmailConsumer.name);
  private readonly resend: Resend | null;
  private readonly fromAddress: string;

  constructor(
    private readonly mq: RabbitMQService,
    private readonly prisma: PrismaService,
    private readonly analytics: AnalyticsService,
  ) {
    const apiKey = process.env.RESEND_API_KEY;
    this.resend = apiKey ? new Resend(apiKey) : null;
    // Resend's sandbox-friendly default — works for the verified signup email
    // without needing your own domain. Override with EMAIL_FROM later.
    this.fromAddress = process.env.EMAIL_FROM ?? 'FlowForge AI <onboarding@resend.dev>';
    if (!this.resend) {
      this.logger.warn('RESEND_API_KEY not set — emails will be mocked (logged only).');
    } else {
      this.logger.log(`Resend client ready — sending from "${this.fromAddress}"`);
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
            result: { providerId } as any,
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

  /**
   * Delivers an email via Resend when RESEND_API_KEY is configured.
   * Falls back to a mock (stdout log) so local dev and unconfigured
   * deployments still exercise the rest of the pipeline.
   */
  private async deliver(to: string, subject: string, html: string, text: string | null): Promise<string> {
    this.logger.log(`[email] -> ${to}  "${subject}"`);

    if (!this.resend) {
      if (process.env.NODE_ENV !== 'production') {
        this.logger.debug(`[email] body: ${(text || html).slice(0, 200)}`);
      }
      await new Promise((r) => setTimeout(r, 50));
      return `mock-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    }

    const { data, error } = await this.resend.emails.send({
      from: this.fromAddress,
      to,
      subject,
      html: html || `<pre>${escapeHtml(text ?? '')}</pre>`,
      text: text ?? undefined,
    });

    if (error) {
      // Bubble up so RabbitMQ retries with exponential backoff.
      throw new Error(`Resend error: ${error.name} — ${error.message}`);
    }
    if (!data?.id) {
      throw new Error('Resend returned no message id');
    }
    return data.id;
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
