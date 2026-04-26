import { Controller, Get, Post, Param, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { EnriquecimentoService } from './enriquecimento.service';

function sse(res: Response, data: object) {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

@Controller('enriquecimento')
export class EnriquecimentoController {
  constructor(private readonly service: EnriquecimentoService) {}

  // ── Telefone ────────────────────────────────────────────────────────────────

  @Post(':recorteId/telefone')
  enriquecerTelefone(@Param('recorteId') id: string) {
    return this.service.statsTelefone(Number(id));
  }

  @Get(':recorteId/telefone')
  browseTelefone(
    @Param('recorteId') id: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.enriquecerTelefone(
      Number(id),
      page ? Number(page) : 1,
      limit ? Number(limit) : 50,
    );
  }

  // ── Site ────────────────────────────────────────────────────────────────────

  // POST /enriquecimento/:recorteId/site — processa com SSE progress
  @Post(':recorteId/site')
  async enrichSite(@Param('recorteId') id: string, @Res() res: Response) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    try {
      const stats = await this.service.enrichSiteBatch(
        Number(id),
        (done, total, found) => {
          sse(res, { stage: 'progresso', done, total, found });
        },
      );
      sse(res, { stage: 'concluido', ...stats });
    } catch (err: any) {
      sse(res, { stage: 'erro', detail: err?.message ?? 'Erro desconhecido' });
    }

    res.end();
  }

  // POST /enriquecimento/:recorteId/site/revalidar — revalida encontrados com IA (SSE)
  @Post(':recorteId/site/revalidar')
  async revalidarSite(@Param('recorteId') id: string, @Res() res: Response) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    try {
      const stats = await this.service.revalidarSites(
        Number(id),
        (done, total, rejeitados) => {
          sse(res, { stage: 'progresso', done, total, rejeitados });
        },
      );
      sse(res, { stage: 'concluido', ...stats });
    } catch (err: any) {
      sse(res, { stage: 'erro', detail: err?.message ?? 'Erro desconhecido' });
    }

    res.end();
  }

  // GET /enriquecimento/:recorteId/site?page=1&limit=50
  @Get(':recorteId/site')
  browseSite(
    @Param('recorteId') id: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.getSiteEnriquecimento(
      Number(id),
      page ? Number(page) : 1,
      limit ? Number(limit) : 50,
    );
  }

  // GET /enriquecimento/:recorteId/site/map — { cnpj → PresencaDigital } para uso na tabela
  @Get(':recorteId/site/map')
  async getSiteMap(@Param('recorteId') id: string) {
    const map = await this.service.getSiteMap(Number(id));
    return Object.fromEntries(map);
  }
}
