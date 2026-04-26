import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EnriquecimentoService } from './enriquecimento.service';
import { EnriquecimentoController } from './enriquecimento.controller';
import { SiteEnriquecimento } from './entities/site-enriquecimento.entity';
import { CnpjSiteCache } from './entities/cnpj-site-cache.entity';
import { RecortesModule } from '../recortes/recortes.module';
import { BasePrimariaModule } from '../base-primaria/base-primaria.module';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([SiteEnriquecimento, CnpjSiteCache]),
    RecortesModule,
    BasePrimariaModule,
    AiModule,
  ],
  providers: [EnriquecimentoService],
  controllers: [EnriquecimentoController],
  exports: [EnriquecimentoService],
})
export class EnriquecimentoModule {}
