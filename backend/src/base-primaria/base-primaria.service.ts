import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { BigQueryService } from './bigquery.service';

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
    private readonly bq: BigQueryService,
    @InjectDataSource() private readonly pg: DataSource,
  ) {}

  private async safeQuery<T>(sql: string): Promise<T[]> {
    try {
      return await this.bq.query<T>(sql);
    } catch (err: any) {
      this.logger.warn(`BigQuery query failed: ${err?.message}`);
      return [];
    }
  }

  // ─── Status ──────────────────────────────────────────────────────────────

  async getStatus() {
    const countTable = async (table: string) => {
      const rows = await this.safeQuery<{ total: number }>(
        `SELECT CAST(COUNT(*) AS INT64) AS total FROM ${this.bq.table(table)}`,
      );
      return Number(rows[0]?.total ?? 0);
    };

    const [totalEstab, totalEmp, totalSocios] = await Promise.all([
      countTable('estabelecimentos'),
      countTable('empresas'),
      countTable('socios'),
    ]);

    return {
      estabelecimentos: { arquivos: [], total: totalEstab },
      empresas: { arquivos: [], total: totalEmp },
      socios: { arquivos: [], total: totalSocios },
    };
  }

  // ─── Análise por UF ───────────────────────────────────────────────────────

  async porUf() {
    return this.safeQuery<{ uf: string; total: number; ativos: number }>(`
      SELECT
        COALESCE(NULLIF(TRIM(uf), ''), '??') AS uf,
        CAST(COUNT(*) AS INT64) AS total,
        CAST(SUM(CASE WHEN situacao_cadastral = '02' THEN 1 ELSE 0 END) AS INT64) AS ativos
      FROM ${this.bq.table('estabelecimentos')}
      GROUP BY uf
      ORDER BY total DESC
    `);
  }

  // ─── Análise por CNAE ─────────────────────────────────────────────────────

  async porCnae(uf?: string, limit = 50) {
    const where = uf
      ? `WHERE TRIM(uf) = '${uf.toUpperCase()}' AND situacao_cadastral = '02'`
      : `WHERE situacao_cadastral = '02'`;
    const rows = await this.safeQuery<{ cnae: string; total: number }>(`
      SELECT
        TRIM(cnae_fiscal_principal) AS cnae,
        CAST(COUNT(*) AS INT64) AS total
      FROM ${this.bq.table('estabelecimentos')}
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
      `SELECT codigo, descricao FROM public.cnae WHERE codigo IN (${inList})`,
    ).catch((err) => { this.logger.error(`cnae lookup failed: ${err?.message}`); return []; });
    const map = new Map(desc.map((d) => [d.codigo, d.descricao]));
    return rows.map((r) => ({ ...r, descricao: map.get(r.cnae) ?? r.cnae }));
  }

  // ─── Análise por Município ────────────────────────────────────────────────

  async porMunicipio(uf?: string, limit = 50) {
    const where = uf
      ? `WHERE TRIM(uf) = '${uf.toUpperCase()}' AND situacao_cadastral = '02'`
      : `WHERE situacao_cadastral = '02'`;
    const rows = await this.safeQuery<{ codigo_municipio: string; uf: string; total: number }>(`
      SELECT
        TRIM(codigo_municipio) AS codigo_municipio,
        TRIM(uf) AS uf,
        CAST(COUNT(*) AS INT64) AS total
      FROM ${this.bq.table('estabelecimentos')}
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
      `SELECT codigo, descricao FROM public.municipios WHERE codigo IN (${inList})`,
    ).catch((err) => { this.logger.error(`municipios lookup failed: ${err?.message}`); return []; });
    const map = new Map(desc.map((d) => [d.codigo, d.descricao]));
    return rows.map((r) => ({ ...r, descricao: map.get(r.codigo_municipio) ?? r.codigo_municipio }));
  }

  // ─── Análise por Situação ─────────────────────────────────────────────────

  async porSituacao(uf?: string) {
    const where = uf ? `WHERE TRIM(uf) = '${uf.toUpperCase()}'` : '';
    const rows = await this.safeQuery<{ situacao: string; total: number }>(`
      SELECT
        COALESCE(NULLIF(TRIM(situacao_cadastral), ''), '??') AS situacao,
        CAST(COUNT(*) AS INT64) AS total
      FROM ${this.bq.table('estabelecimentos')}
      ${where}
      GROUP BY situacao
      ORDER BY total DESC
    `);
    return rows.map((r) => ({ ...r, label: SITUACAO[r.situacao] ?? r.situacao }));
  }

  // ─── Análise por Porte ────────────────────────────────────────────────────

  async porPorte() {
    const rows = await this.safeQuery<{ porte: string; total: number }>(`
      SELECT
        COALESCE(NULLIF(TRIM(porte), ''), '??') AS porte,
        CAST(COUNT(*) AS INT64) AS total
      FROM ${this.bq.table('empresas')}
      GROUP BY porte
      ORDER BY total DESC
    `);
    return rows.map((r) => ({ ...r, label: PORTE[r.porte] ?? r.porte }));
  }

  // ─── Browse Empresas (paginado, com busca) ───────────────────────────────

  async browseEmpresas(search?: string, page = 1, limit = 50) {
    const offset = (page - 1) * limit;
    const safe = (v: string) => v.replace(/'/g, "''");
    const where = search
      ? `WHERE LOWER(cnpj_basico) LIKE LOWER('%${safe(search)}%')
            OR LOWER(razao_social) LIKE LOWER('%${safe(search)}%')`
      : '';
    const [countRow, rows] = await Promise.all([
      this.safeQuery<{ total: number }>(`
        SELECT CAST(COUNT(*) AS INT64) AS total
        FROM ${this.bq.table('empresas')} ${where}
      `),
      this.safeQuery<{ cnpj_basico: string; razao_social: string; natureza_juridica: string; capital_social: string; porte: string }>(`
        SELECT cnpj_basico, razao_social, natureza_juridica, capital_social, porte
        FROM ${this.bq.table('empresas')}
        ${where}
        ORDER BY cnpj_basico
        LIMIT ${limit} OFFSET ${offset}
      `),
    ]);
    const total = Number(countRow[0]?.total ?? 0);
    const data = rows.map((r) => ({
      ...r,
      porteLabel: PORTE[r.porte?.trim()] ?? r.porte,
    }));
    return { data, total };
  }

  // ─── Browse Sócios (paginado, com busca) ─────────────────────────────────

  async browseSocios(search?: string, page = 1, limit = 50) {
    const offset = (page - 1) * limit;
    const safe = (v: string) => v.replace(/'/g, "''");
    const where = search
      ? `WHERE LOWER(TRIM(cnpj_basico)) LIKE LOWER('%${safe(search)}%')
            OR LOWER(TRIM(nome_socio))   LIKE LOWER('%${safe(search)}%')
            OR LOWER(TRIM(cpf_cnpj_socio)) LIKE LOWER('%${safe(search)}%')`
      : '';
    const countRow = await this.safeQuery<{ total: number }>(
      `SELECT CAST(COUNT(*) AS INT64) AS total FROM ${this.bq.table('socios')} ${where}`,
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
      FROM ${this.bq.table('socios')}
      ${where}
      ORDER BY cnpj_basico, nome_socio
      LIMIT ${limit} OFFSET ${offset}
    `);
    return { data: rows, total: Number(countRow[0]?.total ?? 0) };
  }

  // ─── Check quais cnpj_basico têm sócios ──────────────────────────────────

  async checkSocios(basicos: string[]): Promise<string[]> {
    if (basicos.length === 0) return [];
    const nums = basicos.map(b => BigInt(b).toString()).join(',');
    const rows = await this.safeQuery<{ basico: string }>(`
      SELECT DISTINCT FORMAT('%08d', SAFE_CAST(TRIM(cnpj_basico) AS INT64)) AS basico
      FROM ${this.bq.table('socios')}
      WHERE SAFE_CAST(TRIM(cnpj_basico) AS INT64) IN (${nums})
    `);
    return rows.map(r => r.basico);
  }

  // ─── Overview rápido ─────────────────────────────────────────────────────

  async overview() {
    const [estabRow, empRow] = await Promise.all([
      this.safeQuery<{ total: number; ativos: number; estados: number; cnaes: number }>(`
        SELECT
          CAST(COUNT(*) AS INT64)                                                    AS total,
          CAST(SUM(CASE WHEN situacao_cadastral = '02' THEN 1 ELSE 0 END) AS INT64)  AS ativos,
          CAST(COUNT(DISTINCT TRIM(uf)) AS INT64)                                    AS estados,
          CAST(COUNT(DISTINCT TRIM(cnae_fiscal_principal)) AS INT64)                 AS cnaes
        FROM ${this.bq.table('estabelecimentos')}
        WHERE TRIM(uf) != ''
      `),
      this.safeQuery<{ total: number }>(`
        SELECT CAST(COUNT(*) AS INT64) AS total FROM ${this.bq.table('empresas')}
      `),
    ]);

    const e = estabRow[0];
    if (!e) return { totalEstab: 0, ativos: 0, estados: 0, cnaes: 0, totalEmp: 0 };
    return {
      totalEstab: Number(e.total),
      ativos:     Number(e.ativos),
      estados:    Number(e.estados),
      cnaes:      Number(e.cnaes),
      totalEmp:   Number(empRow[0]?.total ?? 0),
    };
  }
}
