import { ApiProperty } from '@nestjs/swagger';
import { LeadStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';

export class CreateLeadDto {
  @ApiProperty() @IsUUID() workspaceId!: string;
  @ApiProperty() @IsEmail() email!: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() fullName?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() company?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() source?: string;
  @ApiProperty({ required: false }) @IsOptional() metadata?: Record<string, unknown>;
}

export class UpdateLeadDto {
  @IsOptional() @IsString() fullName?: string;
  @IsOptional() @IsString() company?: string;
  @IsOptional() @IsEnum(LeadStatus) status?: LeadStatus;
  @IsOptional() metadata?: Record<string, unknown>;
}

export class ImportLeadsDto {
  @ApiProperty() @IsUUID() workspaceId!: string;
  @ApiProperty({ type: [CreateLeadDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateLeadDto)
  leads!: CreateLeadDto[];

  /** Optional workflow to trigger for each new lead (e.g. AI classify + email). */
  @ApiProperty({ required: false }) @IsOptional() @IsUUID() triggerWorkflowId?: string;
}
