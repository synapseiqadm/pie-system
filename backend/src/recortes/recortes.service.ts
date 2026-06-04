import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Recorte, FiltrosRecorte } from './entities/recorte.entity';
import { CreateRecorteDto } from './dto/create-recorte.dto';
import { BigQueryService } from '../base-primaria/bigquery.service';

@Injectable()
export class RecortesService {
  constructor(
    @InjectRepository(Recorte)
    private readonly repo: Repository<Recorte>,
    private readonly bq: BigQueryService,
  ) {}

  findAll() {
    return this.repo.find({ order: { criadoEm: 'DESC' } });
  }

  async findOne(id: number) {
    const r = await this.repo.findOneBy({ id });
    if (!r) throw new NotFoundException(`Recorte ${id} não encontrado`);
    return r;
  }

  create(dto: CreateRecorteDto) {
    return this.repo.save(this.repo.create({ ...dto, filtros: dto.filtros ?? {} }));
  }

  async update(id: number, dto: Partial<CreateRecorteDto>) {
    await this.findOne(id);
    await this.repo.update(id, dto);
    return this.findOne(id);
  }

  async remove(id: number) {
    await this.findOne(id);
    await this.repo.delete(id);
  }

  // ─── Query builder ────────────────────────────────────────────────────────

  buildWhere(f: FiltrosRecorte): string[] {
    const clauses: string[] = [];

    if (f.situacoes?.length) {
      const list = f.situacoes.map((s) => `'${s}'`).join(',');
      clauses.push(`e.situacao_cadastral IN (${list})`);
    } else {
      clauses.push(`e.situacao_cadastral = '02'`);
    }

    if (f.ufs?.length) {
      const list = f.ufs.map((u) => `'${u.toUpperCase()}'`).join(',');
      clauses.push(`TRIM(e.uf) IN (${list})`);
    }

    if (f.cnaes?.length) {
      const list = f.cnaes.map((c) => `'${c.replace(/'/g, "''")}'`).join(',');
      clauses.push(`TRIM(e.cnae_fiscal_principal) IN (${list})`);
    }

    if (f.municipios?.length) {
      const list = f.municipios.map((m) => `'${m.replace(/'/g, "''")}'`).join(',');
      clauses.push(`TRIM(e.codigo_municipio) IN (${list})`);
    }

    if (f.bairros?.length) {
      const parts = f.bairros.map(
        b => `TRIM(LOWER(e.bairro)) LIKE '%${b.toLowerCase().replace(/'/g, "''")}%'`,
      );
      clauses.push(`(${parts.join(' OR ')})`);
    }

    return clauses;
  }

  buildFrom(): string {
    return `${this.bq.table('estabelecimentos')} e`;
  }

  buildEmpresasJoin(): { join: string; col: string } {
    return {
      join: `LEFT JOIN ${this.bq.table('empresas')} emp ON TRIM(emp.cnpj_basico) = TRIM(e.cnpj_basico)`,
      col:  `COALESCE(TRIM(emp.capital_social), '') AS capital_social`,
    };
  }

  buildEmpresasWhere(f: FiltrosRecorte): string[] {
    const clauses: string[] = [];

    if (f.portes?.length) {
      const realPortes = f.portes.filter(p => p !== 'MEI');
      const includeMEI = f.portes.includes('MEI');
      const parts: string[] = [];
      if (realPortes.length) parts.push(`COALESCE(TRIM(emp.porte), '00') IN (${realPortes.map(p => `'${p}'`).join(',')})`);
      if (includeMEI)        parts.push(`TRIM(emp.natureza_juridica) = '2135'`);
      if (parts.length)      clauses.push(parts.length > 1 ? `(${parts.join(' OR ')})` : parts[0]);
    }
    if (f.naturezas?.length) {
      const list = f.naturezas.map(n => `'${n.replace(/'/g, "''")}'`).join(',');
      clauses.push(`TRIM(emp.natureza_juridica) IN (${list})`);
    }

    const capExpr = `SAFE_CAST(REPLACE(COALESCE(NULLIF(TRIM(emp.capital_social),''),'0'),',','.') AS FLOAT64)`;
    if (f.capitalMin != null) clauses.push(`${capExpr} >= ${f.capitalMin}`);
    if (f.capitalMax != null) clauses.push(`${capExpr} <= ${f.capitalMax}`);
    return clauses;
  }

  async analiseFromFiltros(filtros: FiltrosRecorte): Promise<{
    total: number;
    ufs:       { uf: string; total: number }[];
    cnaes:     { cnae: string; total: number }[];
    portes:    { porte: string; total: number }[];
    capital:   { faixa: string; total: number }[];
    naturezas: { natureza: string; total: number }[];
  }> {
    const from  = this.buildFrom();
    const { join: empJoin } = this.buildEmpresasJoin();
    const eClauses   = this.buildWhere(filtros);
    const empClauses = this.buildEmpresasWhere(filtros);
    const allClauses = [...eClauses, ...empClauses];
    const where  = allClauses.length ? `WHERE ${allClauses.join(' AND ')}` : '';
    const dedup  = `QUALIFY ROW_NUMBER() OVER (PARTITION BY e.cnpj_basico,e.cnpj_ordem,e.cnpj_dv ORDER BY e.cnpj_basico) = 1`;

    const portExpr = `CASE WHEN TRIM(emp.natureza_juridica) = '2135' THEN 'MEI' ELSE COALESCE(TRIM(emp.porte),'00') END`;
    const natExpr  = `COALESCE(TRIM(emp.natureza_juridica), '0000')`;
    const capExpr  = `SAFE_CAST(REPLACE(COALESCE(NULLIF(TRIM(emp.capital_social),''),'0'),',','.') AS FLOAT64)`;

    const sql = `
      WITH base AS (
        SELECT
          TRIM(e.uf)                    AS uf,
          TRIM(e.cnae_fiscal_principal) AS cnae,
          ${portExpr}                   AS porte,
          ${natExpr}                    AS natureza,
          CASE
            WHEN ${capExpr} = 0        THEN 'zero'
            WHEN ${capExpr} < 10000    THEN 'ate_10k'
            WHEN ${capExpr} < 100000   THEN '10k_100k'
            WHEN ${capExpr} < 1000000  THEN '100k_1m'
            ELSE 'acima_1m'
          END AS faixa_capital
        FROM ${from} ${empJoin} ${where} ${dedup}
      )
      SELECT 'total'   AS dim, ''             AS val, CAST(COUNT(*) AS INT64) AS n FROM base
      UNION ALL SELECT 'uf',       uf,           CAST(COUNT(*) AS INT64) FROM base GROUP BY uf
      UNION ALL SELECT 'cnae',     cnae,         CAST(COUNT(*) AS INT64) FROM base GROUP BY cnae
      UNION ALL SELECT 'porte',    porte,        CAST(COUNT(*) AS INT64) FROM base GROUP BY porte
      UNION ALL SELECT 'natureza', natureza,     CAST(COUNT(*) AS INT64) FROM base GROUP BY natureza
      UNION ALL SELECT 'capital',  faixa_capital,CAST(COUNT(*) AS INT64) FROM base GROUP BY faixa_capital
    `;

    const rows = await this.bq.query<{ dim: string; val: string; n: number }>(sql);
    const byDim = (dim: string) => rows.filter(r => r.dim === dim);

    const total = Number(byDim('total')[0]?.n ?? 0);

    const ufs = byDim('uf')
      .map(r => ({ uf: r.val, total: Number(r.n) }))
      .sort((a, b) => b.total - a.total);

    const cnaes = byDim('cnae')
      .map(r => ({ cnae: r.val, total: Number(r.n) }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 15);

    const portes = byDim('porte')
      .map(r => ({ porte: r.val, total: Number(r.n) }))
      .sort((a, b) => b.total - a.total);

    const FAIXAS_ORDER = ['zero','ate_10k','10k_100k','100k_1m','acima_1m'];
    const capital = byDim('capital')
      .map(r => ({ faixa: r.val, total: Number(r.n) }))
      .sort((a, b) => FAIXAS_ORDER.indexOf(a.faixa) - FAIXAS_ORDER.indexOf(b.faixa));

    const naturezas = byDim('natureza')
      .map(r => ({ natureza: r.val, total: Number(r.n) }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 15);

    return { total, ufs, cnaes, portes, capital, naturezas };
  }

  async analise(id: number) {
    const recorte = await this.findOne(id);
    return this.analiseFromFiltros(recorte.filtros);
  }

  // ─── Executar (count + preview) ────────────────────────────────────────────

  async executar(id: number, page = 1, limit = 50) {
    const recorte = await this.findOne(id);

    const from  = this.buildFrom();
    const { join: empJoin, col: empCol } = this.buildEmpresasJoin();
    const eClauses   = this.buildWhere(recorte.filtros);
    const empClauses = this.buildEmpresasWhere(recorte.filtros);
    const allClauses = [...eClauses, ...empClauses];
    const where  = allClauses.length ? `WHERE ${allClauses.join(' AND ')}` : '';
    const offset = (page - 1) * limit;

    const dedup = `QUALIFY ROW_NUMBER() OVER (PARTITION BY e.cnpj_basico, e.cnpj_ordem, e.cnpj_dv ORDER BY e.cnpj_basico) = 1`;

    const countRow = await this.bq.query<{ total: number }>(
      `SELECT CAST(COUNT(*) AS INT64) AS total FROM (SELECT e.cnpj_basico FROM ${from} ${empJoin} ${where} ${dedup}) t`,
    );
    const rows = await this.bq.query<Record<string, string>>(
      `SELECT
        TRIM(e.cnpj_basico) || TRIM(e.cnpj_ordem) || TRIM(e.cnpj_dv) AS cnpj,
        TRIM(e.cnpj_basico)           AS cnpj_basico,
        TRIM(e.nome_fantasia)         AS nome_fantasia,
        TRIM(e.situacao_cadastral)    AS situacao_cadastral,
        TRIM(e.cnae_fiscal_principal) AS cnae,
        TRIM(e.uf)                    AS uf,
        TRIM(e.codigo_municipio)      AS codigo_municipio,
        TRIM(e.ddd_1) || TRIM(e.telefone_1) AS telefone,
        TRIM(e.correio_eletronico)    AS email,
        ${empCol}
      FROM ${from}
      ${empJoin}
      ${where}
      ${dedup}
      ORDER BY e.cnpj_basico, e.cnpj_ordem, e.cnpj_dv
      LIMIT ${limit} OFFSET ${offset}`,
    );

    const total = Number(countRow[0]?.total ?? 0);

    await this.repo.update(id, { totalCached: total, executadoEm: new Date() });

    return { total, data: rows };
  }

  // ─── Detalhe de um CNPJ ───────────────────────────────────────────────────

  async detalhe(cnpj: string) {
    const c = cnpj.replace(/\D/g, '');
    if (c.length !== 14) throw new NotFoundException('CNPJ inválido');
    const basico = c.slice(0, 8);
    const ordem  = c.slice(8, 12);
    const dv     = c.slice(12, 14);

    const estabFrom = this.bq.table('estabelecimentos');
    const empFrom   = this.bq.table('empresas');
    const socFrom   = this.bq.table('socios');

    const estabRows = await this.bq.query<Record<string, string>>(`
      SELECT
        TRIM(e.cnpj_basico)               AS cnpj_basico,
        TRIM(e.cnpj_ordem)                AS cnpj_ordem,
        TRIM(e.cnpj_dv)                   AS cnpj_dv,
        TRIM(e.identificador_matriz_filial) AS matriz_filial,
        TRIM(e.nome_fantasia)             AS nome_fantasia,
        TRIM(e.situacao_cadastral)        AS situacao_cadastral,
        TRIM(e.data_situacao_cadastral)   AS data_situacao_cadastral,
        TRIM(e.motivo_situacao_cadastral) AS motivo_situacao_cadastral,
        TRIM(e.data_inicio_atividade)     AS data_inicio_atividade,
        TRIM(e.cnae_fiscal_principal)     AS cnae_fiscal_principal,
        TRIM(e.cnae_fiscal_secundaria)    AS cnae_fiscal_secundaria,
        TRIM(e.tipo_logradouro)           AS tipo_logradouro,
        TRIM(e.logradouro)                AS logradouro,
        TRIM(e.numero)                    AS numero,
        TRIM(e.complemento)               AS complemento,
        TRIM(e.bairro)                    AS bairro,
        TRIM(e.cep)                       AS cep,
        TRIM(e.uf)                        AS uf,
        TRIM(e.codigo_municipio)          AS codigo_municipio,
        TRIM(e.ddd_1)                     AS ddd_1,
        TRIM(e.telefone_1)                AS telefone_1,
        TRIM(e.ddd_2)                     AS ddd_2,
        TRIM(e.telefone_2)                AS telefone_2,
        TRIM(e.ddd_fax)                   AS ddd_fax,
        TRIM(e.fax)                       AS fax,
        TRIM(e.correio_eletronico)        AS correio_eletronico,
        TRIM(e.situacao_especial)         AS situacao_especial,
        TRIM(e.data_situacao_especial)    AS data_situacao_especial,
        TRIM(emp.razao_social)            AS razao_social,
        TRIM(emp.natureza_juridica)       AS natureza_juridica,
        TRIM(emp.qualificacao_responsavel) AS qualificacao_responsavel,
        TRIM(emp.capital_social)          AS capital_social,
        TRIM(emp.porte)                   AS porte,
        TRIM(emp.ente_federativo_responsavel) AS ente_federativo_responsavel
      FROM ${estabFrom} e
      LEFT JOIN ${empFrom} emp ON TRIM(emp.cnpj_basico) = '${basico}'
      WHERE TRIM(e.cnpj_basico) = '${basico}'
        AND TRIM(e.cnpj_ordem)  = '${ordem}'
        AND TRIM(e.cnpj_dv)     = '${dv}'
      LIMIT 1
    `);

    if (estabRows.length === 0) throw new NotFoundException(`CNPJ ${cnpj} não encontrado`);

    const sociosRows = await this.bq.query<Record<string, string>>(`
      SELECT
        TRIM(s.identificador_socio)    AS identificador_socio,
        TRIM(s.nome_socio)             AS nome_socio,
        TRIM(s.cpf_cnpj_socio)         AS cpf_cnpj_socio,
        TRIM(s.qualificacao_socio)     AS qualificacao_socio,
        TRIM(s.data_entrada_sociedade) AS data_entrada_sociedade,
        TRIM(s.faixa_etaria)           AS faixa_etaria
      FROM ${socFrom} s
      WHERE SAFE_CAST(TRIM(s.cnpj_basico) AS INT64) = ${BigInt(basico)}
    `);

    return { estabelecimento: estabRows[0], socios: sociosRows };
  }

  // ─── Exportar CSV ─────────────────────────────────────────────────────────

  async *exportarCsv(id: number): AsyncGenerator<string> {
    const recorte = await this.findOne(id);

    const from  = this.buildFrom();
    const { join: empJoin, col: empCol } = this.buildEmpresasJoin();
    const eClauses   = this.buildWhere(recorte.filtros);
    const empClauses = this.buildEmpresasWhere(recorte.filtros);
    const allClauses = [...eClauses, ...empClauses];
    const where = allClauses.length ? `WHERE ${allClauses.join(' AND ')}` : '';

    yield 'cnpj,cnpj_basico,nome_fantasia,situacao_cadastral,cnae,uf,municipio,telefone,email,capital_social\n';

    const BATCH = 10_000;
    let offset = 0;

    while (true) {
      const rows = await this.bq.query<Record<string, string>>(`
        SELECT
          TRIM(e.cnpj_basico) || TRIM(e.cnpj_ordem) || TRIM(e.cnpj_dv) AS cnpj,
          TRIM(e.cnpj_basico)           AS cnpj_basico,
          COALESCE(TRIM(e.nome_fantasia), '') AS nome_fantasia,
          TRIM(e.situacao_cadastral)    AS situacao_cadastral,
          TRIM(e.cnae_fiscal_principal) AS cnae,
          TRIM(e.uf)                    AS uf,
          TRIM(e.codigo_municipio)      AS municipio,
          COALESCE(TRIM(e.ddd_1) || TRIM(e.telefone_1), '') AS telefone,
          COALESCE(TRIM(e.correio_eletronico), '') AS email,
          ${empCol}
        FROM ${from}
        ${empJoin}
        ${where}
        QUALIFY ROW_NUMBER() OVER (PARTITION BY e.cnpj_basico, e.cnpj_ordem, e.cnpj_dv ORDER BY e.cnpj_basico) = 1
        ORDER BY e.cnpj_basico, e.cnpj_ordem, e.cnpj_dv
        LIMIT ${BATCH} OFFSET ${offset}
      `);

      if (rows.length === 0) break;

      for (const r of rows) {
        const line = [r.cnpj, r.cnpj_basico, r.nome_fantasia, r.situacao_cadastral,
                      r.cnae, r.uf, r.municipio, r.telefone, r.email, r.capital_social]
          .map((v) => `"${(v ?? '').replace(/"/g, '""')}"`)
          .join(',');
        yield line + '\n';
      }

      offset += BATCH;
      if (rows.length < BATCH) break;
    }
  }
}
