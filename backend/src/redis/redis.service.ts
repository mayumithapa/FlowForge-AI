import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis, { RedisOptions } from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly client: Redis;

  constructor() {
    const url = process.env.REDIS_URL || 'redis://localhost:6379';
    const opts: RedisOptions = {
      maxRetriesPerRequest: null,
      lazyConnect: false,
      ...(url.startsWith('rediss://') ? { tls: {} } : {}),
    };
    this.client = new Redis(url, opts);
    this.client.on('connect', () => this.logger.log(`Redis connected (${url})`));
    this.client.on('error', (err) => this.logger.error(`Redis error: ${err.message}`));
  }

  /** Raw client for fancy commands (rate limiting, BullMQ, etc.). */
  raw(): Redis {
    return this.client;
  }

  async get<T = unknown>(key: string): Promise<T | null> {
    const raw = await this.client.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  }

  async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    const payload = JSON.stringify(value);
    if (ttlSeconds) {
      await this.client.set(key, payload, 'EX', ttlSeconds);
    } else {
      await this.client.set(key, payload);
    }
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  /**
   * Token bucket-ish rate limit. Returns `true` if the action is allowed.
   * Used by the AI service for per-workspace request throttling.
   */
  async rateLimit(key: string, limit: number, windowSec: number): Promise<boolean> {
    const bucket = `rl:${key}`;
    const count = await this.client.incr(bucket);
    if (count === 1) await this.client.expire(bucket, windowSec);
    return count <= limit;
  }

  async onModuleDestroy() {
    await this.client.quit();
  }
}
