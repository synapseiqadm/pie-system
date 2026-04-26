import { Controller, Get, Query, Post, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import * as unzipper from 'unzipper';
import { PaisesService } from './paises.service';
import { StatsService } from '../stats/stats.service';

@Controller('paises')
export class PaisesController {
  constructor(
    private readonly service: PaisesService,
    private readonly statsService: StatsService,
  ) {}

  @Get()
  findAll(@Query('q') q?: string) {
    return this.service.findAll(q);
  }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async upload(@UploadedFile() file: Express.Multer.File) {
    const buffer = await extractBuffer(file);
    const result = await this.service.importFromCsv(buffer);
    await this.statsService.logImport('paises', result.inserted, result.errors);
    return result;
  }
}

async function extractBuffer(file: Express.Multer.File): Promise<Buffer> {
  if (!file.originalname.toLowerCase().endsWith('.zip')) return file.buffer;
  const zip = await unzipper.Open.buffer(file.buffer);
  const entry = zip.files.find((f) => !f.path.startsWith('__MACOSX') && f.type === 'File');
  if (!entry) throw new Error('Nenhum arquivo encontrado no ZIP');
  return entry.buffer();
}
