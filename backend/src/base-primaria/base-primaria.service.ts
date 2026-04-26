import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { DuckDbService } from './duckdb.service';
import { ParquetService } from './parquet.service';

const SITUACAO: Record<string, string> = {
  '01': 'Nula', '02': 'Ativa', '03': 'Suspensa', '04': 'Inapta', '08': 'Baixada',
};

const PORTE: Record<string, string> = {
  '00': 'Não informado', '01': 'ME', '03': 'EPP', '05': 'Demais', '10': 'Grande',
};

@Injectable()
export class BasePrimariaService {
  private readonly logger = new Logger(BasePrimariaService.name);

  constructor(
    private readonly duck: DuckDbService,
    private readonly parquet: ParquetService,
    @InjectDataSource() private readonly pg: DataSource,
  ) {}

  private async safeQuery<T>(sql: string): Promise<T[]> {
    try {
      return await this.duck.query<T>(sql);
    } catch (err: any) {
      this.logger.warn(`DuckDB query failed: ${err?.message}`);
      return [];
    }
  }

  // ─── Status ──────────────────────────────────────────────────────────────

  async getStatus() {
    const estabFiles = this.parquet.listFiles('estabelecimentos');
    const empFiles   = this.parquet.listFiles('empresas');
    const sociosFiles = this.parquet.listFiles('socios');

    const countParquet = async (tipo: 'estabelecimentos' | 'empresas' | 'socios') => {
      if (!this.parquet.hasFiles(tipo)) return 0;
      const glob = this.parquet.globPath(tipo);
      const rows = await this.safeQuery<{ total: number }>(
        `SELECT COUNT(*) AS total FROM read_parquet('${glob}')`,
      );
      return rows.length > 0 ? Number(rows[0].total) : 0;
    };

    const [totalEstab, totalEmp, totalSocios] = await Promise.all([
      countParquet('estabelecimentos'),
      countParquet('empresas'),
      countParquet('socios'),
    ]);

    return {
      estabelecimentos: { arquivos: estabFiles, total: totalEstab },
      empresas: { arquivos: empFiles, total: totalEmp },
      socios: { arquivos: sociosFiles, total: totalSocios },
    };
  }

  // ─── Análise por UF ───────────────────────────────────────────────────────

  async porUf() {
    if (!this.parquet.hasFiles('estabelecimentos')) return [];
    const glob = this.parquet.globPath('estabelecimentos');
    return this.safeQuery<{ uf: string; total: number; ativos: number }>(`
      SELECT
        COALESCE(NULLIF(TRIM(uf), ''), '??') AS uf,
        COUNT(*)::int AS total,
        SUM(CASE WHEN situacao_cadastral = '02' THEN 1 ELSE 0 END)::int AS ativos
      FROM read_parquet('${glob}')
      GROUP BY uf
      ORDER BY total DESC
    `);
  }

  // ─── Análise por CNAE ─────────────────────────────────────────────────────

  async porCnae(uf?: string, limit = 50) {
    if (!this.parquet.hasFiles('estabelecimentos')) return [];
    const glob = this.parquet.globPath('estabelecimentos');
    const where = uf ? `WHERE TRIM(uf) = '${uf.toUpperCase()}' AND situacao_cadastral = '02'`
                     : `WHERE situacao_cadastral = '02'`;
    const rows = await this.safeQuery<{ cnae: string; total: number }>(`
      SELECT
        TRIM(cnae_fiscal_principal) AS cnae,
        COUNT(*)::int AS total
      FROM read_parquet('${glob}')
      ${where}
        AND cnae_fiscal_principal IS NOT NULL
        AND TRIM(cnae_fiscal_principal) != ''
      GROUP BY cnae
      ORDER BY total DESC
      LIMIT ${limit}
    `);
    if (rows.length === 0) return rows;
    const codigos = rows.map((r) => r.cnae);
    const inList = codigos.map((c) => `'${c.replace(/'/g, "''")}'`).join(',');
    const desc: { codigo: string; descricao: string }[] = await this.pg.query(
      `SELECT codigo, descricao FROM cnae WHERE codigo IN (${inList})`,
    ).catch((err) => { this.logger.error(`cnae lookup failed: ${err?.message}`); return []; });
    const map = new Map(desc.map((d) => [d.codigo, d.descricao]));
    return rows.map((r) => ({ ...r, descricao: map.get(r.cnae) ?? r.cnae }));
  }

  // ─── Análise por Município ────────────────────────────────────────────────

  async porMunicipio(uf?: string, limit = 50) {
    if (!this.parquet.hasFiles('estabelecimentos')) return [];
    const glob = this.parquet.globPath('estabelecimentos');
    const where = uf
      ? `WHERE TRIM(uf) = '${uf.toUpperCase()}' AND situacao_cadastral = '02'`
      : `WHERE situacao_cadastral = '02'`;
    const rows = await this.safeQuery<{ codigo_municipio: string; uf: string; total: number }>(`
      SELECT
        TRIM(codigo_municipio) AS codigo_municipio,
        TRIM(uf) AS uf,
        COUNT(*)::int AS total
      FROM read_parquet('${glob}')
      ${where}
        AND codigo_municipio IS NOT NULL
        AND TRIM(codigo_municipio) != ''
      GROUP BY codigo_municipio, uf
      ORDER BY total DESC
      LIMIT ${limit}
    `);
    if (rows.length === 0) return rows;
    const codigos = rows.map((r) => r.codigo_municipio);
    const inList = codigos.map((c) => `'${c.replace(/'/g, "''")}'`).join(',');
    const desc: { codigo: string; descricao: string }[] = await this.pg.query(
      `SELECT codigo, descricao FROM municipios WHERE codigo IN (${inList})`,
    ).catch((err) => { this.logger.error(`municipios lookup failed: ${err?.message}`); return []; });
    const map = new Map(desc.map((d) => [d.codigo, d.descricao]));
    return rows.map((r) => ({ ...r, descricao: map.get(r.codigo_municipio) ?? r.codigo_municipio }));
  }

  // ─── Análise por Situação ─────────────────────────────────────────────────

  async porSituacao(uf?: string) {
    if (!this.parquet.hasFiles('estabelecimentos')) return [];
    const glob = this.parquet.globPath('estabelecimentos');
    const where = uf ? `WHERE TRIM(uf) = '${uf.toUpperCase()}'` : '';
    const rows = await this.safeQuery<{ situacao: string; total: number }>(`
      SELECT
        COALESCE(NULLIF(TRIM(situacao_cadastral), ''), '??') AS situacao,
        COUNT(*)::int AS total
      FROM read_parquet('${glob}')
      ${where}
      GROUP BY situacao
      ORDER BY total DESC
    `);
    return rows.map((r) => ({ ...r, label: SITUACAO[r.situacao] ?? r.situacao }));
  }

  // ─── Análise por Porte ────────────────────────────────────────────────────

  async porPorte() {
    if (!this.parquet.hasFiles('empresas')) return [];
    const glob = this.parquet.globPath('empresas');
    const rows = await this.safeQuery<{ porte: string; total: number }>(`
      SELECT
        COALESCE(NULLIF(TRIM(porte), ''), '??') AS porte,
        COUNT(*)::int AS total
      FROM read_parquet('${glob}')
      GROUP BY porte
      ORDER BY total DESC
    `);
    return rows.map((r) => ({ ...r, label: PORTE[r.porte] ?? r.porte }));
  }

  // ─── Browse Empresas (paginado, com busca) ───────────────────────────────

  async browseEmpresas(search?: string, page = 1, limit = 50) {
    if (!this.parquet.hasFiles('empresas')) return { data: [], total: 0 };
    const glob = this.parquet.globPath('empresas');
    const offset = (page - 1) * limit;
    const where = search
      ? `WHERE cnpj_basico ILIKE '%${search.replace(/'/g, "''")}%'
            OR razao_social ILIKE '%${search.replace(/'/g, "''")}%'`
      : '';
    const [countRow, rows] = await Promise.all([
      this.safeQuery<{ total: number }>(`SELECT COUNT(*)::int AS total FROM read_parquet('${glob}') ${where}`),
      this.safeQuery<{ cnpj_basico: string; razao_social: string; natureza_juridica: string; capital_social: string; porte: string }>(`
        SELECT cnpj_basico, razao_social, natureza_juridica, capital_social, porte
        FROM read_parquet('${glob}')
        ${where}
        ORDER BY cnpj_basico
        LIMIT ${limit} OFFSET ${offset}
      `),
    ]);
    const total = countRow[0]?.total ?? 0;
    const data = rows.map((r) => ({
      ...r,
      porteLabel: PORTE[r.porte?.trim()] ?? r.porte,
    }));
    return { data, total };
  }

  // ─── Browse Sócios (paginado, com busca) ─────────────────────────────────

  async browseSocios(search?: string, page = 1, limit = 50) {
    if (!this.parquet.hasFiles('socios')) return { data: [], total: 0 };
    const glob = this.parquet.globPath('socios');
    const offset = (page - 1) * limit;
    const safe = (v: string) => v.replace(/'/g, "''");
    const where = search
      ? `WHERE TRIM(cnpj_basico) ILIKE '%${safe(search)}%'
            OR TRIM(nome_socio)   ILIKE '%${safe(search)}%'
            OR TRIM(cpf_cnpj_socio) ILIKE '%${safe(search)}%'`
      : '';
    const countRow = await this.safeQuery<{ total: number }>(
      `SELECT COUNT(*)::int AS total FROM read_parquet('${glob}') ${where}`,
    );
    const rows = await this.safeQuery<Record<string, string>>(`
      SELECT
        TRIM(cnpj_basico)               AS cnpj_basico,
        TRIM(identificador_socio)       AS identificador_socio,
        TRIM(nome_socio)                AS nome_socio,
        TRIM(cpf_cnpj_socio)            AS cpf_cnpj_socio,
        TRIM(qualificacao_socio)        AS qualificacao_socio,
        TRIM(data_entrada_sociedade)    AS data_entrada_sociedade,
        TRIM(faixa_etaria)              AS faixa_etaria
      FROM read_parquet('${glob}')
      ${where}
      ORDER BY cnpj_basico, nome_socio
      LIMIT ${limit} OFFSET ${offset}
    `);
    return { data: rows, total: countRow[0]?.total ?? 0 };
  }

  // ─── Check quais cnpj_basico têm sócios ──────────────────────────────────

  async checkSocios(basicos: string[]): Promise<string[]> {
    if (!this.parquet.hasFiles('socios') || basicos.length === 0) return [];
    const glob = this.parquet.globPath('socios');
    const nums = basicos.map(b => BigInt(b).toString()).join(',');
    const rows = await this.safeQuery<{ basico: string }>(`
      SELECT DISTINCT printf('%08d', TRY_CAST(TRIM(cnpj_basico) AS INTEGER)) AS basico
      FROM read_parquet('${glob}')
      WHERE TRY_CAST(TRIM(cnpj_basico) AS BIGINT) IN (${nums})
    `);
    return rows.map(r => r.basico);
  }

  // ─── Overview rápido ─────────────────────────────────────────────────────

  async overview() {
    if (!this.parquet.hasFiles('estabelecimentos')) {
      return { totalEstab: 0, ativos: 0, estados: 0, cnaes: 0, totalEmp: 0 };
    }

    const estabGlob = this.parquet.globPath('estabelecimentos');
    const empGlob = this.parquet.hasFiles('empresas') ? this.parquet.globPath('empresas') : null;

    const [estabRow, empRow] = await Promise.all([
      this.safeQuery<{ total: number; ativos: number; estados: number; cnaes: number }>(`
        SELECT
          COUNT(*)::int                                                   AS total,
          SUM(CASE WHEN situacao_cadastral = '02' THEN 1 ELSE 0 END)::int AS ativos,
          COUNT(DISTINCT TRIM(uf))::int                                   AS estados,
          COUNT(DISTINCT TRIM(cnae_fiscal_principal))::int                AS cnaes
        FROM read_parquet('${estabGlob}')
        WHERE TRIM(uf) != ''
      `),
      empGlob
        ? this.safeQuery<{ total: number }>(`SELECT COUNT(*)::int AS total FROM read_parquet('${empGlob}')`)
        : Promise.resolve([{ total: 0 }]),
    ]);

    const e = estabRow[0];
    if (!e) return { totalEstab: 0, ativos: 0, estados: 0, cnaes: 0, totalEmp: 0 };
    return {
      totalEstab: Number(e.total),
      ativos: Number(e.ativos),
      estados: Number(e.estados),
      cnaes: Number(e.cnaes),
      totalEmp: Number(empRow[0]?.total ?? 0),
    };
  }
}
