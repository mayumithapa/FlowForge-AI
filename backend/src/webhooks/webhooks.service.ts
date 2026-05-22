import { Injectable, Logger, NotFoundException, UnauthorizedException, BadRequestException, ConflictException } from '@nestjs/common';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

import { PrismaService } from '../prisma/prisma.service';
import { RabbitMQService } from '../rabbitmq/rabbitmq.service';
import { ROUTING_KEYS } from '../rabbitmq/rabbitmq.constants';
import { RedisService } from '../redis/redis.service';

export interface WebhookField {
  key: string;
  label: string;
  type: 'text' | 'email' | 'tel' | 'textarea' | 'select';
  required?: boolean;
  options?: string[];
  placeholder?: string;
}

const DEFAULT_FIELDS: WebhookField[] = [
  { key: 'fullName', label: 'Your name', type: 'text', placeholder: 'Jane Doe', required: false },
  { key: 'email', label: 'Email', type: 'email', placeholder: 'you@company.com', required: true },
  { key: 'company', label: 'Company', type: 'text', placeholder: 'Acme Inc', required: false },
  { key: 'message', label: 'Message', type: 'textarea', placeholder: 'Tell us about your project…', required: false },
];

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mq: RabbitMQService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Mint a fresh token + secret for a workflow. Idempotent: callers should
   * only invoke this when the workflow does not already have a token.
   */
  generateCredentials() {
    return {
      // `wh_` prefix makes tokens easy to identify when they leak into logs
      // or screenshots (à la Stripe's `pk_live_` / `sk_live_`).
      webhookToken: `wh_${randomBytes(18).toString('hex')}`,
      webhookSecret: `whsec_${randomBytes(32).toString('hex')}`,
      webhookFields: DEFAULT_FIELDS as unknown as object,
    };
  }

  /**
   * Public read: schema + display name for the embeddable form. Safe to call
   * from any origin without auth — we expose only what's needed to render
   * the form. The secret is never returned here.
   */
  async getPublicSchema(token: string) {
    const workflow = await this.prisma.workflow.findUnique({
      where: { webhookToken: token },
      select: {
        id: true,
        name: true,
        description: true,
        status: true,
        publishedVersionId: true,
        webhookFields: true,
        workspace: { select: { name: true } },
      },
    });
    if (!workflow || !workflow.publishedVersionId) {
      throw new NotFoundException('This form is not active.');
    }
    return {
      workflowName: workflow.name,
      workspaceName: workflow.workspace.name,
      fields: (workflow.webhookFields as unknown as WebhookField[]) ?? DEFAULT_FIELDS,
    };
  }

  /**
   * Receive a webhook submission. Two layers of defense:
   *   1) Optional HMAC verification (Stripe-style) if the workflow has a
   *      secret AND the caller sent X-FlowForge-Signature.
   *   2) Per-token rate limit via Redis token bucket.
   * Returns immediately after queuing — workflow runs async in the worker.
   */
  async receive(token: string, payload: Record<string, unknown>, rawBody: string, signature: string | undefined) {
    const workflow = await this.prisma.workflow.findUnique({
      where: { webhookToken: token },
    });
    if (!workflow || !workflow.publishedVersionId) {
      throw new NotFoundException('Webhook not found or workflow not published.');
    }

    // Rate limit: 60 requests / minute / token. Keeps a misconfigured form
    // or a malicious caller from drowning the queue.
    const allowed = await this.redis.rateLimit(`webhook:${token}`, 60, 60);
    if (!allowed) {
      throw new BadRequestException('Rate limit exceeded (60/min).');
    }

    // HMAC verification — only enforced when the caller chose to sign.
    // Public unsigned submissions (from a Tally form, etc.) still go through.
    if (signature && workflow.webhookSecret) {
      if (!this.verifySignature(rawBody, workflow.webhookSecret, signature)) {
        throw new UnauthorizedException('Invalid signature.');
      }
    }

    const email = String(payload.email ?? '').trim().toLowerCase();
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      throw new BadRequestException('A valid `email` field is required.');
    }

    // Upsert: if the email already exists in this workspace, update their
    // metadata and re-trigger the workflow (e.g. they filled the form twice).
    // This gives a friendly experience instead of a cryptic 500 error.
    let lead;
    try {
      lead = await this.prisma.lead.create({
        data: {
          workspaceId: workflow.workspaceId,
          email,
          fullName: stringOrNull(payload.fullName ?? payload.name),
          company: stringOrNull(payload.company),
          source: 'webhook',
          metadata: payload as any,
        },
      });
    } catch (err: any) {
      // Prisma unique constraint violation (P2002) → email already exists
      if (err?.code === 'P2002') {
        lead = await this.prisma.lead.update({
          where: { workspaceId_email: { workspaceId: workflow.workspaceId, email } },
          data: {
            fullName: stringOrNull(payload.fullName ?? payload.name) ?? undefined,
            company: stringOrNull(payload.company) ?? undefined,
            metadata: payload as any,
          },
        });
        this.logger.log(`webhook ${token.slice(0, 12)}… → existing lead ${lead.id} updated`);
      } else {
        throw err;
      }
    }

    const execution = await this.prisma.workflowExecution.create({
      data: {
        workspaceId: workflow.workspaceId,
        workflowId: workflow.id,
        versionId: workflow.publishedVersionId,
        triggeredBy: 'webhook',
        input: { ...payload, leadId: lead.id, email, source: 'webhook' } as any,
      },
    });
    await this.mq.publish(ROUTING_KEYS.WORKFLOW_EXECUTE, { executionId: execution.id });

    this.logger.log(`webhook ${token.slice(0, 12)}… → lead ${lead.id} → execution ${execution.id}`);
    return { ok: true, leadId: lead.id, executionId: execution.id };
  }

  private verifySignature(rawBody: string, secret: string, headerSig: string): boolean {
    const provided = headerSig.replace(/^sha256=/, '');
    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
    try {
      return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(provided, 'hex'));
    } catch {
      return false;
    }
  }
}

function stringOrNull(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s.length === 0 ? null : s;
}
