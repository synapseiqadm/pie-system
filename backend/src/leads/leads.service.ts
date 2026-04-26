import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Lead, LeadStatus } from './entities/lead.entity';

@Injectable()
export class LeadsService {
  constructor(
    @InjectRepository(Lead)
    private repo: Repository<Lead>,
  ) {}

  findByRecorte(recorteId: number): Promise<Lead[]> {
    return this.repo.find({ where: { recorteId }, order: { atualizadoEm: 'DESC' } });
  }

  async upsert(cnpj: string, recorteId: number, data: { status?: LeadStatus; notas?: string }): Promise<Lead> {
    let lead = await this.repo.findOneBy({ cnpj, recorteId });
    if (!lead) {
      lead = this.repo.create({ cnpj, recorteId, status: 'novo' });
    }
    if (data.status !== undefined) lead.status = data.status;
    if (data.notas !== undefined) lead.notas = data.notas;
    return this.repo.save(lead);
  }

  async removeByCnpj(cnpj: string, recorteId: number): Promise<void> {
    await this.repo.delete({ cnpj, recorteId });
  }

  async bulkUpsert(cnpjs: string[], recorteId: number, data: { status?: LeadStatus; notas?: string }): Promise<number> {
    let count = 0;
    for (const cnpj of cnpjs) {
      await this.upsert(cnpj, recorteId, data);
      count++;
    }
    return count;
  }
}
