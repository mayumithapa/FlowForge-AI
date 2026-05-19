import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthUser, CurrentUser } from '../auth/decorators/current-user.decorator';
import { CreateTemplateDto, SendEmailDto, UpdateTemplateDto } from './dto/email.dto';
import { EmailService } from './email.service';

@ApiTags('email')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('workspaces/:workspaceId')
export class EmailController {
  constructor(private readonly email: EmailService) {}

  @Get('email-templates')
  listTemplates(@CurrentUser() u: AuthUser, @Param('workspaceId') ws: string) {
    return this.email.listTemplates(u.id, ws);
  }

  @Post('email-templates')
  createTemplate(@CurrentUser() u: AuthUser, @Param('workspaceId') ws: string, @Body() dto: CreateTemplateDto) {
    return this.email.createTemplate(u.id, ws, dto);
  }

  @Patch('email-templates/:id')
  updateTemplate(
    @CurrentUser() u: AuthUser,
    @Param('workspaceId') ws: string,
    @Param('id') id: string,
    @Body() dto: UpdateTemplateDto,
  ) {
    return this.email.updateTemplate(u.id, ws, id, dto);
  }

  @Delete('email-templates/:id')
  deleteTemplate(@CurrentUser() u: AuthUser, @Param('workspaceId') ws: string, @Param('id') id: string) {
    return this.email.deleteTemplate(u.id, ws, id);
  }

  @Post('emails')
  send(@CurrentUser() u: AuthUser, @Param('workspaceId') ws: string, @Body() dto: SendEmailDto) {
    return this.email.send(u.id, ws, dto);
  }

  @Get('emails')
  listMessages(@CurrentUser() u: AuthUser, @Param('workspaceId') ws: string) {
    return this.email.listMessages(u.id, ws);
  }

  @Get('emails/:id')
  getMessage(@CurrentUser() u: AuthUser, @Param('workspaceId') ws: string, @Param('id') id: string) {
    return this.email.getMessage(u.id, ws, id);
  }
}
