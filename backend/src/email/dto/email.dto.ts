import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsEmail, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateTemplateDto {
  @ApiProperty() @IsString() name!: string;
  @ApiProperty() @IsString() subject!: string;
  @ApiProperty() @IsString() bodyMarkdown!: string;
  @ApiProperty({ type: [String], required: false })
  @IsOptional()
  @IsArray()
  variables?: string[];
}

export class UpdateTemplateDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() subject?: string;
  @IsOptional() @IsString() bodyMarkdown?: string;
  @IsOptional() @IsArray() variables?: string[];
}

export class SendEmailDto {
  @ApiProperty() @IsEmail() toEmail!: string;
  @ApiProperty() @IsString() subject!: string;
  @ApiProperty() @IsString() bodyHtml!: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() bodyText?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsUUID() leadId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsUUID() campaignId?: string;
}
