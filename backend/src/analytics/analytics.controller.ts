import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthUser, CurrentUser } from '../auth/decorators/current-user.decorator';
import { AnalyticsService } from './analytics.service';

@ApiTags('analytics')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('workspaces/:workspaceId/analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('summary')
  summary(@CurrentUser() u: AuthUser, @Param('workspaceId') ws: string) {
    return this.analytics.summary(u.id, ws);
  }

  @Get('executions')
  executions(
    @CurrentUser() u: AuthUser,
    @Param('workspaceId') ws: string,
    @Query('days') days?: string,
  ) {
    return this.analytics.executionsTimeseries(u.id, ws, days ? parseInt(days, 10) : 14);
  }
}
