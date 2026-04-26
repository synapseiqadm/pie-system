import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query,
  UploadedFile, UseInterceptors, BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import * as unzipper from 'unzipper';
import { CnaesService } from './cnaes.service';
import { CreateCnaeDto } from './dto/create-cnae.dto';
import { StatsService } from '../stats/stats.service';

async function extractBuffer(file: Express.Multer.File): Promise<Buffer> {
  if (!file.originalname.toLowerCase().endsWith('.zip')) return file.buffer;
  const zip = await unzipper.Open.buffer(file.buffer);
  const entry = zip.files.find((f) => !f.path.startsWith('__MACOSX') && f.type === 'File');
  if (!entry) throw new Error('Nenhum arquivo encontrado no ZIP');
  return entry.buffer();
}

@Controller('cnaes')
export class CnaesController {
  constructor(
    private readonly cnaesService: CnaesService,
    private readonly statsService: StatsService,
  ) {}

  @Post()
  create(@Body() dto: CreateCnaeDto) {
    return this.cnaesService.create(dto);
  }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async upload(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('Nenhum arquivo enviado');
    const buffer = await extractBuffer(file);
    const result = await this.cnaesService.importFromCsv(buffer);
    await this.statsService.logImport('cnaes', result.inserted, result.errors);
    return result;
  }

  @Get()
  findAll(
    @Query('q') q?: string,
    @Query('limit') limit?: string,
    @Query('codigos') codigos?: string,
  ) {
    if (codigos) return this.cnaesService.findByCodigos(codigos.split(',').map((c) => c.trim()).filter(Boolean));
    return this.cnaesService.findAll(q, limit ? Number(limit) : undefined);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.cnaesService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: Partial<CreateCnaeDto>) {
    return this.cnaesService.update(+id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.cnaesService.remove(+id);
  }
}
