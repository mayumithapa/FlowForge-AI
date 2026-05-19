import { Injectable } from '@nestjs/common';
import { JobStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WorkspaceService } from '../workspace/workspace.service';

@Injectable()
export class QueueService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaces: WorkspaceService,
  ) {}

  /** Aggregated counts per queue + status for the worker dashboard. */
  async stats(userId: string, workspaceId: string) {
    await this.workspaces.assertMember(userId, workspaceId);
    const rows = await this.prisma.jobLog.groupBy({
      by: ['queue', 'status'],
      where: { workspaceId },
      _count: true,
    });
    const map: Record<string, Record<JobStatus, number>> = {};
    for (const r of rows) {
      const q = r.queue;
      map[q] ??= { QUEUED: 0, IN_PROGRESS: 0, SUCCESS: 0, FAILED: 0, RETRYING: 0, DEAD: 0 };
      map[q][r.status] = r._count;
    }
    return map;
  }

  /** Recent failures across all queues — useful when debugging DLQ. */
  async recentFailures(userId: string, workspaceId: string, take = 50) {
    await this.workspaces.assertMember(userId, workspaceId);
    return this.prisma.jobLog.findMany({
      where: { workspaceId, status: { in: [JobStatus.FAILED, JobStatus.DEAD] } },
      orderBy: { updatedAt: 'desc' },
      take,
    });
  }
}
