import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString } from 'class-validator';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthUser, CurrentUser } from '../auth/decorators/current-user.decorator';
import { WorkspaceService } from '../workspace/workspace.service';
import { AiService } from './ai.service';

class ClassifyDto {
  @IsString() text!: string;
  @IsOptional() @IsArray() categories?: string[];
}
class SentimentDto { @IsString() text!: string; }
class SummarizeDto { @IsString() text!: string; }
class GenerateEmailDto {
  @IsString() tone!: string;
  @IsString() goal!: string;
  @IsOptional() @IsString() recipientName?: string;
  @IsOptional() @IsString() recipientCompany?: string;
}

@ApiTags('ai')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('workspaces/:workspaceId/ai')
export class AiController {
  constructor(private readonly ai: AiService, private readonly workspaces: WorkspaceService) {}

  @Post('classify')
  async classify(@CurrentUser() u: AuthUser, @Param('workspaceId') ws: string, @Body() dto: ClassifyDto) {
    await this.workspaces.assertMember(u.id, ws);
    return this.ai.classify(ws, dto.text, dto.categories ?? ['hot', 'warm', 'cold']);
  }

  @Post('sentiment')
  async sentiment(@CurrentUser() u: AuthUser, @Param('workspaceId') ws: string, @Body() dto: SentimentDto) {
    await this.workspaces.assertMember(u.id, ws);
    return this.ai.sentiment(ws, dto.text);
  }

  @Post('summarize')
  async summarize(@CurrentUser() u: AuthUser, @Param('workspaceId') ws: string, @Body() dto: SummarizeDto) {
    await this.workspaces.assertMember(u.id, ws);
    return this.ai.summarize(ws, dto.text);
  }

  @Post('generate-email')
  async generateEmail(@CurrentUser() u: AuthUser, @Param('workspaceId') ws: string, @Body() dto: GenerateEmailDto) {
    await this.workspaces.assertMember(u.id, ws);
    return this.ai.generateEmail(ws, dto);
  }
}
