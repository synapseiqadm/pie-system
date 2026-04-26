import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Opportunity } from './entities/opportunity.entity';
import { CreateOpportunityDto } from './dto/create-opportunity.dto';
import { UpdateOpportunityDto } from './dto/update-opportunity.dto';

@Injectable()
export class OpportunitiesService {
  constructor(
    @InjectRepository(Opportunity)
    private repo: Repository<Opportunity>,
  ) {}

  create(dto: CreateOpportunityDto) {
    const opportunity = this.repo.create({
      lead: { id: dto.leadId },
      tenant: { id: dto.tenantId },
      stage: dto.stage,
      oferta: dto.oferta,
      canal: dto.canal,
      score: dto.score,
    });
    return this.repo.save(opportunity);
  }

  findAll() {
    return this.repo.find();
  }

  findByTenant(tenantId: number) {
    return this.repo.find({ where: { tenant: { id: tenantId } } });
  }

  findOne(id: number) {
    return this.repo.findOneBy({ id });
  }

  async update(id: number, dto: UpdateOpportunityDto) {
    const opportunity = await this.repo.findOneBy({ id });
    if (!opportunity) throw new NotFoundException('Oportunidade não encontrada');
    Object.assign(opportunity, dto);
    return this.repo.save(opportunity);
  }

  remove(id: number) {
    return this.repo.delete(id);
  }
}
