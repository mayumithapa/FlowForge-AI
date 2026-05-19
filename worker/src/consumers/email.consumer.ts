import { Injectable, Logger } from '@nestjs/common';
import { EmailStatus, JobStatus } from '@prisma/client';

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

  constructor(
    private readonly mq: RabbitMQService,
    private readonly prisma: PrismaService,
    private readonly analytics: AnalyticsService,
  ) {}

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
   * Real delivery would go to SES / SendGrid / Postmark. For local dev we
   * simulate a provider, log to stdout, and return a fake provider id.
   */
  private async deliver(to: string, subject: string, html: string, text: string | null): Promise<string> {
    this.logger.log(`[email] -> ${to}  "${subject}"`);
    if (process.env.NODE_ENV !== 'production') {
      this.logger.debug(`[email] body: ${(text || html).slice(0, 200)}`);
    }
    await new Promise((r) => setTimeout(r, 50));
    return `mock-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  }
}
