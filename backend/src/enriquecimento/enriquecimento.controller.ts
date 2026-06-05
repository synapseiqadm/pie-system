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

  // ── Endereço ────────────────────────────────────────────────────────────────

  // POST /enriquecimento/:recorteId/endereco — processa com SSE progress
  @Post(':recorteId/endereco')
  async enrichEndereco(@Param('recorteId') id: string, @Res() res: Response) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    try {
      const stats = await this.service.enrichAddressBatch(
        Number(id),
        (done, total, verificado, suspeito) => {
          sse(res, { stage: 'progresso', done, total, verificado, suspeito });
        },
      );
      sse(res, { stage: 'concluido', ...stats });
    } catch (err: any) {
      sse(res, { stage: 'erro', detail: err?.message ?? 'Erro desconhecido' });
    }

    res.end();
  }

  // GET /enriquecimento/:recorteId/endereco?page=1&limit=50
  @Get(':recorteId/endereco')
  browseEndereco(
    @Param('recorteId') id: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.getAddressEnriquecimento(
      Number(id),
      page ? Number(page) : 1,
      limit ? Number(limit) : 50,
    );
  }

  // ── Contato PJ ──────────────────────────────────────────────────────────────

  // POST /enriquecimento/:recorteId/contato — processa com SSE progress
  @Post(':recorteId/contato')
  async enrichContato(@Param('recorteId') id: string, @Res() res: Response) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    try {
      const stats = await this.service.enrichContactBatch(
        Number(id),
        (done, total, direct, thirdParty) => {
          sse(res, { stage: 'progresso', done, total, direct, thirdParty });
        },
      );
      sse(res, { stage: 'concluido', ...stats });
    } catch (err: any) {
      sse(res, { stage: 'erro', detail: err?.message ?? 'Erro desconhecido' });
    }

    res.end();
  }

  // GET /enriquecimento/:recorteId/contato?page=1&limit=50
  @Get(':recorteId/contato')
  browseContato(
    @Param('recorteId') id: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.getContactEnriquecimento(
      Number(id),
      page ? Number(page) : 1,
      limit ? Number(limit) : 50,
    );
  }

  // ── Sócio ────────────────────────────────────────────────────────────────────

  // POST /enriquecimento/:recorteId/socio — processa com SSE progress
  @Post(':recorteId/socio')
  async enrichSocio(@Param('recorteId') id: string, @Res() res: Response) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    try {
      const stats = await this.service.enrichSocioBatch(
        Number(id),
        (done, total, comCandidate) => {
          sse(res, { stage: 'progresso', done, total, comCandidate });
        },
      );
      sse(res, { stage: 'concluido', ...stats });
    } catch (err: any) {
      sse(res, { stage: 'erro', detail: err?.message ?? 'Erro desconhecido' });
    }

    res.end();
  }

  // GET /enriquecimento/:recorteId/socio?page=1&limit=50
  @Get(':recorteId/socio')
  browseSocio(
    @Param('recorteId') id: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.getSocioEnriquecimento(
      Number(id),
      page ? Number(page) : 1,
      limit ? Number(limit) : 50,
    );
  }

  // ── Outbound-Ready ──────────────────────────────────────────────────────────

  // POST /enriquecimento/:recorteId/outbound — consolida perfil com SSE progress
  @Post(':recorteId/outbound')
  async enrichOutbound(@Param('recorteId') id: string, @Res() res: Response) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    try {
      const stats = await this.service.enrichOutboundBatch(
        Number(id),
        (done, total) => {
          sse(res, { stage: 'progresso', done, total });
        },
      );
      sse(res, { stage: 'concluido', ...stats });
    } catch (err: any) {
      sse(res, { stage: 'erro', detail: err?.message ?? 'Erro desconhecido' });
    }

    res.end();
  }

  // GET /enriquecimento/:recorteId/outbound?page=1&limit=50&minScore=50&emailScore=alto
  @Get(':recorteId/outbound')
  browseOutbound(
    @Param('recorteId') id: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('minScore') minScore?: string,
    @Query('emailScore') emailScore?: string,
    @Query('whatsappScore') whatsappScore?: string,
    @Query('sdrScore') sdrScore?: string,
  ) {
    return this.service.getOutboundEnriquecimento(
      Number(id),
      page ? Number(page) : 1,
      limit ? Number(limit) : 50,
      minScore ? Number(minScore) : undefined,
      emailScore as any,
      whatsappScore as any,
      sdrScore as any,
    );
  }

  // GET /enriquecimento/:recorteId/outbound/export — JSON completo, exclui DNC
  @Get(':recorteId/outbound/export')
  exportOutbound(@Param('recorteId') id: string) {
    return this.service.exportOutbound(Number(id));
  }
}
