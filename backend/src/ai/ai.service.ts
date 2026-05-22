import { HttpException, HttpStatus, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import OpenAI from 'openai';

import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { PROMPTS } from './prompts';

export interface ClassifyResult {
  category: string;
  confidence: number;
  reason?: string;
}

export interface SentimentResult {
  sentiment: 'positive' | 'neutral' | 'negative';
  score: number;
  reason?: string;
}

export interface SummaryResult {
  summary: string;
}

export interface GeneratedEmail {
  subject: string;
  bodyHtml: string;
  bodyText: string;
}

/**
 * AiService
 * =========
 *
 * Thin facade over the OpenAI-compatible SDK with:
 *   - centralized prompt templates (./prompts)
 *   - per-workspace rate limiting via Redis
 *   - exponential-backoff retries on 429/5xx
 *   - structured JSON responses via prompt instruction
 *   - JobLog token tracking
 *   - throws a clear error if OPENAI_API_KEY is not configured
 */
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly client: OpenAI;
  private readonly model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  private readonly rateLimit = parseInt(process.env.AI_RATE_LIMIT_PER_MIN || '60', 10);
  // json_object mode is OpenAI-native; Groq & other providers use prompt-based JSON instead.
  private readonly useJsonMode = !process.env.AI_BASE_URL;

  constructor(private readonly prisma: PrismaService, private readonly redis: RedisService) {
    const key = process.env.OPENAI_API_KEY;
    const baseURL = process.env.AI_BASE_URL;

    if (!key) {
      throw new Error('OPENAI_API_KEY environment variable is not set. AI service cannot start.');
    }

    this.client = new OpenAI({ apiKey: key, ...(baseURL ? { baseURL } : {}) });
    this.logger.log(`AI client ready — model: ${this.model}, baseURL: ${baseURL ?? 'https://api.openai.com/v1'}`);
  }

  // --------------------------------------------------------------------------
  // Public AI primitives
  // --------------------------------------------------------------------------
  async classify(workspaceId: string, text: string, categories: string[]): Promise<ClassifyResult> {
    const { system, user } = PROMPTS.classify(text, categories);
    const result = await this.invoke<ClassifyResult>(workspaceId, 'classify', system, user);
    return {
      category: categories.includes(result.category) ? result.category : categories[0],
      confidence: typeof result.confidence === 'number' ? result.confidence : 0.5,
      reason: result.reason,
    };
  }

  async sentiment(workspaceId: string, text: string): Promise<SentimentResult> {
    const { system, user } = PROMPTS.sentiment(text);
    return this.invoke<SentimentResult>(workspaceId, 'sentiment', system, user);
  }

  async summarize(workspaceId: string, text: string, maxWords = 60): Promise<SummaryResult> {
    const { system, user } = PROMPTS.summarize(text, maxWords);
    return this.invoke<SummaryResult>(workspaceId, 'summarize', system, user);
  }

  async generateEmail(
    workspaceId: string,
    params: { tone: string; goal: string; recipientName?: string; recipientCompany?: string; senderName?: string; senderCompany?: string; context?: unknown },
  ): Promise<GeneratedEmail> {
    const { system, user } = PROMPTS.generateEmail(params);
    return this.invoke<GeneratedEmail>(workspaceId, 'generateEmail', system, user);
  }

  // --------------------------------------------------------------------------
  // Internals
  // --------------------------------------------------------------------------
  private async invoke<T>(workspaceId: string, op: string, system: string, user: string): Promise<T> {
    const allowed = await this.redis.rateLimit(`ai:${workspaceId}`, this.rateLimit, 60);
    if (!allowed) throw new HttpException('AI rate limit exceeded for workspace', HttpStatus.TOO_MANY_REQUESTS);

    const t0 = Date.now();
    let attempt = 0;
    const maxAttempts = 3;
    let lastErr: unknown;

    while (attempt < maxAttempts) {
      attempt++;
      try {
        const response = await this.client.chat.completions.create({
          model: this.model,
          temperature: 0.4,
          ...(this.useJsonMode ? { response_format: { type: 'json_object' } } : {}),
          messages: [
            { role: 'system', content: `${system}\nAlways respond with valid JSON only. No markdown, no explanation.` },
            { role: 'user', content: user },
          ],
        });
        const text = response.choices[0]?.message?.content ?? '{}';
        const parsed = JSON.parse(text) as T;
        await this.prisma.jobLog.create({
          data: {
            workspaceId,
            queue: 'ai',
            jobName: op,
            status: 'SUCCESS',
            attempts: attempt,
            payload: { model: this.model, op } as any,
            result: {
              durationMs: Date.now() - t0,
              promptTokens: response.usage?.prompt_tokens ?? null,
              completionTokens: response.usage?.completion_tokens ?? null,
              totalTokens: response.usage?.total_tokens ?? null,
            } as any,
            finishedAt: new Date(),
          },
        });
        return parsed;
      } catch (err) {
        lastErr = err;
        const e = err as { status?: number; message?: string; error?: unknown };
        this.logger.error(`AI ${op} attempt ${attempt} error [${e.status ?? '?'}]: ${e.message ?? JSON.stringify(e)}`);
        const retryable = !e.status || e.status >= 500 || e.status === 429;
        if (!retryable || attempt >= maxAttempts) break;
        const backoff = 250 * 2 ** attempt;
        this.logger.warn(`Retrying in ${backoff}ms...`);
        await new Promise((r) => setTimeout(r, backoff));
      }
    }

    await this.prisma.jobLog.create({
      data: {
        workspaceId,
        queue: 'ai',
        jobName: op,
        status: 'FAILED',
        attempts: attempt,
        payload: { model: this.model, op } as any,
        error: (lastErr as Error)?.message ?? 'unknown',
        finishedAt: new Date(),
      },
    });
    throw new ServiceUnavailableException(`AI ${op} failed after ${attempt} attempts`);
  }
}
