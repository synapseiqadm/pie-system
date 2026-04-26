import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Cnae } from './entities/cnae.entity';
import { CnaesService } from './cnaes.service';
import { CnaesController } from './cnaes.controller';
import { StatsModule } from '../stats/stats.module';

@Module({
  imports: [TypeOrmModule.forFeature([Cnae]), StatsModule],
  controllers: [CnaesController],
  providers: [CnaesService],
  exports: [CnaesService],
})
export class CnaesModule {}
