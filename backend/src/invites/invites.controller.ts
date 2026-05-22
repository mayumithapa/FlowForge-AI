import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthUser, CurrentUser } from '../auth/decorators/current-user.decorator';
import { InvitesService } from './invites.service';
import { CreateInviteDto } from './dto/invite.dto';

@ApiTags('invites')
@Controller()
export class InvitesController {
  constructor(private readonly invites: InvitesService) {}

  // ── Members ──────────────────────────────────────────────────────────────────

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('workspaces/:workspaceId/members')
  listMembers(@CurrentUser() u: AuthUser, @Param('workspaceId') ws: string) {
    return this.invites.listMembers(u.id, ws);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Patch('workspaces/:workspaceId/members/:userId/role')
  updateRole(
    @CurrentUser() u: AuthUser,
    @Param('workspaceId') ws: string,
    @Param('userId') targetId: string,
    @Body('role') role: UserRole,
  ) {
    return this.invites.updateMemberRole(u.id, ws, targetId, role);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Delete('workspaces/:workspaceId/members/:userId')
  removeMember(
    @CurrentUser() u: AuthUser,
    @Param('workspaceId') ws: string,
    @Param('userId') targetId: string,
  ) {
    return this.invites.removeMember(u.id, ws, targetId);
  }

  // ── Invites ──────────────────────────────────────────────────────────────────

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('workspaces/:workspaceId/invites')
  listInvites(@CurrentUser() u: AuthUser, @Param('workspaceId') ws: string) {
    return this.invites.listInvites(u.id, ws);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('workspaces/:workspaceId/invites')
  createInvite(
    @CurrentUser() u: AuthUser,
    @Param('workspaceId') ws: string,
    @Body() dto: CreateInviteDto,
  ) {
    return this.invites.createInvite(u.id, ws, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Delete('workspaces/:workspaceId/invites/:inviteId')
  cancelInvite(
    @CurrentUser() u: AuthUser,
    @Param('workspaceId') ws: string,
    @Param('inviteId') inviteId: string,
  ) {
    return this.invites.cancelInvite(u.id, ws, inviteId);
  }

  // ── Public: accept ────────────────────────────────────────────────────────────

  @Get('invites/:token')
  getInvite(@Param('token') token: string) {
    return this.invites.getInviteByToken(token);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('invites/:token/accept')
  acceptInvite(@CurrentUser() u: AuthUser, @Param('token') token: string) {
    return this.invites.acceptInvite(token, u.id);
  }
}
