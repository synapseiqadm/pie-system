import { Controller, Get, Query, Post, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import * as unzipper from 'unzipper';
import { MunicipiosService } from './municipios.service';
import { StatsService } from '../stats/stats.service';

@Controller('municipios')
export class MunicipiosController {
  constructor(
    private readonly service: MunicipiosService,
    private readonly statsService: StatsService,
  ) {}

  @Get()
  findAll(
    @Query('q') q?: string,
    @Query('limit') limit?: string,
    @Query('codigos') codigos?: string,
  ) {
    if (codigos) return this.service.findByCodigos(codigos.split(',').map((c) => c.trim()).filter(Boolean));
    return this.service.findAll(q, limit ? Number(limit) : undefined);
  }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async upload(@UploadedFile() file: Express.Multer.File) {
    const buffer = await extractBuffer(file);
    const result = await this.service.importFromCsv(buffer);
    await this.statsService.logImport('municipios', result.inserted, result.errors);
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
