import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Motivo } from './entities/motivo.entity';
import { MotivosService } from './motivos.service';
import { MotivosController } from './motivos.controller';
import { StatsModule } from '../stats/stats.module';

@Module({
  imports: [TypeOrmModule.forFeature([Motivo]), StatsModule],
  controllers: [MotivosController],
  providers: [MotivosService],
  exports: [MotivosService],
})
export class MotivosModule {}
