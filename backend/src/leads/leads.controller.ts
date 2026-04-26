import { Controller, Get, Post, Patch, Delete, Body, Param, ParseIntPipe } from '@nestjs/common';
import { LeadsService } from './leads.service';
import { LeadStatus } from './entities/lead.entity';

@Controller('leads')
export class LeadsController {
  constructor(private readonly svc: LeadsService) {}

  // GET /leads/recorte/:recorteId
  @Get('recorte/:recorteId')
  findByRecorte(@Param('recorteId', ParseIntPipe) recorteId: number) {
    return this.svc.findByRecorte(recorteId);
  }

  // POST /leads/recorte/:recorteId/upsert  { cnpj, status?, notas? }
  @Post('recorte/:recorteId/upsert')
  upsert(
    @Param('recorteId', ParseIntPipe) recorteId: number,
    @Body() body: { cnpj: string; status?: LeadStatus; notas?: string },
  ) {
    return this.svc.upsert(body.cnpj, recorteId, { status: body.status, notas: body.notas });
  }

  // PATCH /leads/recorte/:recorteId/:cnpj  { status?, notas? }
  @Patch('recorte/:recorteId/:cnpj')
  update(
    @Param('recorteId', ParseIntPipe) recorteId: number,
    @Param('cnpj') cnpj: string,
    @Body() body: { status?: LeadStatus; notas?: string },
  ) {
    return this.svc.upsert(cnpj, recorteId, body);
  }

  // DELETE /leads/recorte/:recorteId/:cnpj
  @Delete('recorte/:recorteId/:cnpj')
  remove(
    @Param('recorteId', ParseIntPipe) recorteId: number,
    @Param('cnpj') cnpj: string,
  ) {
    return this.svc.removeByCnpj(cnpj, recorteId);
  }

  // POST /leads/recorte/:recorteId/bulk  { cnpjs: string[], status?, notas? }
  @Post('recorte/:recorteId/bulk')
  bulk(
    @Param('recorteId', ParseIntPipe) recorteId: number,
    @Body() body: { cnpjs: string[]; status?: LeadStatus; notas?: string },
  ) {
    return this.svc.bulkUpsert(body.cnpjs, recorteId, { status: body.status, notas: body.notas });
  }
}
