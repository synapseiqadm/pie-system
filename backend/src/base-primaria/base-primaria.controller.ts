import {
  Controller, Get, Post, Delete, Query, Param,
  UseInterceptors, UploadedFile, Res, HttpCode,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as path from 'path';
import * as os from 'os';
import type { Response } from 'express';
import { BasePrimariaService } from './base-primaria.service';
import { ParquetService, TipoBase } from './parquet.service';

const TWO_GB = 2 * 1024 * 1024 * 1024;

const tmpStorage = diskStorage({
  destination: os.tmpdir(),
  filename: (_req, file, cb) => cb(null, `pie_upload_${Date.now()}${path.extname(file.originalname)}`),
});

function sse(res: Response, data: object) {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

@Controller('base-primaria')
export class BasePrimariaController {
  constructor(
    private readonly service: BasePrimariaService,
    private readonly parquet: ParquetService,
  ) {}

  // ─── Status & Análise ────────────────────────────────────────────────────

  @Get('status')
  getStatus() { return this.service.getStatus(); }

  @Get('overview')
  getOverview() { return this.service.overview(); }

  @Get('analise/uf')
  porUf() { return this.service.porUf(); }

  @Get('analise/cnae')
  porCnae(@Query('uf') uf?: string, @Query('limit') limit?: string) {
    return this.service.porCnae(uf, limit ? Number(limit) : 50);
  }

  @Get('analise/municipio')
  porMunicipio(@Query('uf') uf?: string, @Query('limit') limit?: string) {
    return this.service.porMunicipio(uf, limit ? Number(limit) : 50);
  }

  @Get('analise/situacao')
  porSituacao(@Query('uf') uf?: string) {
    return this.service.porSituacao(uf);
  }

  @Get('analise/porte')
  porPorte() { return this.service.porPorte(); }

  @Get('empresas/browse')
  browseEmpresas(
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.browseEmpresas(q, page ? Number(page) : 1, limit ? Number(limit) : 50);
  }

  @Get('socios/check')
  checkSocios(@Query('basicos') basicos: string) {
    const list = (basicos ?? '').split(',').map(b => b.trim()).filter(Boolean);
    return this.service.checkSocios(list);
  }

  @Get('socios/browse')
  browseSocios(
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.browseSocios(q, page ? Number(page) : 1, limit ? Number(limit) : 50);
  }

  // ─── Upload & Conversão ───────────────────────────────────────────────────

  @Post('upload/:tipo')
  @UseInterceptors(FileInterceptor('file', { storage: tmpStorage, limits: { fileSize: TWO_GB } }))
  async uploadZip(
    @Param('tipo') tipo: string,
    @UploadedFile() file: Express.Multer.File,
    @Res() res: Response,
  ) {
    const tipoValido = tipo as TipoBase;
    if (tipoValido !== 'estabelecimentos' && tipoValido !== 'empresas' && tipoValido !== 'socios') {
      res.status(400).json({ error: 'Tipo inválido. Use estabelecimentos, empresas ou socios.' });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const partIndex = this.parquet.nextPartIndex(tipoValido);
    sse(res, { stage: 'iniciando', detail: file.originalname, partIndex });

    try {
      for await (const event of this.parquet.convertZip(file.path, tipoValido, partIndex)) {
        sse(res, event);
      }
    } catch (err: any) {
      const detail = [err?.message, err?.cause?.message].filter(Boolean).join(' — ') || 'Erro desconhecido';
      console.error('[upload] erro:', err);
      sse(res, { stage: 'erro', detail });
    }

    res.end();
  }

  // ─── Gerenciar arquivos ───────────────────────────────────────────────────

  @Delete('arquivo/:tipo/:arquivo')
  @HttpCode(204)
  deleteArquivo(@Param('tipo') tipo: string, @Param('arquivo') arquivo: string) {
    this.parquet.deleteFile(tipo as TipoBase, arquivo);
  }
}
