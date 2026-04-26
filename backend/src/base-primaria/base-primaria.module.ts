import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DuckDbService } from './duckdb.service';
import { ParquetService } from './parquet.service';
import { BasePrimariaService } from './base-primaria.service';
import { BasePrimariaController } from './base-primaria.controller';

@Module({
  imports: [TypeOrmModule.forFeature([])],
  providers: [DuckDbService, ParquetService, BasePrimariaService],
  controllers: [BasePrimariaController],
  exports: [BasePrimariaService, DuckDbService, ParquetService],
})
export class BasePrimariaModule {}
