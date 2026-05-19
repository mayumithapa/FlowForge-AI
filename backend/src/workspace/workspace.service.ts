import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WorkspaceService {
  constructor(private readonly prisma: PrismaService) {}

  async assertMember(userId: string, workspaceId: string) {
    const membership = await this.prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
    });
    if (!membership) throw new ForbiddenException('Not a member of this workspace');
    return membership;
  }

  list(userId: string) {
    return this.prisma.workspace.findMany({
      where: { deletedAt: null, members: { some: { userId } } },
      include: { _count: { select: { workflows: true, leads: true, campaigns: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  get(userId: string, workspaceId: string) {
    return this.prisma.workspace.findFirst({
      where: { id: workspaceId, deletedAt: null, members: { some: { userId } } },
      include: { members: { include: { user: true } } },
    });
  }
}
