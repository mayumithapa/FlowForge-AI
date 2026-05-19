import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { WorkspaceService } from '../workspace/workspace.service';

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaces: WorkspaceService,
  ) {}

  async record(workspaceId: string, name: string, payload?: Record<string, unknown>) {
    return this.prisma.analyticsEvent.create({
      data: {
        workspaceId,
        name,
        payload: (payload ?? {}) as Prisma.InputJsonValue,
      },
    });
  }

  /** Dashboard summary for a workspace. Cheap roll-up powered by indexed counts. */
  async summary(userId: string, workspaceId: string) {
    await this.workspaces.assertMember(userId, workspaceId);
    const [
      totalLeads,
      newLeadsToday,
      activeWorkflows,
      executionsLast24h,
      successLast24h,
      failedLast24h,
      emailsSent,
      emailsOpened,
      campaignsRunning,
    ] = await this.prisma.$transaction([
      this.prisma.lead.count({ where: { workspaceId, deletedAt: null } }),
      this.prisma.lead.count({
        where: { workspaceId, deletedAt: null, createdAt: { gte: this.dayStart() } },
      }),
      this.prisma.workflow.count({ where: { workspaceId, status: 'ACTIVE', deletedAt: null } }),
      this.prisma.workflowExecution.count({
        where: { workspaceId, createdAt: { gte: this.hoursAgo(24) } },
      }),
      this.prisma.workflowExecution.count({
        where: { workspaceId, status: 'SUCCESS', createdAt: { gte: this.hoursAgo(24) } },
      }),
      this.prisma.workflowExecution.count({
        where: { workspaceId, status: 'FAILED', createdAt: { gte: this.hoursAgo(24) } },
      }),
      this.prisma.emailMessage.count({ where: { workspaceId, status: 'SENT' } }),
      this.prisma.emailMessage.count({ where: { workspaceId, status: 'OPENED' } }),
      this.prisma.campaign.count({ where: { workspaceId, status: 'RUNNING', deletedAt: null } }),
    ]);

    const successRate = executionsLast24h === 0 ? 0 : Math.round((successLast24h / executionsLast24h) * 100);
    const openRate = emailsSent === 0 ? 0 : Math.round((emailsOpened / emailsSent) * 100);

    return {
      totalLeads,
      newLeadsToday,
      activeWorkflows,
      executionsLast24h,
      successLast24h,
      failedLast24h,
      successRate,
      emailsSent,
      emailsOpened,
      openRate,
      campaignsRunning,
    };
  }

  async executionsTimeseries(userId: string, workspaceId: string, days = 14) {
    await this.workspaces.assertMember(userId, workspaceId);
    const since = this.daysAgo(days);
    const rows = await this.prisma.$queryRaw<{ day: Date; status: string; count: bigint }[]>(Prisma.sql`
      SELECT date_trunc('day', "createdAt") AS day, "status"::text AS status, COUNT(*)::bigint AS count
      FROM "WorkflowExecution"
      WHERE "workspaceId"::text = ${workspaceId} AND "createdAt" >= ${since}
      GROUP BY 1, 2
      ORDER BY 1 ASC
    `);
    return rows.map((r) => ({ day: r.day, status: r.status, count: Number(r.count) }));
  }

  private dayStart() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }
  private hoursAgo(h: number) {
    return new Date(Date.now() - h * 3600_000);
  }
  private daysAgo(d: number) {
    return new Date(Date.now() - d * 86_400_000);
  }
}
