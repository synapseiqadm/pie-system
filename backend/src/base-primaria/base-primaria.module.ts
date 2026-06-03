import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BigQueryService } from './bigquery.service';
import { BigQueryUploadService } from './bigquery-upload.service';
import { BasePrimariaService } from './base-primaria.service';
import { BasePrimariaController } from './base-primaria.controller';

@Module({
  imports: [TypeOrmModule.forFeature([])],
  providers: [BigQueryService, BigQueryUploadService, BasePrimariaService],
  controllers: [BasePrimariaController],
  exports: [BasePrimariaService, BigQueryService, BigQueryUploadService],
})
export class BasePrimariaModule {}
