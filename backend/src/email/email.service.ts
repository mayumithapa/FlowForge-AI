import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EmailStatus } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { RabbitMQService } from '../rabbitmq/rabbitmq.service';
import { ROUTING_KEYS } from '../rabbitmq/rabbitmq.constants';
import { WorkspaceService } from '../workspace/workspace.service';
import { CreateTemplateDto, SendEmailDto, UpdateTemplateDto } from './dto/email.dto';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaces: WorkspaceService,
    private readonly mq: RabbitMQService,
  ) {}

  // -------- Templates --------
  async listTemplates(userId: string, workspaceId: string) {
    await this.workspaces.assertMember(userId, workspaceId);
    return this.prisma.emailTemplate.findMany({
      where: { workspaceId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createTemplate(userId: string, workspaceId: string, dto: CreateTemplateDto) {
    await this.workspaces.assertMember(userId, workspaceId);
    return this.prisma.emailTemplate.create({
      data: {
        workspaceId,
        name: dto.name,
        subject: dto.subject,
        bodyMarkdown: dto.bodyMarkdown,
        variables: dto.variables ?? [],
      },
    });
  }

  async updateTemplate(userId: string, workspaceId: string, id: string, dto: UpdateTemplateDto) {
    await this.workspaces.assertMember(userId, workspaceId);
    return this.prisma.emailTemplate.update({ where: { id }, data: dto });
  }

  async deleteTemplate(userId: string, workspaceId: string, id: string) {
    await this.workspaces.assertMember(userId, workspaceId);
    await this.prisma.emailTemplate.update({ where: { id }, data: { deletedAt: new Date() } });
    return { ok: true };
  }

  // -------- Send (queued) --------
  /**
   * Queue an email message for delivery. We persist it as QUEUED, push a job to
   * RabbitMQ, and let the worker actually deliver via the provider.
   */
  async send(userId: string, workspaceId: string, dto: SendEmailDto) {
    await this.workspaces.assertMember(userId, workspaceId);
    const message = await this.prisma.emailMessage.create({
      data: {
        workspaceId,
        toEmail: dto.toEmail,
        subject: dto.subject,
        bodyHtml: dto.bodyHtml,
        bodyText: dto.bodyText ?? null,
        leadId: dto.leadId ?? null,
        campaignId: dto.campaignId ?? null,
        status: EmailStatus.QUEUED,
      },
    });
    await this.mq.publish(ROUTING_KEYS.EMAIL_SEND, { messageId: message.id, workspaceId });
    return message;
  }

  async listMessages(userId: string, workspaceId: string) {
    await this.workspaces.assertMember(userId, workspaceId);
    return this.prisma.emailMessage.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async getMessage(userId: string, workspaceId: string, id: string) {
    await this.workspaces.assertMember(userId, workspaceId);
    const msg = await this.prisma.emailMessage.findFirst({ where: { id, workspaceId } });
    if (!msg) throw new NotFoundException('Email not found');
    return msg;
  }
}
