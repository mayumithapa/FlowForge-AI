/**
 * RabbitMQ topology constants.
 *
 * We use a single topic exchange (`flowforge.events`) so producers don't need
 * to know about which queue ends up consuming a job, and a dedicated DLX
 * (`flowforge.dlx`) for poison messages.
 *
 *   exchange:  flowforge.events  (topic, durable)
 *   exchange:  flowforge.dlx     (topic, durable)
 *
 *   queue: workflow.execute    binds  workflow.execute.*
 *   queue: workflow.step       binds  workflow.step.*
 *   queue: ai.process          binds  ai.*
 *   queue: email.send          binds  email.send
 *   queue: analytics.record    binds  analytics.*
 *
 * Each queue has x-dead-letter-exchange = flowforge.dlx and a parallel
 * `<queue>.dlq` bound to the DLX so we can inspect/replay failures.
 */
export const EXCHANGE_EVENTS = 'flowforge.events';
export const EXCHANGE_DLX = 'flowforge.dlx';

export const QUEUES = {
  WORKFLOW_EXECUTE: 'workflow.execute',
  WORKFLOW_STEP: 'workflow.step',
  AI_PROCESS: 'ai.process',
  EMAIL_SEND: 'email.send',
  ANALYTICS: 'analytics.record',
} as const;

export const ROUTING_KEYS = {
  WORKFLOW_EXECUTE: 'workflow.execute.start',
  WORKFLOW_STEP: 'workflow.step.run',
  AI_CLASSIFY: 'ai.classify',
  AI_SENTIMENT: 'ai.sentiment',
  AI_SUMMARIZE: 'ai.summarize',
  AI_GENERATE_EMAIL: 'ai.generate_email',
  EMAIL_SEND: 'email.send',
  ANALYTICS_RECORD: 'analytics.record',
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];
export type RoutingKey = (typeof ROUTING_KEYS)[keyof typeof ROUTING_KEYS];
