import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';

import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { RabbitMQModule } from './rabbitmq/rabbitmq.module';
import { HealthModule } from './health/health.module';

import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { WorkspaceModule } from './workspace/workspace.module';
import { WorkflowModule } from './workflow/workflow.module';
import { LeadsModule } from './leads/leads.module';
import { EmailModule } from './email/email.module';
import { CampaignModule } from './campaign/campaign.module';
import { AiModule } from './ai/ai.module';
import { QueueModule } from './queue/queue.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { WebhooksModule } from './webhooks/webhooks.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    PrismaModule,
    RedisModule,
    RabbitMQModule,
    HealthModule,
    AuthModule,
    UsersModule,
    WorkspaceModule,
    WorkflowModule,
    LeadsModule,
    EmailModule,
    CampaignModule,
    AiModule,
    QueueModule,
    AnalyticsModule,
    WebhooksModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
