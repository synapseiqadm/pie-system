import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ImpactosService, StressNivel } from './impactos.service';

@Controller('impactos')
export class ImpactosController {
  constructor(private readonly service: ImpactosService) {}

  // POST /impactos — registra impacto único
  @Post()
  registrar(@Body() body: {
    cnpj: string;
    canal: string;
    campanhaNome?: string;
    recorteNome?: string;
    recorteId?: number;
  }) {
    return this.service.registrar(body);
  }

  // POST /impactos/lote — registra impactos em massa
  @Post('lote')
  registrarLote(@Body() body: {
    cnpjs: string[];
    canal: string;
    campanhaNome?: string;
    recorteNome?: string;
    recorteId?: number;
  }) {
    return this.service.registrarLote(body.cnpjs, body.canal, body.campanhaNome, body.recorteNome, body.recorteId);
  }

  // GET /impactos/stress/:cnpj — stress de um CNPJ específico
  @Get('stress/:cnpj')
  stressCnpj(@Param('cnpj') cnpj: string) {
    return this.service.stressCnpj(cnpj);
  }

  // POST /impactos/distribuicao — distribuição de stress de uma lista de CNPJs
  @Post('distribuicao')
  distribuicao(@Body() body: { cnpjs: string[] }) {
    return this.service.distribuicaoStress(body.cnpjs);
  }

  // POST /impactos/filtrar — retorna CNPJs abaixo do nível de stress informado
  @Post('filtrar')
  filtrar(@Body() body: { cnpjs: string[]; nivelMaximo: StressNivel }) {
    return this.service.filtrarPorStress(body.cnpjs, body.nivelMaximo);
  }

  // GET /impactos/historico/:recorteId
  @Get('historico/:recorteId')
  historico(@Param('recorteId') recorteId: string) {
    return this.service.historicoPorRecorte(Number(recorteId));
  }
}
