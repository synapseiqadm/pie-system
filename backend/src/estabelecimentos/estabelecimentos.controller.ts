import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, ParseIntPipe,
  UseInterceptors, UploadedFile, Res,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { join } from 'path';
import { tmpdir } from 'os';
import type { Response } from 'express';
import { EstabelecimentosService } from './estabelecimentos.service';
import { Estabelecimento } from './entities/estabelecimento.entity';
import { StatsService } from '../stats/stats.service';
import { CancelService } from '../shared/cancel.service';

const diskUpload = diskStorage({
  destination: tmpdir(),
  filename: (_req, file, cb) => {
    const ext = file.originalname.toLowerCase().endsWith('.zip') ? '.zip' : '.csv';
    cb(null, `estab-${Date.now()}${ext}`);
  },
});

@Controller('estabelecimentos')
export class EstabelecimentosController {
  constructor(
    private readonly service: EstabelecimentosService,
    private readonly statsService: StatsService,
    private readonly cancelService: CancelService,
  ) {}

  @Get()
  async findAll(
    @Query('q') q?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '50',
  ) {
    return this.service.findAll(q, parseInt(page), parseInt(limit));
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Post()
  create(@Body() body: Partial<Estabelecimento>) {
    return this.service.create(body);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: Partial<Estabelecimento>) {
    return this.service.update(id, body);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }

  @Post('upload/cancel')
  cancelUpload() {
    this.cancelService.request('estabelecimentos');
    return { ok: true };
  }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file', { storage: diskUpload }))
  async upload(@UploadedFile() file: Express.Multer.File, @Res() res: Response) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const send = (data: object) => res.write(`data: ${JSON.stringify(data)}\n\n`);

    this.cancelService.clear('estabelecimentos');
    try {
      await this.service.importFromFile(
        join(file.destination, file.filename),
        async (progress) => {
          send(progress);
          if (progress.done) {
            await this.statsService.logImport('estabelecimentos', progress.inserted, progress.errors);
          }
        },
        () => this.cancelService.isCancelled('estabelecimentos'),
      );
    } catch (err: any) {
      send({ error: err?.message ?? 'Erro desconhecido', done: true });
    }

    res.end();
  }
}
