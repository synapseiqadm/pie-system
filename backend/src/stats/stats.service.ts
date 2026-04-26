import { Injectable } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ImportLog } from './entities/import-log.entity';

const TABLES: { key: string; label: string; table: string }[] = [
  { key: 'empresas',          label: 'Empresas',            table: 'empresa' },
  { key: 'estabelecimentos',  label: 'Estabelecimentos',    table: 'estabelecimentos' },
  { key: 'cnaes',             label: 'CNAEs',               table: 'cnae' },
  { key: 'naturezas',         label: 'Naturezas Jurídicas', table: 'naturezas_juridicas' },
  { key: 'municipios',        label: 'Municípios',          table: 'municipios' },
  { key: 'motivos',           label: 'Motivos',             table: 'motivos' },
  { key: 'paises',            label: 'Países',              table: 'paises' },
  { key: 'qualificacoes',     label: 'Qualificações',       table: 'qualificacoes' },
];

@Injectable()
export class StatsService {
  constructor(
    @InjectRepository(ImportLog)
    private readonly logRepo: Repository<ImportLog>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async logImport(entidade: string, registros: number, erros = 0): Promise<void> {
    await this.logRepo.save({ entidade, registros, erros });
  }

  async getStats() {
    const counts = await Promise.all(
      TABLES.map(async ({ key, label, table }) => {
        try {
          const [{ count }] = await this.dataSource.query(
            `SELECT COUNT(*)::int AS count FROM "${table}"`,
          );
          return { key, label, count: Number(count) };
        } catch {
          return { key, label, count: 0 };
        }
      }),
    );

    const logs = await this.logRepo
      .createQueryBuilder('l')
      .distinctOn(['l.entidade'])
      .orderBy('l.entidade')
      .addOrderBy('l.importado_em', 'DESC')
      .getMany();

    const lastImport: Record<string, { registros: number; erros: number; importadoEm: Date }> = {};
    for (const log of logs) {
      lastImport[log.entidade] = {
        registros: log.registros,
        erros: log.erros ?? 0,
        importadoEm: log.importadoEm,
      };
    }

    return counts.map((c) => ({ ...c, lastImport: lastImport[c.key] ?? null }));
  }
}
