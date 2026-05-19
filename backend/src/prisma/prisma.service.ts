import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: [
        { emit: 'event', level: 'error' },
        { emit: 'event', level: 'warn' },
      ],
    });
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('Prisma connected');
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  /**
   * Helper that filters out soft-deleted rows for any model that has a
   * `deletedAt` column. Use as a sane default in services:
   *
   *   prisma.workflow.findMany({ where: this.prisma.notDeleted({ workspaceId }) })
   */
  notDeleted<T extends Record<string, unknown>>(where: T = {} as T) {
    return { ...where, deletedAt: null } as T & { deletedAt: null };
  }
}
