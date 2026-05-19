import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthUser, CurrentUser } from '../auth/decorators/current-user.decorator';
import { CampaignService } from './campaign.service';
import { CreateCampaignDto, LaunchCampaignDto, UpdateCampaignDto } from './dto/campaign.dto';

@ApiTags('campaigns')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('workspaces/:workspaceId/campaigns')
export class CampaignController {
  constructor(private readonly campaigns: CampaignService) {}

  @Get()
  list(@CurrentUser() u: AuthUser, @Param('workspaceId') ws: string) {
    return this.campaigns.list(u.id, ws);
  }

  @Post()
  create(@CurrentUser() u: AuthUser, @Param('workspaceId') ws: string, @Body() dto: CreateCampaignDto) {
    return this.campaigns.create(u.id, ws, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() u: AuthUser,
    @Param('workspaceId') ws: string,
    @Param('id') id: string,
    @Body() dto: UpdateCampaignDto,
  ) {
    return this.campaigns.update(u.id, ws, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() u: AuthUser, @Param('workspaceId') ws: string, @Param('id') id: string) {
    return this.campaigns.remove(u.id, ws, id);
  }

  @Post(':id/launch')
  launch(
    @CurrentUser() u: AuthUser,
    @Param('workspaceId') ws: string,
    @Param('id') id: string,
    @Body() dto: LaunchCampaignDto,
  ) {
    return this.campaigns.launch(u.id, ws, id, dto);
  }
}
