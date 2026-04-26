import { IsOptional, IsString, IsEnum, IsInt } from 'class-validator';
import { PipelineStage } from '../entities/opportunity.entity';

export class UpdateOpportunityDto {
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

  @IsString()
  @IsOptional()
  motivoPerda?: string;
}
