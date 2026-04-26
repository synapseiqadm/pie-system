import { IsInt, IsNotEmpty, IsOptional, IsString, IsEnum } from 'class-validator';
import { PipelineStage } from '../entities/opportunity.entity';

export class CreateOpportunityDto {
  @IsInt()
  @IsNotEmpty()
  leadId!: number;

  @IsInt()
  @IsNotEmpty()
  tenantId!: number;

  @IsEnum(PipelineStage)
  @IsOptional()
  stage?: PipelineStage;

  @IsString()
  @IsOptional()
  oferta?: string;

  @IsString()
  @IsOptional()
  canal?: string;

  @IsInt()
  @IsOptional()
  score?: number;
}
