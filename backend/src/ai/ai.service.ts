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
 * Thin facade over the OpenAI SDK with:
 *   - centralized prompt templates (./prompts)
 *   - per-workspace rate limiting via Redis
 *   - exponential-backoff retries on 429/5xx
 *   - structured JSON responses (response_format: json_object)
 *   - JobLog token tracking
 *   - graceful offline mode for local dev when no API key is provided
 */
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly client: OpenAI | null;
  private readonly model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  private readonly rateLimit = parseInt(process.env.AI_RATE_LIMIT_PER_MIN || '60', 10);

  constructor(private readonly prisma: PrismaService, private readonly redis: RedisService) {
    const key = process.env.OPENAI_API_KEY;
    const baseURL = process.env.AI_BASE_URL; // e.g. https://api.x.ai/v1 for Grok
    this.client = key && key !== 'sk-replace-me'
      ? new OpenAI({ apiKey: key, ...(baseURL ? { baseURL } : {}) })
      : null;
    if (!this.client) {
      this.logger.warn('OPENAI_API_KEY not set; AI service is running in OFFLINE MOCK mode');
    } else {
      this.logger.log(`AI client ready (baseURL: ${baseURL ?? 'https://api.openai.com/v1'})`);
    }
  }

  // --------------------------------------------------------------------------
  // Public AI primitives
  // --------------------------------------------------------------------------
  async classify(workspaceId: string, text: string, categories: string[]): Promise<ClassifyResult> {
    if (!this.client) return this.mockClassify(text, categories);
    const { system, user } = PROMPTS.classify(text, categories);
    const result = await this.invoke<ClassifyResult>(workspaceId, 'classify', system, user);
    return {
      category: categories.includes(result.category) ? result.category : categories[0],
      confidence: typeof result.confidence === 'number' ? result.confidence : 0.5,
      reason: result.reason,
    };
  }

  async sentiment(workspaceId: string, text: string): Promise<SentimentResult> {
    if (!this.client) return this.mockSentiment(text);
    const { system, user } = PROMPTS.sentiment(text);
    return this.invoke<SentimentResult>(workspaceId, 'sentiment', system, user);
  }

  async summarize(workspaceId: string, text: string, maxWords = 60): Promise<SummaryResult> {
    if (!this.client) return { summary: text.split(/\s+/).slice(0, maxWords).join(' ') };
    const { system, user } = PROMPTS.summarize(text, maxWords);
    return this.invoke<SummaryResult>(workspaceId, 'summarize', system, user);
  }

  async generateEmail(
    workspaceId: string,
    params: { tone: string; goal: string; recipientName?: string; recipientCompany?: string; context?: unknown },
  ): Promise<GeneratedEmail> {
    if (!this.client) return this.mockEmail(params);
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
        const response = await this.client!.chat.completions.create({
          model: this.model,
          temperature: 0.4,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: system },
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
        const e = err as { status?: number; message?: string };
        const retryable = !e.status || e.status >= 500 || e.status === 429;
        if (!retryable || attempt >= maxAttempts) break;
        const backoff = 250 * 2 ** attempt;
        this.logger.warn(`AI ${op} attempt ${attempt} failed (${e.status ?? '?'}); retry in ${backoff}ms`);
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

  // --------------------------------------------------------------------------
  // Offline mocks (so MVP demo works without an API key)
  // --------------------------------------------------------------------------
  private mockClassify(text: string, categories: string[]): ClassifyResult {
    const hash = [...text].reduce((a, c) => a + c.charCodeAt(0), 0);
    return { category: categories[hash % categories.length], confidence: 0.7, reason: 'offline mock' };
  }
  private mockSentiment(text: string): SentimentResult {
    const negWords = ['bad', 'angry', 'cancel', 'refund', 'not'];
    const posWords = ['great', 'love', 'amazing', 'happy', 'thanks'];
    let score = 0;
    for (const w of negWords) if (text.toLowerCase().includes(w)) score -= 0.3;
    for (const w of posWords) if (text.toLowerCase().includes(w)) score += 0.3;
    score = Math.max(-1, Math.min(1, score));
    const sentiment = score > 0.1 ? 'positive' : score < -0.1 ? 'negative' : 'neutral';
    return { sentiment, score, reason: 'offline mock' };
  }
  private mockEmail(params: { recipientName?: string; recipientCompany?: string; goal: string; tone: string }): GeneratedEmail {
    const name = params.recipientName || 'there';
    const subject = `Quick idea for ${params.recipientCompany || 'your team'}`;
    const bodyText = `Hi ${name},\n\nI'm reaching out because we help teams like yours ${params.goal}. Would you be open to a short conversation this week?\n\n— FlowForge AI (${params.tone} offline mock)`;
    return {
      subject,
      bodyHtml: `<p>Hi ${name},</p><p>I'm reaching out because we help teams like yours ${params.goal}. Would you be open to a short conversation this week?</p><p>— FlowForge AI</p>`,
      bodyText,
    };
  }
}
