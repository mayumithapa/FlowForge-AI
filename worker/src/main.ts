import 'reflect-metadata';
import * as http from 'http';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { WorkerModule } from './worker.module';
import { WorkflowConsumer } from './consumers/workflow.consumer';
import { EmailConsumer } from './consumers/email.consumer';
import { AnalyticsConsumer } from './consumers/analytics.consumer';

async function bootstrap() {
  // 1️⃣ Start health-check HTTP server FIRST so Render detects the port immediately.
  const port = parseInt(process.env.PORT ?? '3001', 10);
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'flowforge-worker' }));
  });
  await new Promise<void>((resolve) => server.listen(port, resolve));
  Logger.log(`Health server listening on :${port}`, 'Bootstrap');

  // 2️⃣ Boot NestJS application context (connects Prisma, Redis, RabbitMQ).
  const app = await NestFactory.createApplicationContext(WorkerModule, {
    logger: ['log', 'error', 'warn', 'debug'],
  });

  // 3️⃣ Start consumers — non-blocking so startup doesn't crash if MQ is slow.
  const startConsumers = async () => {
    try {
      await app.get(WorkflowConsumer).start();
      await app.get(EmailConsumer).start();
      await app.get(AnalyticsConsumer).start();
      Logger.log('All consumers started.', 'Bootstrap');
    } catch (err) {
      Logger.error(`Consumer start failed: ${(err as Error).message}`, 'Bootstrap');
      // Retry after 10s — RabbitMQ might still be connecting.
      setTimeout(startConsumers, 10_000);
    }
  };
  startConsumers();

  Logger.log('FlowForge worker is running. Press Ctrl-C to stop.', 'Bootstrap');

  const shutdown = async (sig: string) => {
    Logger.log(`Received ${sig}; shutting down`, 'Bootstrap');
    server.close();
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Worker bootstrap failed', err);
  process.exit(1);
});
