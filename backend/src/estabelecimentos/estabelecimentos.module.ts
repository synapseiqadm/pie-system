import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Estabelecimento } from './entities/estabelecimento.entity';
import { EstabelecimentosService } from './estabelecimentos.service';
import { EstabelecimentosController } from './estabelecimentos.controller';
import { StatsModule } from '../stats/stats.module';

@Module({
  imports: [TypeOrmModule.forFeature([Estabelecimento]), StatsModule],
  controllers: [EstabelecimentosController],
  providers: [EstabelecimentosService],
  exports: [EstabelecimentosService],
})
export class EstabelecimentosModule {}
