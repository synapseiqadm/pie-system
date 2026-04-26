import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as iconv from 'iconv-lite';
import { Municipio } from './entities/municipio.entity';

const BATCH_SIZE = 500;

@Injectable()
export class MunicipiosService {
  constructor(@InjectRepository(Municipio) private readonly repo: Repository<Municipio>) {}

  findAll(q?: string, limit?: number) {
    if (!q) return this.repo.find({ order: { codigo: 'ASC' }, take: limit });
    // Order by relevance: exact match → starts-with → contains
    return this.repo
      .createQueryBuilder('m')
      .where('m.codigo ILIKE :contains OR m.descricao ILIKE :contains', { contains: `%${q}%` })
      .orderBy(`CASE
        WHEN m.descricao ILIKE :exact   THEN 0
        WHEN m.descricao ILIKE :starts  THEN 1
        WHEN m.codigo    ILIKE :exact   THEN 2
        ELSE 3 END`, 'ASC')
      .addOrderBy('m.descricao', 'ASC')
      .setParameter('exact',  q)
      .setParameter('starts', `${q}%`)
      .take(limit ?? 10)
      .getMany();
  }

  findByCodigos(codigos: string[]) {
    if (!codigos.length) return Promise.resolve([]);
    return this.repo
      .createQueryBuilder('m')
      .where('m.codigo IN (:...codigos)', { codigos })
      .getMany();
  }

  async importFromCsv(buffer: Buffer) {
    const text = iconv.decode(buffer, 'win1252');
    const lines = text.split('\n').filter((l) => l.trim().length > 0);
    let inserted = 0, errors = 0;
    const batch: { codigo: string; descricao: string }[] = [];

    const flush = async () => {
      if (!batch.length) return;
      try {
        await this.repo.upsert(batch, ['codigo']);
        inserted += batch.length;
      } catch { errors += batch.length; }
      batch.length = 0;
    };

    for (const line of lines) {
      try {
        const [raw0, raw1] = line.split(';');
        const codigo = raw0?.trim().replace(/^"|"$/g, '');
        const descricao = raw1?.trim().replace(/^"|"$/g, '');
        if (!codigo || !descricao) continue;
        batch.push({ codigo, descricao });
        if (batch.length >= BATCH_SIZE) await flush();
      } catch { errors++; }
    }
    await flush();
    return { inserted, errors };
  }
}
