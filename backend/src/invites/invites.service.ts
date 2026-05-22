import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { randomBytes } from 'crypto';

import { PrismaService } from '../prisma/prisma.service';
import { WorkspaceService } from '../workspace/workspace.service';
import { RabbitMQService } from '../rabbitmq/rabbitmq.service';
import { ROUTING_KEYS } from '../rabbitmq/rabbitmq.constants';
import { CreateInviteDto } from './dto/invite.dto';

@Injectable()
export class InvitesService {
  private readonly logger = new Logger(InvitesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaces: WorkspaceService,
    private readonly mq: RabbitMQService,
  ) {}

  // ── Members ─────────────────────────────────────────────────────────────────

  async listMembers(userId: string, workspaceId: string) {
    await this.workspaces.assertMember(userId, workspaceId);
    return this.prisma.workspaceMember.findMany({
      where: { workspaceId },
      include: { user: { select: { id: true, email: true, fullName: true, avatarUrl: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  async updateMemberRole(userId: string, workspaceId: string, targetUserId: string, role: UserRole) {
    await this.assertOwner(userId, workspaceId);
    if (userId === targetUserId) throw new BadRequestException('Cannot change your own role.');
    return this.prisma.workspaceMember.update({
      where: { workspaceId_userId: { workspaceId, userId: targetUserId } },
      data: { role },
    });
  }

  async removeMember(userId: string, workspaceId: string, targetUserId: string) {
    await this.assertOwner(userId, workspaceId);
    if (userId === targetUserId) throw new BadRequestException('Cannot remove yourself.');
    await this.prisma.workspaceMember.delete({
      where: { workspaceId_userId: { workspaceId, userId: targetUserId } },
    });
    return { ok: true };
  }

  // ── Invites ──────────────────────────────────────────────────────────────────

  async listInvites(userId: string, workspaceId: string) {
    await this.workspaces.assertMember(userId, workspaceId);
    return this.prisma.workspaceInvite.findMany({
      where: { workspaceId, acceptedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createInvite(userId: string, workspaceId: string, dto: CreateInviteDto) {
    await this.assertOwner(userId, workspaceId);

    // Check user isn't already a member
    const existingUser = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existingUser) {
      const isMember = await this.prisma.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId, userId: existingUser.id } },
      });
      if (isMember) throw new BadRequestException('This user is already a member.');
    }

    // Check no pending invite for this email
    const existing = await this.prisma.workspaceInvite.findFirst({
      where: { workspaceId, email: dto.email, acceptedAt: null, expiresAt: { gt: new Date() } },
    });
    if (existing) throw new BadRequestException('A pending invite already exists for this email.');

    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const invite = await this.prisma.workspaceInvite.create({
      data: { workspaceId, email: dto.email, role: dto.role ?? UserRole.MEMBER, token, expiresAt },
    });

    // Fetch workspace name for the email
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { name: true },
    });

    // Send invite email via existing email pipeline
    const appUrl = process.env.APP_URL || 'https://flowforge-ai-psi.vercel.app';
    const inviteUrl = `${appUrl}/invite/${token}`;
    const bodyHtml = `
      <p>You've been invited to join <strong>${workspace?.name ?? 'a workspace'}</strong> on FlowForge AI.</p>
      <p>Your role will be: <strong>${invite.role}</strong></p>
      <p><a href="${inviteUrl}" style="background:#6366f1;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block;margin-top:8px">Accept Invitation</a></p>
      <p style="color:#888;font-size:12px;margin-top:16px">This invite expires in 7 days. If you didn't expect this, you can ignore it.</p>
    `;

    const message = await this.prisma.emailMessage.create({
      data: {
        workspaceId,
        toEmail: dto.email,
        subject: `You're invited to join ${workspace?.name ?? 'FlowForge AI'}`,
        bodyHtml,
        bodyText: `You've been invited to join ${workspace?.name}. Accept here: ${inviteUrl}`,
      },
    });
    await this.mq.publish(ROUTING_KEYS.EMAIL_SEND, { messageId: message.id, workspaceId });

    this.logger.log(`Invite sent to ${dto.email} for workspace ${workspaceId}`);
    return invite;
  }

  async cancelInvite(userId: string, workspaceId: string, inviteId: string) {
    await this.assertOwner(userId, workspaceId);
    await this.prisma.workspaceInvite.delete({ where: { id: inviteId } });
    return { ok: true };
  }

  // ── Public: accept ───────────────────────────────────────────────────────────

  async getInviteByToken(token: string) {
    const invite = await this.prisma.workspaceInvite.findUnique({
      where: { token },
      include: { workspace: { select: { name: true, slug: true } } },
    });
    if (!invite) throw new NotFoundException('Invite not found or already used.');
    if (invite.acceptedAt) throw new BadRequestException('This invite has already been accepted.');
    if (invite.expiresAt < new Date()) throw new BadRequestException('This invite has expired.');
    return invite;
  }

  async acceptInvite(token: string, userId: string) {
    const invite = await this.getInviteByToken(token);

    // Verify the accepting user's email matches the invite email
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found.');
    if (user.email !== invite.email) {
      throw new ForbiddenException(
        `This invite was sent to ${invite.email}. Please log in with that account.`,
      );
    }

    // Add to workspace (upsert to be safe)
    await this.prisma.workspaceMember.upsert({
      where: { workspaceId_userId: { workspaceId: invite.workspaceId, userId } },
      create: { workspaceId: invite.workspaceId, userId, role: invite.role },
      update: { role: invite.role },
    });

    // Mark invite as accepted
    await this.prisma.workspaceInvite.update({
      where: { id: invite.id },
      data: { acceptedAt: new Date() },
    });

    this.logger.log(`User ${userId} accepted invite to workspace ${invite.workspaceId}`);
    return { ok: true, workspaceId: invite.workspaceId, workspaceName: invite.workspace.name };
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  private async assertOwner(userId: string, workspaceId: string) {
    const ws = await this.prisma.workspace.findUnique({ where: { id: workspaceId } });
    if (!ws) throw new NotFoundException('Workspace not found.');
    if (ws.ownerId !== userId) {
      // Allow ADMINs too
      const member = await this.prisma.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId, userId } },
      });
      if (!member || !['OWNER', 'ADMIN'].includes(member.role)) {
        throw new ForbiddenException('Only workspace owners and admins can manage invites.');
      }
    }
  }
}
