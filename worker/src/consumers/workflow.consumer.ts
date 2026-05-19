import { Injectable, Logger } from '@nestjs/common';

import { RabbitMQService } from '../../../backend/src/rabbitmq/rabbitmq.service';
import { QUEUES } from '../../../backend/src/rabbitmq/rabbitmq.constants';
import { WorkflowEngineService } from '../../../backend/src/workflow/workflow-engine.service';
import { PrismaService } from '../../../backend/src/prisma/prisma.service';
import { JobStatus } from '@prisma/client';

interface ExecuteJob {
  executionId?: string;
  workflowId?: string;
  workspaceId?: string;
  triggeredBy?: string;
  input?: Record<string, unknown>;
}

@Injectable()
export class WorkflowConsumer {
  private readonly logger = new Logger(WorkflowConsumer.name);

  constructor(
    private readonly mq: RabbitMQService,
    private readonly engine: WorkflowEngineService,
    private readonly prisma: PrismaService,
  ) {}

  async start() {
    await this.mq.consume(QUEUES.WORKFLOW_EXECUTE, async (raw, meta) => {
      const payload = raw as ExecuteJob;
      this.logger.log(`workflow.execute received (attempt ${meta.attempt}): ${JSON.stringify(payload).slice(0, 200)}`);

      // Idempotency: if we've seen this exact messageId and it finished, skip.
      const existing = await this.prisma.jobLog.findUnique({ where: { idempotencyKey: meta.messageId } });
      if (existing && existing.status === JobStatus.SUCCESS) {
        this.logger.log(`workflow.execute ${meta.messageId} already processed; skipping`);
        return;
      }

      const log = existing ?? await this.prisma.jobLog.create({
        data: {
          workspaceId: payload.workspaceId ?? null,
          queue: QUEUES.WORKFLOW_EXECUTE,
          jobName: 'execute',
          idempotencyKey: meta.messageId,
          status: JobStatus.IN_PROGRESS,
          attempts: meta.attempt + 1,
          payload: payload as any,
          startedAt: new Date(),
        },
      });

      try {
        let executionId = payload.executionId;
        if (!executionId) {
          if (!payload.workflowId || !payload.workspaceId) {
            throw new Error('workflow.execute: executionId or (workspaceId + workflowId) required');
          }
          const wf = await this.prisma.workflow.findFirst({
            where: { id: payload.workflowId, workspaceId: payload.workspaceId, deletedAt: null },
            select: { publishedVersionId: true },
          });
          if (!wf?.publishedVersionId) throw new Error('workflow not published');
          const exec = await this.prisma.workflowExecution.create({
            data: {
              workspaceId: payload.workspaceId,
              workflowId: payload.workflowId,
              versionId: wf.publishedVersionId,
              triggeredBy: payload.triggeredBy ?? 'queue',
              input: (payload.input ?? {}) as any,
            },
          });
          executionId = exec.id;
        }

        await this.engine.execute(executionId);

        await this.prisma.jobLog.update({
          where: { id: log.id },
          data: { status: JobStatus.SUCCESS, finishedAt: new Date(), attempts: meta.attempt + 1 },
        });
      } catch (err) {
        await this.prisma.jobLog.update({
          where: { id: log.id },
          data: {
            status: JobStatus.RETRYING,
            attempts: meta.attempt + 1,
            error: (err as Error).message,
          },
        });
        throw err; // let the MQ retry layer handle backoff + DLQ
      }
    });
  }
}
