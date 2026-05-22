import { Module } from '@nestjs/common';

import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';

/**
 * Public webhooks (form ingestion). PrismaService, RabbitMQService, and
 * RedisService are global, so we don't need to re-import their modules.
 */
@Module({
  controllers: [WebhooksController],
  providers: [WebhooksService],
  exports: [WebhooksService],
})
export class WebhooksModule {}
