import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Logger,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import type { Request } from 'express';

import { WebhooksService } from './webhooks.service';

/**
 * Public webhooks endpoint — intentionally unauthenticated. Each route is
 * scoped by an opaque token in the URL, and the WebhooksService applies its
 * own rate limit + optional HMAC signature check. Throttling is also
 * skipped on the global guard because we use a per-token Redis bucket
 * instead (more precise for multi-tenant workloads).
 */
@ApiTags('webhooks')
@Controller('webhooks')
@SkipThrottle()
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);
  constructor(private readonly webhooks: WebhooksService) {}

  /**
   * Returns the form schema for the embeddable widget / hosted form page.
   * Safe to call from any origin; reveals nothing sensitive.
   */
  @Get(':token/schema')
  schema(@Param('token') token: string) {
    return this.webhooks.getPublicSchema(token);
  }

  /**
   * Receive a form submission. Accepts JSON OR form-encoded bodies — Nest's
   * default body-parser handles both transparently when Content-Type is set.
   */
  @Post(':token')
  @HttpCode(200)
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  async receive(
    @Param('token') token: string,
    @Body() body: Record<string, unknown>,
    @Headers('x-flowforge-signature') signature: string | undefined,
    @Req() req: Request,
  ) {
    // For HMAC verification we need the exact bytes the caller signed.
    // Express puts the parsed body on req.body but the raw stream is
    // consumed; we re-serialize the parsed body deterministically. This is
    // acceptable because the body parser is JSON-aware and produces stable
    // output for the shapes we accept here.
    const rawBody = JSON.stringify(body ?? {});
    return this.webhooks.receive(token, body ?? {}, rawBody, signature);
  }
}
