import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query,
  UploadedFile, UseInterceptors, BadRequestException, Res,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { tmpdir } from 'os';
import { join } from 'path';
import type { Response } from 'express';
import { EmpresasService } from './empresas.service';
import { CreateEmpresaDto } from './dto/create-empresa.dto';
import { StatsService } from '../stats/stats.service';
import { CancelService } from '../shared/cancel.service';

const diskUpload = diskStorage({
  destination: tmpdir(),
  filename: (_req, file, cb) => {
    const ext = file.originalname.toLowerCase().endsWith('.zip') ? '.zip' : '.csv';
    cb(null, `empresa-${Date.now()}${ext}`);
  },
});

@Controller('empresas')
export class EmpresasController {
  constructor(
    private readonly empresasService: EmpresasService,
    private readonly statsService: StatsService,
    private readonly cancelService: CancelService,
  ) {}

  @Post()
  create(@Body() dto: CreateEmpresaDto) {
    return this.empresasService.create(dto);
  }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file', { storage: diskUpload }))
  async upload(@UploadedFile() file: Express.Multer.File, @Res() res: Response) {
    if (!file) throw new BadRequestException('Nenhum arquivo enviado');

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const send = (data: object) => res.write(`data: ${JSON.stringify(data)}\n\n`);

    this.cancelService.clear('empresas');
    try {
      await this.empresasService.importFromFile(
        join(file.destination, file.filename),
        async (progress) => {
          send(progress);
          if (progress.done) {
            await this.statsService.logImport('empresas', progress.inserted, progress.errors);
          }
        },
        () => this.cancelService.isCancelled('empresas'),
      );
    } catch (err: any) {
      send({ error: err?.message ?? 'Erro desconhecido', done: true });
    }

    res.end();
  }

  @Post('upload/cancel')
  cancelUpload() {
    this.cancelService.request('empresas');
    return { ok: true };
  }

  @Get()
  findAll(
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.empresasService.findAll(q, Number(page) || 1, Number(limit) || 50);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.empresasService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: Partial<CreateEmpresaDto>) {
    return this.empresasService.update(+id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.empresasService.remove(+id);
  }
}
