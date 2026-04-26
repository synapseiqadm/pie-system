import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ImpactoLead } from './entities/impacto-lead.entity';
import { ImpactosService } from './impactos.service';
import { ImpactosController } from './impactos.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ImpactoLead])],
  providers: [ImpactosService],
  controllers: [ImpactosController],
  exports: [ImpactosService],
})
export class ImpactosModule {}
