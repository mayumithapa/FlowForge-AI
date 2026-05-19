import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { PrismaModule } from '../../backend/src/prisma/prisma.module';
import { RedisModule } from '../../backend/src/redis/redis.module';
import { RabbitMQModule } from '../../backend/src/rabbitmq/rabbitmq.module';
import { AiModule } from '../../backend/src/ai/ai.module';
import { WorkspaceModule } from '../../backend/src/workspace/workspace.module';
import { AnalyticsModule } from '../../backend/src/analytics/analytics.module';
import { WorkflowModule } from '../../backend/src/workflow/workflow.module';

import { WorkflowConsumer } from './consumers/workflow.consumer';
import { EmailConsumer } from './consumers/email.consumer';
import { AnalyticsConsumer } from './consumers/analytics.consumer';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    RedisModule,
    RabbitMQModule,
    WorkspaceModule,
    AiModule,
    AnalyticsModule,
    WorkflowModule,
  ],
  providers: [WorkflowConsumer, EmailConsumer, AnalyticsConsumer],
})
export class WorkerModule {}
