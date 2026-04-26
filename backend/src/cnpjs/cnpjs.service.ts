import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export interface CnpjRecord {
  id: number;
  cnpjCompleto: string;
  cnpjBasico: string;
  cnpjOrdem: string;
  cnpjDv: string;
  identificadorMatrizFilial?: string;
  nomeFantasia?: string;
  situacaoCadastral?: string;
  dataSituacaoCadastral?: string;
  motivoSituacaoCadastral?: string;
  dataInicioAtividade?: string;
  cnaePrincipal?: string;
  cnaeSecundarios?: string;
  uf?: string;
  codigoMunicipio?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  cep?: string;
  codigoPais?: string;
  ddd1?: string;
  telefone1?: string;
  ddd2?: string;
  telefone2?: string;
  email?: string;
  situacaoEspecial?: string;
  // empresa
  razaoSocial?: string;
  naturezaJuridica?: string;
  qualificacaoResponsavel?: string;
  capitalSocial?: number;
  porte?: string;
  enteFederativo?: string;
  // referencias
  cnaeDescricao?: string;
  municipioNome?: string;
  motivoDescricao?: string;
  naturezaDescricao?: string;
  qualificacaoDescricao?: string;
  paisNome?: string;
}

const SELECT = `
  e.id,
  e.cnpj_completo          AS "cnpjCompleto",
  e.cnpj_basico            AS "cnpjBasico",
  e.cnpj_ordem             AS "cnpjOrdem",
  e.cnpj_dv                AS "cnpjDv",
  e.identificador_matriz_filial AS "identificadorMatrizFilial",
  e.nome_fantasia          AS "nomeFantasia",
  e.situacao_cadastral     AS "situacaoCadastral",
  e.data_situacao_cadastral AS "dataSituacaoCadastral",
  e.motivo_situacao_cadastral AS "motivoSituacaoCadastral",
  e.data_inicio_atividade  AS "dataInicioAtividade",
  e.cnae_fiscal_principal  AS "cnaePrincipal",
  e.cnae_fiscal_secundaria AS "cnaeSecundarios",
  e.uf,
  e.codigo_municipio       AS "codigoMunicipio",
  e.tipo_logradouro        AS "tipoLogradouro",
  e.logradouro,
  e.numero,
  e.complemento,
  e.bairro,
  e.cep,
  e.codigo_pais            AS "codigoPais",
  e.ddd_1                  AS "ddd1",
  e.telefone_1             AS "telefone1",
  e.ddd_2                  AS "ddd2",
  e.telefone_2             AS "telefone2",
  e.correio_eletronico     AS "email",
  e.situacao_especial      AS "situacaoEspecial",
  emp."razaoSocial",
  emp."naturezaJuridica",
  emp."qualificacaoResponsavel",
  emp."capitalSocial",
  emp.porte,
  emp."enteFederativo",
  c.descricao              AS "cnaeDescricao",
  m.descricao              AS "municipioNome",
  mot.descricao            AS "motivoDescricao",
  nj.descricao             AS "naturezaDescricao",
  q.descricao              AS "qualificacaoDescricao",
  p.descricao              AS "paisNome"
`;

const JOINS = `
  FROM estabelecimentos e
  LEFT JOIN empresa emp ON emp."cnpjBasico" = e.cnpj_basico
  LEFT JOIN cnae c   ON c.codigo = e.cnae_fiscal_principal
  LEFT JOIN municipios m ON m.codigo = e.codigo_municipio
  LEFT JOIN motivos mot  ON mot.codigo = e.motivo_situacao_cadastral
  LEFT JOIN naturezas_juridicas nj ON nj.codigo = emp."naturezaJuridica"
  LEFT JOIN qualificacoes q ON q.codigo = emp."qualificacaoResponsavel"
  LEFT JOIN paises p ON p.codigo = e.codigo_pais
`;

@Injectable()
export class CnpjsService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  async findAll(
    q?: string,
    page = 1,
    limit = 50,
    filters: {
      situacao?: string;
      tipo?: string;
      cnae?: string;
      uf?: string;
      porte?: string;
      municipio?: string;
    } = {},
  ): Promise<[CnpjRecord[], number]> {
    const offset = (page - 1) * limit;
    const params: unknown[] = [];
    const conditions: string[] = [];

    const p = (val: unknown) => { params.push(val); return `$${params.length}`; };

    if (q) {
      const like = `%${q}%`;
      conditions.push(`(e.cnpj_completo ILIKE ${p(like)} OR e.nome_fantasia ILIKE ${p(like)} OR emp."razaoSocial" ILIKE ${p(like)})`);
    }
    if (filters.situacao)  conditions.push(`e.situacao_cadastral = ${p(filters.situacao)}`);
    if (filters.tipo)      conditions.push(`e.identificador_matriz_filial = ${p(filters.tipo)}`);
    if (filters.cnae)      conditions.push(`e.cnae_fiscal_principal = ${p(filters.cnae)}`);
    if (filters.uf)        conditions.push(`e.uf = ${p(filters.uf)}`);
    if (filters.porte)     conditions.push(`emp.porte = ${p(filters.porte)}`);
    if (filters.municipio) conditions.push(`m.descricao ILIKE ${p(`%${filters.municipio}%`)}`);

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countParams = [...params];
    const limitParam = p(limit);
    const offsetParam = p(offset);

    const [rows, [{ count }]] = await Promise.all([
      this.db.query<CnpjRecord[]>(
        `SELECT ${SELECT} ${JOINS} ${where} ORDER BY e.cnpj_completo LIMIT ${limitParam} OFFSET ${offsetParam}`,
        params,
      ),
      this.db.query<{ count: string }[]>(
        `SELECT COUNT(*)::int AS count ${JOINS} ${where}`,
        countParams,
      ),
    ]);

    return [rows, Number(count)];
  }

  async findOne(id: number): Promise<CnpjRecord | null> {
    const rows = await this.db.query<CnpjRecord[]>(
      `SELECT ${SELECT} ${JOINS} WHERE e.id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async create(data: {
    cnpjBasico: string; cnpjOrdem: string; cnpjDv: string;
    razaoSocial: string; naturezaJuridica?: string; qualificacaoResponsavel?: string;
    capitalSocial?: number; porte?: string; enteFederativo?: string;
    identificadorMatrizFilial?: string; nomeFantasia?: string;
    situacaoCadastral?: string; dataInicioAtividade?: string;
    cnaePrincipal?: string; uf?: string; codigoMunicipio?: string;
    logradouro?: string; numero?: string; complemento?: string;
    bairro?: string; cep?: string; ddd1?: string; telefone1?: string; email?: string;
  }) {
    const cnpjCompleto = data.cnpjBasico + data.cnpjOrdem + data.cnpjDv;

    // Upsert empresa
    await this.db.query(
      `INSERT INTO empresa ("cnpjBasico","razaoSocial","naturezaJuridica","qualificacaoResponsavel","capitalSocial",porte,"enteFederativo")
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT ("cnpjBasico") DO UPDATE SET
         "razaoSocial"=EXCLUDED."razaoSocial",
         "naturezaJuridica"=EXCLUDED."naturezaJuridica",
         "qualificacaoResponsavel"=EXCLUDED."qualificacaoResponsavel",
         "capitalSocial"=EXCLUDED."capitalSocial",
         porte=EXCLUDED.porte,
         "enteFederativo"=EXCLUDED."enteFederativo"`,
      [
        data.cnpjBasico, data.razaoSocial, data.naturezaJuridica ?? null,
        data.qualificacaoResponsavel ?? null, data.capitalSocial ?? null,
        data.porte ?? null, data.enteFederativo ?? null,
      ],
    );

    // Insert estabelecimento
    const [row] = await this.db.query<{ id: number }[]>(
      `INSERT INTO estabelecimentos
         (cnpj_basico,cnpj_ordem,cnpj_dv,cnpj_completo,
          identificador_matriz_filial,nome_fantasia,situacao_cadastral,
          data_inicio_atividade,cnae_fiscal_principal,uf,codigo_municipio,
          logradouro,numero,complemento,bairro,cep,ddd_1,telefone_1,correio_eletronico)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       RETURNING id`,
      [
        data.cnpjBasico, data.cnpjOrdem, data.cnpjDv, cnpjCompleto,
        data.identificadorMatrizFilial ?? null, data.nomeFantasia ?? null,
        data.situacaoCadastral ?? null, data.dataInicioAtividade ?? null,
        data.cnaePrincipal ?? null, data.uf ?? null, data.codigoMunicipio ?? null,
        data.logradouro ?? null, data.numero ?? null, data.complemento ?? null,
        data.bairro ?? null, data.cep ?? null,
        data.ddd1 ?? null, data.telefone1 ?? null, data.email ?? null,
      ],
    );

    return this.findOne(row.id);
  }

  async update(id: number, data: Partial<Parameters<CnpjsService['create']>[0]>) {
    // Update estabelecimento
    await this.db.query(
      `UPDATE estabelecimentos SET
        identificador_matriz_filial = COALESCE($2, identificador_matriz_filial),
        nome_fantasia               = COALESCE($3, nome_fantasia),
        situacao_cadastral          = COALESCE($4, situacao_cadastral),
        data_inicio_atividade       = COALESCE($5, data_inicio_atividade),
        cnae_fiscal_principal       = COALESCE($6, cnae_fiscal_principal),
        uf                          = COALESCE($7, uf),
        codigo_municipio            = COALESCE($8, codigo_municipio),
        logradouro                  = COALESCE($9, logradouro),
        numero                      = COALESCE($10, numero),
        complemento                 = COALESCE($11, complemento),
        bairro                      = COALESCE($12, bairro),
        cep                         = COALESCE($13, cep),
        ddd_1                       = COALESCE($14, ddd_1),
        telefone_1                  = COALESCE($15, telefone_1),
        correio_eletronico          = COALESCE($16, correio_eletronico)
       WHERE id = $1`,
      [
        id,
        data.identificadorMatrizFilial ?? null, data.nomeFantasia ?? null,
        data.situacaoCadastral ?? null, data.dataInicioAtividade ?? null,
        data.cnaePrincipal ?? null, data.uf ?? null, data.codigoMunicipio ?? null,
        data.logradouro ?? null, data.numero ?? null, data.complemento ?? null,
        data.bairro ?? null, data.cep ?? null,
        data.ddd1 ?? null, data.telefone1 ?? null, data.email ?? null,
      ],
    );

    // Update empresa if empresa fields provided
    if (data.razaoSocial || data.naturezaJuridica || data.qualificacaoResponsavel ||
        data.capitalSocial !== undefined || data.porte || data.enteFederativo) {
      const current = await this.findOne(id);
      if (current?.cnpjBasico) {
        await this.db.query(
          `UPDATE empresa SET
            "razaoSocial"              = COALESCE($2, "razaoSocial"),
            "naturezaJuridica"         = COALESCE($3, "naturezaJuridica"),
            "qualificacaoResponsavel"  = COALESCE($4, "qualificacaoResponsavel"),
            "capitalSocial"            = COALESCE($5, "capitalSocial"),
            porte                      = COALESCE($6, porte),
            "enteFederativo"           = COALESCE($7, "enteFederativo")
           WHERE "cnpjBasico" = $1`,
          [
            current.cnpjBasico,
            data.razaoSocial ?? null, data.naturezaJuridica ?? null,
            data.qualificacaoResponsavel ?? null,
            data.capitalSocial !== undefined ? data.capitalSocial : null,
            data.porte ?? null, data.enteFederativo ?? null,
          ],
        );
      }
    }

    return this.findOne(id);
  }

  async remove(id: number): Promise<void> {
    await this.db.query(`DELETE FROM estabelecimentos WHERE id = $1`, [id]);
  }
}
