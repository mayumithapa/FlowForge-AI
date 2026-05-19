import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { LeadStatus } from '@prisma/client';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthUser, CurrentUser } from '../auth/decorators/current-user.decorator';
import { CreateLeadDto, ImportLeadsDto, UpdateLeadDto } from './dto/lead.dto';
import { LeadsService } from './leads.service';

@ApiTags('leads')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('workspaces/:workspaceId/leads')
export class LeadsController {
  constructor(private readonly leads: LeadsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Param('workspaceId') workspaceId: string,
    @Query('status') status?: LeadStatus,
    @Query('q') q?: string,
    @Query('take') take?: string,
    @Query('skip') skip?: string,
  ) {
    return this.leads.list(user.id, workspaceId, {
      status,
      q,
      take: take ? parseInt(take, 10) : undefined,
      skip: skip ? parseInt(skip, 10) : undefined,
    });
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Param('workspaceId') workspaceId: string, @Body() dto: CreateLeadDto) {
    return this.leads.create(user.id, { ...dto, workspaceId });
  }

  @Post('import')
  import(@CurrentUser() user: AuthUser, @Param('workspaceId') workspaceId: string, @Body() dto: ImportLeadsDto) {
    return this.leads.import(user.id, { ...dto, workspaceId });
  }

  @Patch(':leadId')
  update(
    @CurrentUser() user: AuthUser,
    @Param('workspaceId') workspaceId: string,
    @Param('leadId') leadId: string,
    @Body() dto: UpdateLeadDto,
  ) {
    return this.leads.update(user.id, workspaceId, leadId, dto);
  }

  @Delete(':leadId')
  remove(@CurrentUser() user: AuthUser, @Param('workspaceId') workspaceId: string, @Param('leadId') leadId: string) {
    return this.leads.softDelete(user.id, workspaceId, leadId);
  }
}
