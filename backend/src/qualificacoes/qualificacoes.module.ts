import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Qualificacao } from './entities/qualificacao.entity';
import { QualificacoesService } from './qualificacoes.service';
import { QualificacoesController } from './qualificacoes.controller';
import { StatsModule } from '../stats/stats.module';

@Module({
  imports: [TypeOrmModule.forFeature([Qualificacao]), StatsModule],
  controllers: [QualificacoesController],
  providers: [QualificacoesService],
  exports: [QualificacoesService],
})
export class QualificacoesModule {}
