import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import * as amqp from 'amqplib';
import { v4 as uuid } from 'uuid';

import {
  EXCHANGE_DLX,
  EXCHANGE_EVENTS,
  QUEUES,
  QueueName,
  RoutingKey,
} from './rabbitmq.constants';

interface PublishOptions {
  idempotencyKey?: string;
  delayMs?: number;
  attempt?: number;
}

const QUEUE_BINDINGS: Array<{ queue: QueueName; pattern: string }> = [
  { queue: QUEUES.WORKFLOW_EXECUTE, pattern: 'workflow.execute.*' },
  { queue: QUEUES.WORKFLOW_STEP, pattern: 'workflow.step.*' },
  { queue: QUEUES.AI_PROCESS, pattern: 'ai.*' },
  { queue: QUEUES.EMAIL_SEND, pattern: 'email.send' },
  { queue: QUEUES.ANALYTICS, pattern: 'analytics.*' },
];

@Injectable()
export class RabbitMQService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitMQService.name);
  private connection?: amqp.Connection;
  private channel?: amqp.Channel;
  private connecting = false;

  async onModuleInit() {
    await this.connect();
  }

  async onModuleDestroy() {
    try {
      await this.channel?.close();
      await this.connection?.close();
    } catch (err) {
      this.logger.warn(`Error closing RabbitMQ: ${(err as Error).message}`);
    }
  }

  private async connect(): Promise<void> {
    if (this.connecting) return;
    this.connecting = true;
    const url = process.env.RABBITMQ_URL || 'amqp://localhost:5672';

    try {
      this.connection = await amqp.connect(url);
      this.connection.on('close', () => {
        this.logger.warn('RabbitMQ connection closed; reconnecting in 5s');
        setTimeout(() => this.connect(), 5000);
      });
      this.connection.on('error', (err) =>
        this.logger.error(`RabbitMQ error: ${err.message}`),
      );

      this.channel = await this.connection.createChannel();
      await this.channel.prefetch(parseInt(process.env.WORKER_CONCURRENCY || '5', 10));
      await this.setupTopology(this.channel);
      this.logger.log(`RabbitMQ connected (${url})`);
    } catch (err) {
      this.logger.error(`RabbitMQ connect failed: ${(err as Error).message}; retrying in 5s`);
      setTimeout(() => this.connect(), 5000);
    } finally {
      this.connecting = false;
    }
  }

  private async setupTopology(channel: amqp.Channel) {
    await channel.assertExchange(EXCHANGE_EVENTS, 'topic', { durable: true });
    await channel.assertExchange(EXCHANGE_DLX, 'topic', { durable: true });

    for (const { queue, pattern } of QUEUE_BINDINGS) {
      await channel.assertQueue(queue, {
        durable: true,
        arguments: {
          'x-dead-letter-exchange': EXCHANGE_DLX,
          'x-dead-letter-routing-key': `${queue}.dlq`,
        },
      });
      await channel.bindQueue(queue, EXCHANGE_EVENTS, pattern);

      const dlq = `${queue}.dlq`;
      await channel.assertQueue(dlq, { durable: true });
      await channel.bindQueue(dlq, EXCHANGE_DLX, `${queue}.dlq`);
    }
  }

  /** Publish a message to the events exchange with the given routing key. */
  async publish(
    routingKey: RoutingKey | string,
    payload: unknown,
    opts: PublishOptions = {},
  ): Promise<string> {
    if (!this.channel) {
      await this.connect();
    }
    const messageId = opts.idempotencyKey ?? uuid();
    const headers: Record<string, unknown> = {
      'x-idempotency-key': messageId,
      'x-attempt': opts.attempt ?? 0,
    };
    if (opts.delayMs && opts.delayMs > 0) {
      headers['x-delay'] = opts.delayMs;
    }
    const ok = this.channel!.publish(
      EXCHANGE_EVENTS,
      routingKey,
      Buffer.from(JSON.stringify(payload)),
      {
        contentType: 'application/json',
        persistent: true,
        messageId,
        headers,
      },
    );
    if (!ok) {
      this.logger.warn(`Backpressure publishing to ${routingKey}`);
    }
    return messageId;
  }

  /**
   * Consume a queue. The handler is invoked per message; throwing will nack
   * the message which routes it to the DLX after exceeding max attempts.
   */
  async consume(
    queue: QueueName,
    handler: (payload: unknown, meta: { attempt: number; messageId: string }) => Promise<void>,
    opts: { maxAttempts?: number } = {},
  ) {
    if (!this.channel) await this.connect();
    const maxAttempts = opts.maxAttempts ?? 5;

    await this.channel!.consume(queue, async (msg) => {
      if (!msg) return;
      const attempt = Number(msg.properties.headers?.['x-attempt'] ?? 0);
      const messageId = String(msg.properties.messageId ?? uuid());
      let payload: unknown;
      try {
        payload = JSON.parse(msg.content.toString());
      } catch (err) {
        this.logger.error(`Bad JSON in ${queue}; dropping to DLQ`);
        this.channel!.nack(msg, false, false);
        return;
      }

      try {
        await handler(payload, { attempt, messageId });
        this.channel!.ack(msg);
      } catch (err) {
        const next = attempt + 1;
        const errMsg = (err as Error).message;
        if (next >= maxAttempts) {
          this.logger.error(`Job ${queue}/${messageId} dead after ${next} attempts: ${errMsg}`);
          this.channel!.nack(msg, false, false);
          return;
        }
        const backoff = Math.min(60_000, 2 ** next * 1000);
        this.logger.warn(`Job ${queue}/${messageId} failed (attempt ${next}/${maxAttempts}): ${errMsg}; retry in ${backoff}ms`);
        setTimeout(() => {
          this.publish(msg.fields.routingKey, payload, {
            idempotencyKey: messageId,
            attempt: next,
          }).catch((e) => this.logger.error(`Retry publish failed: ${e.message}`));
          this.channel!.ack(msg);
        }, backoff);
      }
    });

    this.logger.log(`Consuming ${queue}`);
  }
}
