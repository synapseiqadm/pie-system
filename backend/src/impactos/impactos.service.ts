import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual } from 'typeorm';
import { ImpactoLead } from './entities/impacto-lead.entity';

export type StressNivel = 'descansado' | 'baixo' | 'moderado' | 'alto' | 'critico';

export type StressInfo = {
  cnpj: string;
  total7d: number;
  total30d: number;
  total90d: number;
  ultimoImpacto?: Date;
  nivel: StressNivel;
};

function calcularNivel(total7d: number): StressNivel {
  if (total7d === 0) return 'descansado';
  if (total7d === 1) return 'baixo';
  if (total7d <= 3) return 'moderado';
  if (total7d <= 6) return 'alto';
  return 'critico';
}

const DIAS_ATRAS = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
};

@Injectable()
export class ImpactosService {
  constructor(
    @InjectRepository(ImpactoLead)
    private readonly repo: Repository<ImpactoLead>,
  ) {}

  // ─── Registrar impacto ────────────────────────────────────────────────────

  registrar(dto: {
    cnpj: string;
    canal: string;
    campanhaNome?: string;
    recorteNome?: string;
    recorteId?: number;
  }) {
    return this.repo.save(this.repo.create(dto));
  }

  async registrarLote(cnpjs: string[], canal: string, campanhaNome?: string, recorteNome?: string, recorteId?: number) {
    const entities = cnpjs.map((cnpj) =>
      this.repo.create({ cnpj, canal, campanhaNome, recorteNome, recorteId }),
    );
    return this.repo.save(entities, { chunk: 500 });
  }

  // ─── Stress por CNPJ ──────────────────────────────────────────────────────

  async stressCnpj(cnpj: string): Promise<StressInfo> {
    const [t7, t30, t90, ultimo] = await Promise.all([
      this.repo.count({ where: { cnpj, impactadoEm: MoreThanOrEqual(DIAS_ATRAS(7))  } }),
      this.repo.count({ where: { cnpj, impactadoEm: MoreThanOrEqual(DIAS_ATRAS(30)) } }),
      this.repo.count({ where: { cnpj, impactadoEm: MoreThanOrEqual(DIAS_ATRAS(90)) } }),
      this.repo.findOne({ where: { cnpj }, order: { impactadoEm: 'DESC' } }),
    ]);
    return {
      cnpj,
      total7d: t7, total30d: t30, total90d: t90,
      ultimoImpacto: ultimo?.impactadoEm,
      nivel: calcularNivel(t7),
    };
  }

  // ─── Distribuição de stress de uma lista de CNPJs ────────────────────────

  async distribuicaoStress(cnpjs: string[]): Promise<{
    distribuicao: Record<StressNivel, number>;
    total: number;
    livres: number; // descansado + baixo
  }> {
    if (cnpjs.length === 0) return {
      distribuicao: { descansado: 0, baixo: 0, moderado: 0, alto: 0, critico: 0 },
      total: 0, livres: 0,
    };

    const desde7d = DIAS_ATRAS(7);

    // Conta impactos nos últimos 7 dias para cada CNPJ da lista
    const rows: { cnpj: string; cnt: string }[] = await this.repo
      .createQueryBuilder('i')
      .select('i.cnpj', 'cnpj')
      .addSelect('COUNT(*)', 'cnt')
      .where('i.cnpj IN (:...cnpjs)', { cnpjs })
      .andWhere('i.impactado_em >= :desde', { desde: desde7d })
      .groupBy('i.cnpj')
      .getRawMany();

    const countMap = new Map(rows.map((r) => [r.cnpj, Number(r.cnt)]));

    const dist: Record<StressNivel, number> = { descansado: 0, baixo: 0, moderado: 0, alto: 0, critico: 0 };
    for (const cnpj of cnpjs) {
      dist[calcularNivel(countMap.get(cnpj) ?? 0)]++;
    }
    // CNPJs não encontrados na tabela = descansado
    const semRegistro = cnpjs.length - rows.length;
    dist.descansado += semRegistro;

    return {
      distribuicao: dist,
      total: cnpjs.length,
      livres: dist.descansado + dist.baixo,
    };
  }

  // ─── Filtrar CNPJs abaixo de um nível de stress ──────────────────────────

  async filtrarPorStress(cnpjs: string[], nivelMaximo: StressNivel): Promise<string[]> {
    const ORDEM: StressNivel[] = ['descansado', 'baixo', 'moderado', 'alto', 'critico'];
    const maxIdx = ORDEM.indexOf(nivelMaximo);

    const desde7d = DIAS_ATRAS(7);
    const rows: { cnpj: string; cnt: string }[] = await this.repo
      .createQueryBuilder('i')
      .select('i.cnpj', 'cnpj')
      .addSelect('COUNT(*)', 'cnt')
      .where('i.cnpj IN (:...cnpjs)', { cnpjs })
      .andWhere('i.impactado_em >= :desde', { desde: desde7d })
      .groupBy('i.cnpj')
      .getRawMany();

    const countMap = new Map(rows.map((r) => [r.cnpj, Number(r.cnt)]));
    return cnpjs.filter((cnpj) => {
      const nivel = calcularNivel(countMap.get(cnpj) ?? 0);
      return ORDEM.indexOf(nivel) <= maxIdx;
    });
  }

  // ─── Histórico por recorte ────────────────────────────────────────────────

  historicoPorRecorte(recorteId: number) {
    return this.repo.find({
      where: { recorteId },
      order: { impactadoEm: 'DESC' },
      take: 200,
    });
  }
}
