import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService, private readonly redis: RedisService) {}

  @Get()
  async health() {
    const checks = {
      db: 'unknown' as 'ok' | 'error' | 'unknown',
      redis: 'unknown' as 'ok' | 'error' | 'unknown',
    };
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      checks.db = 'ok';
    } catch {
      checks.db = 'error';
    }
    try {
      await this.redis.raw().ping();
      checks.redis = 'ok';
    } catch {
      checks.redis = 'error';
    }
    return { status: checks.db === 'ok' && checks.redis === 'ok' ? 'ok' : 'degraded', checks, ts: new Date().toISOString() };
  }
}
