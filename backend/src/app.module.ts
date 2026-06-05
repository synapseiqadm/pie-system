import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { LeadsModule } from './leads/leads.module';
import { TenantsModule } from './tenants/tenants.module';
import { OpportunitiesModule } from './opportunities/opportunities.module';
import { CnaesModule } from './cnaes/cnaes.module';
import { EmpresasModule } from './empresas/empresas.module';
import { EstabelecimentosModule } from './estabelecimentos/estabelecimentos.module';
import { MotivosModule } from './motivos/motivos.module';
import { MunicipiosModule } from './municipios/municipios.module';
import { NaturezasModule } from './naturezas/naturezas.module';
import { PaisesModule } from './paises/paises.module';
import { QualificacoesModule } from './qualificacoes/qualificacoes.module';
import { StatsModule } from './stats/stats.module';
import { CnpjsModule } from './cnpjs/cnpjs.module';
import { SharedModule } from './shared/shared.module';
import { BasePrimariaModule } from './base-primaria/base-primaria.module';
import { RecortesModule } from './recortes/recortes.module';
import { ImpactosModule } from './impactos/impactos.module';
import { EnriquecimentoModule } from './enriquecimento/enriquecimento.module';
import { AiModule } from './ai/ai.module';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL ?? 'postgresql://pie:pie@127.0.0.1:5432/pie',
      ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
      schema: 'public',
      autoLoadEntities: true,
      synchronize: true,
    }),
    LeadsModule,
    TenantsModule,
    OpportunitiesModule,
    CnaesModule,
    EmpresasModule,
    EstabelecimentosModule,
    MotivosModule,
    MunicipiosModule,
    NaturezasModule,
    PaisesModule,
    QualificacoesModule,
    StatsModule,
    CnpjsModule,
    SharedModule,
    BasePrimariaModule,
    RecortesModule,
    ImpactosModule,
    EnriquecimentoModule,
    AiModule,
    AuthModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
