import { ApiProperty } from '@nestjs/swagger';
import { NodeType, WorkflowStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class GraphNodeDto {
  @ApiProperty() @IsString() id!: string;
  @ApiProperty({ enum: NodeType }) @IsEnum(NodeType) type!: NodeType;
  @ApiProperty() @IsObject() config!: Record<string, unknown>;
  @ApiProperty() @IsNumber() positionX!: number;
  @ApiProperty() @IsNumber() positionY!: number;
}

export class GraphEdgeDto {
  @ApiProperty() @IsString() source!: string;
  @ApiProperty() @IsString() target!: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() label?: string;
}

export class WorkflowGraphDto {
  @ApiProperty({ type: [GraphNodeDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GraphNodeDto)
  nodes!: GraphNodeDto[];

  @ApiProperty({ type: [GraphEdgeDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GraphEdgeDto)
  edges!: GraphEdgeDto[];
}

export class CreateWorkflowDto {
  @ApiProperty() @IsString() name!: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() description?: string;
}

export class UpdateWorkflowDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsEnum(WorkflowStatus) status?: WorkflowStatus;
}

export class SaveGraphDto {
  @ApiProperty()
  @ValidateNested()
  @Type(() => WorkflowGraphDto)
  graph!: WorkflowGraphDto;

  /** If true the new version becomes the published version. */
  @ApiProperty({ required: false })
  @IsOptional()
  publish?: boolean;
}

export class RunWorkflowDto {
  @ApiProperty({ required: false })
  @IsOptional()
  input?: Record<string, unknown>;
}
