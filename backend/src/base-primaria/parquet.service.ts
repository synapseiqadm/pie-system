import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs';
import * as unzipper from 'unzipper';
import { pipeline } from 'stream/promises';
import { DuckDbService } from './duckdb.service';

export const DATA_DIR = process.env.RECEITA_DATA_DIR
  ?? path.join(process.cwd(), '..', 'data', 'receita');

export type TipoBase = 'estabelecimentos' | 'empresas' | 'socios';

export type ParquetFileInfo = {
  tipo: TipoBase;
  arquivo: string;
  tamanho: number;
  criadoEm: string;
};

// Receita Federal CSV schemas — no header, semicolon-delimited, win1252 (latin1)
const SCHEMA: Record<TipoBase, string> = {
  estabelecimentos: `{
    cnpj_basico: VARCHAR,
    cnpj_ordem: VARCHAR,
    cnpj_dv: VARCHAR,
    identificador_matriz_filial: VARCHAR,
    nome_fantasia: VARCHAR,
    situacao_cadastral: VARCHAR,
    data_situacao_cadastral: VARCHAR,
    motivo_situacao_cadastral: VARCHAR,
    nome_cidade_exterior: VARCHAR,
    codigo_pais: VARCHAR,
    data_inicio_atividade: VARCHAR,
    cnae_fiscal_principal: VARCHAR,
    cnae_fiscal_secundaria: VARCHAR,
    tipo_logradouro: VARCHAR,
    logradouro: VARCHAR,
    numero: VARCHAR,
    complemento: VARCHAR,
    bairro: VARCHAR,
    cep: VARCHAR,
    uf: VARCHAR,
    codigo_municipio: VARCHAR,
    ddd_1: VARCHAR,
    telefone_1: VARCHAR,
    ddd_2: VARCHAR,
    telefone_2: VARCHAR,
    ddd_fax: VARCHAR,
    fax: VARCHAR,
    correio_eletronico: VARCHAR,
    situacao_especial: VARCHAR,
    data_situacao_especial: VARCHAR
  }`,
  empresas: `{
    cnpj_basico: VARCHAR,
    razao_social: VARCHAR,
    natureza_juridica: VARCHAR,
    qualificacao_responsavel: VARCHAR,
    capital_social: VARCHAR,
    porte: VARCHAR,
    ente_federativo_responsavel: VARCHAR
  }`,
  socios: `{
    cnpj_basico: VARCHAR,
    identificador_socio: VARCHAR,
    nome_socio: VARCHAR,
    cpf_cnpj_socio: VARCHAR,
    qualificacao_socio: VARCHAR,
    data_entrada_sociedade: VARCHAR,
    pais: VARCHAR,
    representante_legal: VARCHAR,
    nome_representante: VARCHAR,
    qualificacao_representante_legal: VARCHAR,
    faixa_etaria: VARCHAR
  }`,
};

@Injectable()
export class ParquetService implements OnModuleInit {
  private readonly logger = new Logger(ParquetService.name);

  constructor(private readonly duck: DuckDbService) {}

  onModuleInit() {
    // Clean up temp files left from crashed processes
    for (const tipo of ['estabelecimentos', 'empresas', 'socios'] as const) {
      const dir = path.join(DATA_DIR, tipo);
      if (!fs.existsSync(dir)) continue;
      const stale = fs.readdirSync(dir).filter((f) => f.startsWith('_tmp_') && (f.endsWith('.csv') || f.endsWith('.parquet')));
      for (const f of stale) {
        try { fs.unlinkSync(path.join(dir, f)); this.logger.warn(`Removido temp órfão: ${f}`); } catch {}
      }
    }

    // Clean up orphaned upload ZIPs in os.tmpdir() left by multer when EBUSY prevented deletion
    const tmpDir = require('os').tmpdir();
    try {
      const staleZips = fs.readdirSync(tmpDir).filter((f) => f.startsWith('pie_upload_'));
      for (const f of staleZips) {
        try { fs.unlinkSync(path.join(tmpDir, f)); this.logger.warn(`Removido upload órfão: ${f}`); } catch {}
      }
    } catch {}
  }

  listFiles(tipo: TipoBase): ParquetFileInfo[] {
    const dir = path.join(DATA_DIR, tipo);
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir)
      .filter((f) => f.endsWith('.parquet'))
      .map((f) => {
        const full = path.join(dir, f);
        const stat = fs.statSync(full);
        return { tipo, arquivo: f, tamanho: stat.size, criadoEm: stat.birthtime.toISOString() };
      })
      .sort((a, b) => a.arquivo.localeCompare(b.arquivo));
  }

  hasFiles(tipo: TipoBase): boolean {
    return this.listFiles(tipo).length > 0;
  }

  globPath(tipo: TipoBase): string {
    return path.join(DATA_DIR, tipo, '*.parquet').replace(/\\/g, '/');
  }

  nextPartIndex(tipo: TipoBase): number {
    const files = this.listFiles(tipo);
    if (files.length === 0) return 0;
    const indices = files
      .map((f) => parseInt(f.arquivo.replace('part_', '').replace('.parquet', ''), 10))
      .filter((n) => !isNaN(n));
    return indices.length > 0 ? Math.max(...indices) + 1 : 0;
  }

  deleteFile(tipo: TipoBase, arquivo: string): void {
    const full = path.join(DATA_DIR, tipo, arquivo);
    if (fs.existsSync(full)) fs.unlinkSync(full);
  }

  /**
   * Convert an uploaded ZIP (Receita Federal) to Parquet.
   * Uses stream pipeline for extraction (no memory buffering) +
   * DuckDB latin1 encoding for CSV parsing.
   */
  async *convertZip(
    zipPath: string,
    tipo: TipoBase,
    partIndex: number,
  ): AsyncGenerator<{ stage: string; detail?: string }> {
    const outDir = path.join(DATA_DIR, tipo);
    fs.mkdirSync(outDir, { recursive: true });

    const ts = Date.now();
    const outParquet = path.join(outDir, `part_${partIndex}.parquet`);
    const tmpParquet = path.join(outDir, `_tmp_${ts}.parquet`);
    const tmpRaw     = path.join(outDir, `_tmp_${ts}.csv`);
    const isZip = zipPath.toLowerCase().endsWith('.zip');

    try {
      // Stage 1 — stream raw bytes to temp file (no decoding, no buffering)
      yield { stage: 'extraindo', detail: 'Extraindo arquivo...' };

      if (isZip) {
        const zip = await unzipper.Open.file(zipPath);
        const entry = zip.files.find((f) => !f.path.startsWith('__MACOSX') && f.type === 'File');
        if (!entry) throw new Error('Nenhum arquivo encontrado no ZIP');
        await pipeline(entry.stream(), fs.createWriteStream(tmpRaw));
      } else {
        await pipeline(fs.createReadStream(zipPath), fs.createWriteStream(tmpRaw));
      }

      const csvSize = fs.statSync(tmpRaw).size;
      this.logger.log(`Extraído: ${(csvSize / 1_048_576).toFixed(0)} MB`);

      // Stage 2 — DuckDB reads latin1 CSV → writes to temp Parquet first
      yield { stage: 'convertendo', detail: 'Convertendo para Parquet...' };

      const tmpRawFwd  = tmpRaw.replace(/\\/g, '/');
      const tmpPqFwd   = tmpParquet.replace(/\\/g, '/');

      // Reconnect before heavy COPY TO — the single connection can get into a bad
      // state after large previous operations (especially on Windows).
      this.duck.reconnect();

      await this.duck.run(`
        COPY (
          SELECT * FROM read_csv(
            '${tmpRawFwd}',
            delim=';',
            quote='"',
            encoding='CP1252',
            header=false,
            ignore_errors=true,
            null_padding=true,
            columns=${SCHEMA[tipo]}
          )
        ) TO '${tmpPqFwd}'
        (FORMAT PARQUET, COMPRESSION ZSTD, ROW_GROUP_SIZE 100000)
      `);

      // Stage 3 — count rows (validates the file before committing)
      const countRows = await this.duck.query<{ total: number }>(
        `SELECT COUNT(*) AS total FROM read_parquet('${tmpPqFwd}')`,
      );
      const total = countRows[0]?.total ?? 0;

      // Release file handles before copy (avoids EBUSY on Windows)
      this.duck.reconnect();

      // Copy to final path (avoids EBUSY — DuckDB holds the temp handle on Windows,
      // but copyFileSync writes a fresh file descriptor unrelated to that lock)
      fs.copyFileSync(tmpParquet, outParquet);

      yield { stage: 'concluido', detail: `${Number(total).toLocaleString('pt-BR')} registros` };

    } finally {
      const tryUnlink = (f: string) => { try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch { /* locked on Windows — onModuleInit will clean up */ } };
      tryUnlink(tmpRaw);
      tryUnlink(tmpParquet);
      tryUnlink(zipPath);
    }
  }
}
