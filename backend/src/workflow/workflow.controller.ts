import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthUser, CurrentUser } from '../auth/decorators/current-user.decorator';
import {
  CreateWorkflowDto,
  RunWorkflowDto,
  SaveGraphDto,
  UpdateWorkflowDto,
} from './dto/workflow.dto';
import { WorkflowService } from './workflow.service';

@ApiTags('workflows')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('workspaces/:workspaceId/workflows')
export class WorkflowController {
  constructor(private readonly workflows: WorkflowService) {}

  @Get()
  list(@CurrentUser() u: AuthUser, @Param('workspaceId') ws: string) {
    return this.workflows.list(u.id, ws);
  }

  @Post()
  create(@CurrentUser() u: AuthUser, @Param('workspaceId') ws: string, @Body() dto: CreateWorkflowDto) {
    return this.workflows.create(u.id, ws, dto);
  }

  @Get(':id')
  get(@CurrentUser() u: AuthUser, @Param('workspaceId') ws: string, @Param('id') id: string) {
    return this.workflows.get(u.id, ws, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() u: AuthUser,
    @Param('workspaceId') ws: string,
    @Param('id') id: string,
    @Body() dto: UpdateWorkflowDto,
  ) {
    return this.workflows.update(u.id, ws, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() u: AuthUser, @Param('workspaceId') ws: string, @Param('id') id: string) {
    return this.workflows.remove(u.id, ws, id);
  }

  @Post(':id/graph')
  saveGraph(
    @CurrentUser() u: AuthUser,
    @Param('workspaceId') ws: string,
    @Param('id') id: string,
    @Body() dto: SaveGraphDto,
  ) {
    return this.workflows.saveGraph(u.id, ws, id, dto);
  }

  @Post(':id/run')
  run(
    @CurrentUser() u: AuthUser,
    @Param('workspaceId') ws: string,
    @Param('id') id: string,
    @Body() dto: RunWorkflowDto,
  ) {
    return this.workflows.run(u.id, ws, id, dto);
  }

  @Get(':id/executions')
  listExecutions(@CurrentUser() u: AuthUser, @Param('workspaceId') ws: string, @Param('id') id: string) {
    return this.workflows.listExecutions(u.id, ws, id);
  }

  @Get('executions/:executionId')
  getExecution(
    @CurrentUser() u: AuthUser,
    @Param('workspaceId') ws: string,
    @Param('executionId') executionId: string,
  ) {
    return this.workflows.getExecution(u.id, ws, executionId);
  }
}
