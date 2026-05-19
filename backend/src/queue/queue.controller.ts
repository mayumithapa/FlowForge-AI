import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthUser, CurrentUser } from '../auth/decorators/current-user.decorator';
import { QueueService } from './queue.service';

@ApiTags('queue')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('workspaces/:workspaceId/queue')
export class QueueController {
  constructor(private readonly queue: QueueService) {}

  @Get('stats')
  stats(@CurrentUser() u: AuthUser, @Param('workspaceId') ws: string) {
    return this.queue.stats(u.id, ws);
  }

  @Get('failures')
  failures(@CurrentUser() u: AuthUser, @Param('workspaceId') ws: string) {
    return this.queue.recentFailures(u.id, ws);
  }
}
