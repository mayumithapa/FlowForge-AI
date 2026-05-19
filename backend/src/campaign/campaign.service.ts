import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { CampaignStatus } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { WorkspaceService } from '../workspace/workspace.service';
import { RabbitMQService } from '../rabbitmq/rabbitmq.service';
import { ROUTING_KEYS } from '../rabbitmq/rabbitmq.constants';
import { CreateCampaignDto, LaunchCampaignDto, UpdateCampaignDto } from './dto/campaign.dto';

@Injectable()
export class CampaignService {
  private readonly logger = new Logger(CampaignService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaces: WorkspaceService,
    private readonly mq: RabbitMQService,
  ) {}

  async list(userId: string, workspaceId: string) {
    await this.workspaces.assertMember(userId, workspaceId);
    return this.prisma.campaign.findMany({
      where: { workspaceId, deletedAt: null },
      include: { workflow: true, template: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(userId: string, workspaceId: string, dto: CreateCampaignDto) {
    await this.workspaces.assertMember(userId, workspaceId);
    return this.prisma.campaign.create({
      data: {
        workspaceId,
        name: dto.name,
        workflowId: dto.workflowId,
        templateId: dto.templateId,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
        status: dto.scheduledAt ? CampaignStatus.SCHEDULED : CampaignStatus.DRAFT,
      },
    });
  }

  async update(userId: string, workspaceId: string, id: string, dto: UpdateCampaignDto) {
    await this.workspaces.assertMember(userId, workspaceId);
    return this.prisma.campaign.update({
      where: { id },
      data: {
        name: dto.name,
        status: dto.status,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
        workflowId: dto.workflowId,
        templateId: dto.templateId,
      },
    });
  }

  async remove(userId: string, workspaceId: string, id: string) {
    await this.workspaces.assertMember(userId, workspaceId);
    await this.prisma.campaign.update({ where: { id }, data: { deletedAt: new Date() } });
    return { ok: true };
  }

  /**
   * Launch a campaign by fanning out one workflow execution per lead. Workers
   * pick up each execution from RabbitMQ, run AI nodes, generate email, send.
   */
  async launch(userId: string, workspaceId: string, id: string, dto: LaunchCampaignDto) {
    await this.workspaces.assertMember(userId, workspaceId);
    const campaign = await this.prisma.campaign.findFirst({
      where: { id, workspaceId, deletedAt: null },
    });
    if (!campaign) throw new NotFoundException('Campaign not found');
    if (!campaign.workflowId)
      throw new BadRequestException('Campaign has no workflow attached');

    const leads = await this.prisma.lead.findMany({
      where: { id: { in: dto.leadIds }, workspaceId, deletedAt: null },
    });

    await this.prisma.campaign.update({
      where: { id },
      data: {
        status: CampaignStatus.RUNNING,
        startedAt: new Date(),
        totalRecipients: { increment: leads.length },
      },
    });

    for (const lead of leads) {
      await this.mq.publish(ROUTING_KEYS.WORKFLOW_EXECUTE, {
        workspaceId,
        workflowId: campaign.workflowId,
        triggeredBy: `campaign:${id}`,
        input: {
          leadId: lead.id,
          email: lead.email,
          fullName: lead.fullName,
          company: lead.company,
          campaignId: id,
        },
      });
    }
    this.logger.log(`Campaign ${id} launched for ${leads.length} leads`);
    return { launched: leads.length };
  }
}
