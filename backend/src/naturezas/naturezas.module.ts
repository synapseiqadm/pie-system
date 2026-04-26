import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Natureza } from './entities/natureza.entity';
import { NaturezasService } from './naturezas.service';
import { NaturezasController } from './naturezas.controller';
import { StatsModule } from '../stats/stats.module';

@Module({
  imports: [TypeOrmModule.forFeature([Natureza]), StatsModule],
  controllers: [NaturezasController],
  providers: [NaturezasService],
  exports: [NaturezasService],
})
export class NaturezasModule {}
