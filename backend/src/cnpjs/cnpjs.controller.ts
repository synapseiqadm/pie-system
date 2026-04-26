import { Controller, Get, Post, Patch, Delete, Body, Param, Query, ParseIntPipe, NotFoundException } from '@nestjs/common';
import { CnpjsService } from './cnpjs.service';

@Controller('cnpjs')
export class CnpjsController {
  constructor(private readonly service: CnpjsService) {}

  @Get()
  findAll(
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('situacao') situacao?: string,
    @Query('tipo') tipo?: string,
    @Query('cnae') cnae?: string,
    @Query('uf') uf?: string,
    @Query('porte') porte?: string,
    @Query('municipio') municipio?: string,
  ) {
    return this.service.findAll(q, Number(page) || 1, Number(limit) || 50, {
      situacao, tipo, cnae, uf, porte, municipio,
    });
  }

  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    const record = await this.service.findOne(id);
    if (!record) throw new NotFoundException();
    return record;
  }

  @Post()
  create(@Body() body: Parameters<CnpjsService['create']>[0]) {
    return this.service.create(body);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: Partial<Parameters<CnpjsService['create']>[0]>,
  ) {
    return this.service.update(id, body);
  }

  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.service.remove(id);
    return { ok: true };
  }
}
