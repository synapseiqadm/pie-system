import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import * as iconv from 'iconv-lite';
import { Qualificacao } from './entities/qualificacao.entity';

@Injectable()
export class QualificacoesService {
  constructor(@InjectRepository(Qualificacao) private readonly repo: Repository<Qualificacao>) {}

  findAll(q?: string) {
    if (!q) return this.repo.find({ order: { codigo: 'ASC' } });
    return this.repo.find({
      where: [{ codigo: ILike(`%${q}%`) }, { descricao: ILike(`%${q}%`) }],
      order: { codigo: 'ASC' },
    });
  }

  async importFromCsv(buffer: Buffer) {
    const text = iconv.decode(buffer, 'win1252');
    const lines = text.split('\n').filter((l) => l.trim().length > 0);
    let inserted = 0, errors = 0;
    for (const line of lines) {
      try {
        const [raw0, raw1] = line.split(';');
        const codigo = raw0?.trim().replace(/^"|"$/g, '');
        const descricao = raw1?.trim().replace(/^"|"$/g, '');
        if (!codigo || !descricao) continue;
        await this.repo.upsert({ codigo, descricao }, ['codigo']);
        inserted++;
      } catch { errors++; }
    }
    return { inserted, errors };
  }
}
