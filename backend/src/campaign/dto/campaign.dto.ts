import { ApiProperty } from '@nestjs/swagger';
import { CampaignStatus } from '@prisma/client';
import { IsArray, IsDateString, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateCampaignDto {
  @ApiProperty() @IsString() name!: string;
  @ApiProperty({ required: false }) @IsOptional() @IsUUID() workflowId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsUUID() templateId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsDateString() scheduledAt?: string;
}

export class UpdateCampaignDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsEnum(CampaignStatus) status?: CampaignStatus;
  @IsOptional() @IsDateString() scheduledAt?: string;
  @IsOptional() @IsUUID() workflowId?: string;
  @IsOptional() @IsUUID() templateId?: string;
}

export class LaunchCampaignDto {
  @ApiProperty({ type: [String] }) @IsArray() @IsUUID('all', { each: true }) leadIds!: string[];
}
