import { Injectable, Logger } from '@nestjs/common';
import {
  ExecutionStatus,
  NodeType,
  Prisma,
  WorkflowExecution,
  WorkflowEdge,
  WorkflowNode,
} from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { RabbitMQService } from '../rabbitmq/rabbitmq.service';
import { ROUTING_KEYS } from '../rabbitmq/rabbitmq.constants';
import { AiService } from '../ai/ai.service';
import { AnalyticsService } from '../analytics/analytics.service';

/**
 * WorkflowEngineService
 * =====================
 *
 * The engine runs in the worker process. It's invoked when a
 * `workflow.execute.start` message arrives, identified by `{ executionId }`.
 *
 * Strategy:
 *  - Load the version graph (nodes + edges) once.
 *  - Walk the DAG in topological layers (Kahn's algorithm).
 *  - For each node, materialize an ExecutionStep, run the node, persist the
 *    output, and feed it into downstream nodes via a `context` map keyed by
 *    node id.
 *  - On a step failure we mark the execution FAILED but keep step records for
 *    replay/audit; the RabbitMQ retry logic in `RabbitMQService.consume` is
 *    in charge of redelivery + DLQ for transient errors.
 *  - Idempotency: re-running an already-finished execution is a no-op.
 *
 * Sync vs async: AI/email nodes _could_ be pushed back onto the queue as
 * independent jobs, but to keep ordering simple and the demo readable we run
 * the graph inline using injectable per-node services. A future optimization
 * is to fan-out by emitting `workflow.step.run` per layer (already supported
 * by the queue topology in `rabbitmq.constants.ts`).
 */
@Injectable()
export class WorkflowEngineService {
  private readonly logger = new Logger(WorkflowEngineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mq: RabbitMQService,
    private readonly ai: AiService,
    private readonly analytics: AnalyticsService,
  ) {}

  async execute(executionId: string): Promise<void> {
    const execution = await this.prisma.workflowExecution.findUnique({
      where: { id: executionId },
    });
    if (!execution) {
      this.logger.warn(`Execution ${executionId} not found`);
      return;
    }
    if (execution.status === ExecutionStatus.SUCCESS || execution.status === ExecutionStatus.FAILED) {
      this.logger.warn(`Execution ${executionId} already finalized (${execution.status})`);
      return;
    }

    const versionId = execution.versionId;
    if (!versionId) {
      await this.failExecution(execution, new Error('Execution has no version id'));
      return;
    }
    const [nodes, edges] = await Promise.all([
      this.prisma.workflowNode.findMany({ where: { versionId } }),
      this.prisma.workflowEdge.findMany({ where: { versionId } }),
    ]);

    const startedAt = new Date();
    await this.prisma.workflowExecution.update({
      where: { id: executionId },
      data: { status: ExecutionStatus.RUNNING, startedAt },
    });

    try {
      const order = this.topoOrder(nodes, edges);
      const context: Record<string, unknown> = {
        input: execution.input ?? {},
      };

      for (const node of order) {
        const stepInput = this.collectInputs(node, edges, context, execution.input);
        const step = await this.prisma.executionStep.create({
          data: {
            executionId,
            nodeKey: node.nodeKey,
            nodeType: node.type,
            status: ExecutionStatus.RUNNING,
            attempt: 1,
            input: stepInput as Prisma.InputJsonValue,
            startedAt: new Date(),
          },
        });

        try {
          const t0 = Date.now();
          const output = await this.runNode(node, stepInput, execution);
          const durationMs = Date.now() - t0;
          await this.prisma.executionStep.update({
            where: { id: step.id },
            data: {
              status: ExecutionStatus.SUCCESS,
              output: output as Prisma.InputJsonValue,
              finishedAt: new Date(),
              durationMs,
            },
          });
          context[node.nodeKey] = output;
        } catch (err) {
          const msg = (err as Error).message;
          await this.prisma.executionStep.update({
            where: { id: step.id },
            data: {
              status: ExecutionStatus.FAILED,
              error: msg,
              finishedAt: new Date(),
              durationMs: Date.now() - (step.startedAt?.getTime() ?? Date.now()),
            },
          });
          throw err;
        }
      }

      const finishedAt = new Date();
      await this.prisma.workflowExecution.update({
        where: { id: executionId },
        data: {
          status: ExecutionStatus.SUCCESS,
          output: context as Prisma.InputJsonValue,
          finishedAt,
          durationMs: finishedAt.getTime() - startedAt.getTime(),
        },
      });
      await this.analytics.record(execution.workspaceId, 'workflow.execution.success', {
        executionId,
        workflowId: execution.workflowId,
      });
      this.logger.log(`Execution ${executionId} finished SUCCESS`);
    } catch (err) {
      await this.failExecution(execution, err as Error);
    }
  }

  private async failExecution(execution: WorkflowExecution, err: Error) {
    const finishedAt = new Date();
    await this.prisma.workflowExecution.update({
      where: { id: execution.id },
      data: {
        status: ExecutionStatus.FAILED,
        error: err.message,
        finishedAt,
        durationMs: execution.startedAt ? finishedAt.getTime() - execution.startedAt.getTime() : null,
      },
    });
    await this.analytics.record(execution.workspaceId, 'workflow.execution.failed', {
      executionId: execution.id,
      workflowId: execution.workflowId,
      error: err.message,
    });
    this.logger.error(`Execution ${execution.id} FAILED: ${err.message}`);
  }

  // --------------------------------------------------------------------------
  // Node implementations
  // --------------------------------------------------------------------------
  private async runNode(
    node: WorkflowNode,
    input: Record<string, unknown>,
    execution: WorkflowExecution,
  ): Promise<Record<string, unknown>> {
    const cfg = (node.config ?? {}) as Record<string, unknown>;

    switch (node.type) {
      case NodeType.TRIGGER_MANUAL:
      case NodeType.TRIGGER_WEBHOOK:
      case NodeType.TRIGGER_SCHEDULE:
        return { ...(execution.input as object ?? {}), ...input };

      case NodeType.AI_CLASSIFY: {
        const text = String(input.text ?? input.message ?? input.email ?? JSON.stringify(input));
        const categories = (cfg.categories as string[]) ?? ['hot', 'warm', 'cold'];
        return this.ai.classify(execution.workspaceId, text, categories) as unknown as Record<string, unknown>;
      }

      case NodeType.AI_SENTIMENT: {
        const text = String(input.text ?? input.message ?? JSON.stringify(input));
        return this.ai.sentiment(execution.workspaceId, text) as unknown as Record<string, unknown>;
      }

      case NodeType.AI_SUMMARIZE: {
        const text = String(input.text ?? input.message ?? JSON.stringify(input));
        return this.ai.summarize(execution.workspaceId, text, Number(cfg.maxWords ?? 60)) as unknown as Record<string, unknown>;
      }

      case NodeType.AI_GENERATE_EMAIL: {
        const tone = String(cfg.tone ?? 'professional');
        const goal = String(cfg.goal ?? 'introduce our product');
        const lead = (input as { lead?: Record<string, unknown>; leadId?: string; fullName?: string; company?: string; email?: string });
        return this.ai.generateEmail(execution.workspaceId, {
          tone,
          goal,
          recipientName: String(lead.fullName ?? ''),
          recipientCompany: String(lead.company ?? ''),
          context: input,
        }) as unknown as Record<string, unknown>;
      }

      case NodeType.EMAIL_SEND: {
        const toEmail = String(input.toEmail ?? input.email ?? cfg.toEmail ?? '');
        const subject = String(input.subject ?? cfg.subject ?? 'Hello');
        const bodyHtml = String(input.bodyHtml ?? input.body ?? cfg.bodyHtml ?? '');
        const leadId = (input.leadId as string | undefined) ?? undefined;
        const campaignId = (input.campaignId as string | undefined) ?? undefined;
        if (!toEmail) throw new Error('email_send: toEmail missing');

        const message = await this.prisma.emailMessage.create({
          data: {
            workspaceId: execution.workspaceId,
            toEmail,
            subject,
            bodyHtml,
            leadId: leadId ?? null,
            campaignId: campaignId ?? null,
          },
        });
        await this.mq.publish(ROUTING_KEYS.EMAIL_SEND, {
          messageId: message.id,
          workspaceId: execution.workspaceId,
        });
        return { emailMessageId: message.id, queued: true };
      }

      case NodeType.DB_UPDATE_LEAD: {
        const leadId = String(input.leadId ?? cfg.leadId ?? '');
        if (!leadId) throw new Error('db_update_lead: leadId missing');
        const patch: Prisma.LeadUpdateInput = {};
        const classification = input.classification ?? input.category;
        if (classification) patch.classification = String(classification);
        if (input.sentiment) patch.sentiment = String(input.sentiment);
        if (typeof input.score === 'number') patch.score = input.score;
        if (typeof cfg.status === 'string') patch.status = cfg.status as Prisma.LeadUpdateInput['status'];
        const lead = await this.prisma.lead.update({ where: { id: leadId }, data: patch });
        return { leadId: lead.id, updated: true };
      }

      case NodeType.ANALYTICS_RECORD: {
        const name = String(cfg.event ?? 'workflow.event');
        await this.analytics.record(execution.workspaceId, name, input);
        return { recorded: true };
      }

      case NodeType.CONDITION: {
        const path = String(cfg.field ?? '');
        const equals = cfg.equals;
        const value = this.getPath(input, path);
        const matched = value === equals;
        return { matched, branch: matched ? 'true' : 'false' };
      }

      case NodeType.DELAY: {
        const ms = Number(cfg.ms ?? 0);
        if (ms > 0) await new Promise((r) => setTimeout(r, Math.min(ms, 30_000)));
        return { delayedMs: ms };
      }

      default:
        throw new Error(`Unknown node type: ${node.type}`);
    }
  }

  // --------------------------------------------------------------------------
  private getAncestors(nodeKey: string, edges: WorkflowEdge[]): string[] {
    const ancestors = new Set<string>();
    const queue = [nodeKey];
    while (queue.length > 0) {
      const current = queue.shift()!;
      const upstream = edges.filter((e) => e.targetKey === current);
      for (const edge of upstream) {
        if (!ancestors.has(edge.sourceKey)) {
          ancestors.add(edge.sourceKey);
          queue.push(edge.sourceKey);
        }
      }
    }
    return Array.from(ancestors);
  }

  private collectInputs(
    node: WorkflowNode,
    edges: WorkflowEdge[],
    context: Record<string, unknown>,
    rootInput: Prisma.JsonValue | null,
  ): Record<string, unknown> {
    const ancestors = this.getAncestors(node.nodeKey, edges);
    const merged: Record<string, unknown> = { ...((rootInput as object) ?? {}) };
    for (const key of Object.keys(context)) {
      if (ancestors.includes(key) || key === 'input') {
        const src = context[key];
        if (src && typeof src === 'object') {
          Object.assign(merged, src as object);
        } else if (src !== undefined) {
          merged[key] = src;
        }
      }
    }
    return merged;
  }

  private topoOrder(nodes: WorkflowNode[], edges: WorkflowEdge[]): WorkflowNode[] {
    const byKey = new Map(nodes.map((n) => [n.nodeKey, n]));
    const indegree = new Map<string, number>();
    const adj = new Map<string, string[]>();
    for (const n of nodes) {
      indegree.set(n.nodeKey, 0);
      adj.set(n.nodeKey, []);
    }
    for (const e of edges) {
      adj.get(e.sourceKey)!.push(e.targetKey);
      indegree.set(e.targetKey, (indegree.get(e.targetKey) ?? 0) + 1);
    }
    const result: WorkflowNode[] = [];
    const queue = [...indegree.entries()].filter(([, d]) => d === 0).map(([k]) => k);
    while (queue.length) {
      const k = queue.shift()!;
      result.push(byKey.get(k)!);
      for (const c of adj.get(k) ?? []) {
        const d = (indegree.get(c) ?? 0) - 1;
        indegree.set(c, d);
        if (d === 0) queue.push(c);
      }
    }
    if (result.length !== nodes.length) {
      throw new Error('Graph contains a cycle; cannot execute');
    }
    return result;
  }

  private getPath(obj: unknown, path: string): unknown {
    if (!path) return obj;
    return path.split('.').reduce<unknown>((acc, key) => {
      if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[key];
      return undefined;
    }, obj);
  }
}
