import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as iconv from 'iconv-lite';
import { Cnae } from './entities/cnae.entity';
import { CreateCnaeDto } from './dto/create-cnae.dto';

@Injectable()
export class CnaesService {
  constructor(
    @InjectRepository(Cnae)
    private repo: Repository<Cnae>,
  ) {}

  create(dto: CreateCnaeDto) {
    return this.repo.save(dto);
  }

  findAll(search?: string, limit?: number) {
    if (search) {
      return this.repo
        .createQueryBuilder('c')
        .where('c.codigo ILIKE :contains OR c.descricao ILIKE :contains', { contains: `%${search}%` })
        .orderBy(`CASE
          WHEN c.descricao ILIKE :exact  THEN 0
          WHEN c.descricao ILIKE :starts THEN 1
          WHEN c.codigo    ILIKE :exact  THEN 2
          ELSE 3 END`, 'ASC')
        .addOrderBy('c.descricao', 'ASC')
        .setParameter('exact',  search)
        .setParameter('starts', `${search}%`)
        .take(limit ?? 10)
        .getMany();
    }
    return this.repo.find({ order: { codigo: 'ASC' }, take: limit });
  }

  findByCodigos(codigos: string[]) {
    if (!codigos.length) return Promise.resolve([]);
    return this.repo
      .createQueryBuilder('c')
      .where('c.codigo IN (:...codigos)', { codigos })
      .getMany();
  }

  findOne(id: number) {
    return this.repo.findOneBy({ id });
  }

  async update(id: number, dto: Partial<CreateCnaeDto>) {
    await this.repo.update(id, dto);
    return this.repo.findOneBy({ id });
  }

  remove(id: number) {
    return this.repo.delete(id);
  }

  async importFromCsv(buffer: Buffer): Promise<{ inserted: number; updated: number; errors: number }> {
    const content = iconv.decode(buffer, 'win1252');
    const lines = content.split('\n');
    let inserted = 0;
    let updated = 0;
    let errors = 0;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      try {
        const parts = trimmed.split(';');
        if (parts.length < 2) continue;

        const codigo = parts[0].replace(/"/g, '').trim();
        const descricao = parts.slice(1).join(';').replace(/"/g, '').trim();

        if (!/^\d{7}$/.test(codigo) || !descricao) continue;

        const existing = await this.repo.findOneBy({ codigo });
        if (existing) {
          await this.repo.update(existing.id, { descricao });
          updated++;
        } else {
          await this.repo.save({ codigo, descricao });
          inserted++;
        }
      } catch { errors++; }
    }

    return { inserted, updated, errors };
  }
}
