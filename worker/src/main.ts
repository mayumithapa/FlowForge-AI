import 'reflect-metadata';
import * as http from 'http';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { WorkerModule } from './worker.module';
import { WorkflowConsumer } from './consumers/workflow.consumer';
import { EmailConsumer } from './consumers/email.consumer';
import { AnalyticsConsumer } from './consumers/analytics.consumer';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(WorkerModule, {
    logger: ['log', 'error', 'warn', 'debug'],
  });

  await app.get(WorkflowConsumer).start();
  await app.get(EmailConsumer).start();
  await app.get(AnalyticsConsumer).start();

  Logger.log('FlowForge worker is consuming queues. Press Ctrl-C to stop.', 'Bootstrap');

  // Minimal HTTP server so Render free-tier web services can health-check this process.
  const port = parseInt(process.env.PORT ?? '3001', 10);
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'flowforge-worker' }));
  });
  server.listen(port, () =>
    Logger.log(`Health server listening on :${port}`, 'Bootstrap'),
  );

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
