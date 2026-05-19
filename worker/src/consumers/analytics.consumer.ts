import { Injectable, Logger } from '@nestjs/common';

import { RabbitMQService } from '../../../backend/src/rabbitmq/rabbitmq.service';
import { QUEUES } from '../../../backend/src/rabbitmq/rabbitmq.constants';
import { AnalyticsService } from '../../../backend/src/analytics/analytics.service';

interface AnalyticsJob {
  workspaceId: string;
  name: string;
  payload?: Record<string, unknown>;
}

@Injectable()
export class AnalyticsConsumer {
  private readonly logger = new Logger(AnalyticsConsumer.name);

  constructor(private readonly mq: RabbitMQService, private readonly analytics: AnalyticsService) {}

  async start() {
    await this.mq.consume(QUEUES.ANALYTICS, async (raw) => {
      const job = raw as AnalyticsJob;
      if (!job.workspaceId || !job.name) return;
      await this.analytics.record(job.workspaceId, job.name, job.payload);
    });
  }
}
