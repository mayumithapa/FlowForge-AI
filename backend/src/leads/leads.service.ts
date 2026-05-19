import { Injectable, Logger } from '@nestjs/common';
import { LeadStatus, Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { WorkspaceService } from '../workspace/workspace.service';
import { RabbitMQService } from '../rabbitmq/rabbitmq.service';
import { ROUTING_KEYS } from '../rabbitmq/rabbitmq.constants';
import { CreateLeadDto, ImportLeadsDto, UpdateLeadDto } from './dto/lead.dto';

@Injectable()
export class LeadsService {
  private readonly logger = new Logger(LeadsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaces: WorkspaceService,
    private readonly mq: RabbitMQService,
  ) {}

  async list(userId: string, workspaceId: string, params: { status?: LeadStatus; q?: string; take?: number; skip?: number }) {
    await this.workspaces.assertMember(userId, workspaceId);
    const where: Prisma.LeadWhereInput = {
      workspaceId,
      deletedAt: null,
      ...(params.status ? { status: params.status } : {}),
      ...(params.q
        ? { OR: [{ email: { contains: params.q, mode: 'insensitive' } }, { fullName: { contains: params.q, mode: 'insensitive' } }] }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.lead.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: params.take ?? 50,
        skip: params.skip ?? 0,
      }),
      this.prisma.lead.count({ where }),
    ]);
    return { items, total };
  }

  async create(userId: string, dto: CreateLeadDto) {
    await this.workspaces.assertMember(userId, dto.workspaceId);
    return this.prisma.lead.upsert({
      where: { workspaceId_email: { workspaceId: dto.workspaceId, email: dto.email.toLowerCase() } },
      create: {
        workspaceId: dto.workspaceId,
        email: dto.email.toLowerCase(),
        fullName: dto.fullName ?? null,
        company: dto.company ?? null,
        source: dto.source ?? null,
        metadata: (dto.metadata ?? {}) as Prisma.InputJsonValue,
      },
      update: {
        fullName: dto.fullName ?? undefined,
        company: dto.company ?? undefined,
        source: dto.source ?? undefined,
        deletedAt: null,
      },
    });
  }

  async update(userId: string, workspaceId: string, leadId: string, dto: UpdateLeadDto) {
    await this.workspaces.assertMember(userId, workspaceId);
    return this.prisma.lead.update({
      where: { id: leadId },
      data: {
        fullName: dto.fullName,
        company: dto.company,
        status: dto.status,
        metadata: dto.metadata as Prisma.InputJsonValue | undefined,
      },
    });
  }

  async softDelete(userId: string, workspaceId: string, leadId: string) {
    await this.workspaces.assertMember(userId, workspaceId);
    await this.prisma.lead.update({ where: { id: leadId }, data: { deletedAt: new Date() } });
    return { ok: true };
  }

  /**
   * Bulk import. Each row is upserted, then for each lead we optionally enqueue
   * a workflow execution job that will run AI classification + email generation.
   */
  async import(userId: string, dto: ImportLeadsDto) {
    await this.workspaces.assertMember(userId, dto.workspaceId);
    const created: string[] = [];
    for (const row of dto.leads) {
      const lead = await this.create(userId, { ...row, workspaceId: dto.workspaceId });
      created.push(lead.id);
      if (dto.triggerWorkflowId) {
        await this.mq.publish(ROUTING_KEYS.WORKFLOW_EXECUTE, {
          workspaceId: dto.workspaceId,
          workflowId: dto.triggerWorkflowId,
          triggeredBy: `lead-import:${userId}`,
          input: { leadId: lead.id, email: lead.email, fullName: lead.fullName, company: lead.company },
        });
      }
    }
    this.logger.log(`Imported ${created.length} leads into workspace ${dto.workspaceId}`);
    return { imported: created.length, leadIds: created };
  }
}
