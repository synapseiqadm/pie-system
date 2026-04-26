import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Recorte } from './entities/recorte.entity';
import { RecortesService } from './recortes.service';
import { RecortesController } from './recortes.controller';
import { BasePrimariaModule } from '../base-primaria/base-primaria.module';
import { AiModule } from '../ai/ai.module';
import { CnaesModule } from '../cnaes/cnaes.module';
import { MunicipiosModule } from '../municipios/municipios.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Recorte]),
    BasePrimariaModule,
    AiModule,
    CnaesModule,
    MunicipiosModule,
  ],
  providers: [RecortesService],
  controllers: [RecortesController],
  exports: [RecortesService],
})
export class RecortesModule {}
