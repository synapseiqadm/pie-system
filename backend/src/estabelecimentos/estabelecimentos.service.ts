import { Injectable } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, ILike, DataSource } from 'typeorm';
import * as iconv from 'iconv-lite';
import * as fs from 'fs';
import * as readline from 'readline';
import * as unzipper from 'unzipper';
import { Transform } from 'stream';
import { Estabelecimento } from './entities/estabelecimento.entity';

const BATCH_SIZE = 2000;

export type ImportProgress = {
  processed: number; inserted: number; updated: number; errors: number; done: boolean;
  percent: number; bytesRead: number; totalBytes: number;
};

// Safe column accessor: returns empty string if index out of bounds
function col(cols: string[], i: number): string {
  return (cols[i] ?? '').trim().replace(/^"(.*)"$/, '$1').trim();
}

// Truncate to max length, return undefined if empty
function str(v: string, max: number): string | undefined {
  const s = v.slice(0, max);
  return s || undefined;
}

function parseLine(line: string): Partial<Estabelecimento> | null {
  // Split on ; — don't strip quotes here, col() handles it per field
  const cols = line.split(';');

  // Need at minimum the 3 CNPJ columns
  if (cols.length < 3) return null;

  const cnpjBasico = col(cols, 0).replace(/\D/g, '').padStart(8, '0').slice(0, 8);
  const cnpjOrdem  = col(cols, 1).replace(/\D/g, '').padStart(4, '0').slice(0, 4);
  const cnpjDv     = col(cols, 2).replace(/\D/g, '').padStart(2, '0').slice(0, 2);

  // Reject if CNPJ parts aren't numeric after cleaning
  if (!/^\d{8}$/.test(cnpjBasico) || !/^\d{4}$/.test(cnpjOrdem) || !/^\d{2}$/.test(cnpjDv)) return null;

  const cnpjCompleto = cnpjBasico + cnpjOrdem + cnpjDv;

  return {
    cnpjBasico, cnpjOrdem, cnpjDv, cnpjCompleto,
    identificadorMatrizFilial: str(col(cols,  3), 1),
    nomeFantasia:              str(col(cols,  4), 255),
    situacaoCadastral:         str(col(cols,  5), 2),
    dataSituacaoCadastral:     str(col(cols,  6), 8),
    motivoSituacaoCadastral:   str(col(cols,  7), 2),
    nomeCidadeExterior:        str(col(cols,  8), 255),
    codigoPais:                str(col(cols,  9), 3),
    dataInicioAtividade:       str(col(cols, 10), 8),
    cnaePrincipal:             str(col(cols, 11), 7),
    cnaeSecundarios:           col(cols, 12) || undefined,   // text, no limit
    tipoLogradouro:            str(col(cols, 13), 255),
    logradouro:                str(col(cols, 14), 255),
    numero:                    str(col(cols, 15), 255),
    complemento:               str(col(cols, 16), 255),
    bairro:                    str(col(cols, 17), 255),
    cep:                       str(col(cols, 18), 8),
    uf:                        str(col(cols, 19), 2),
    codigoMunicipio:           str(col(cols, 20), 7),
    ddd1:                      str(col(cols, 21), 4),
    telefone1:                 str(col(cols, 22), 9),
    ddd2:                      str(col(cols, 23), 4),
    telefone2:                 str(col(cols, 24), 9),
    dddFax:                    str(col(cols, 25), 4),
    fax:                       str(col(cols, 26), 9),
    email:                     str(col(cols, 27), 255),
    situacaoEspecial:          str(col(cols, 28), 255),
    dataSituacaoEspecial:      str(col(cols, 29), 8),
  };
}

@Injectable()
export class EstabelecimentosService {
  constructor(
    @InjectRepository(Estabelecimento)
    private readonly repo: Repository<Estabelecimento>,
    @InjectDataSource() private readonly db: DataSource,
  ) {}

  async findAll(search?: string, page = 1, limit = 50): Promise<[Estabelecimento[], number]> {
    const skip = (page - 1) * limit;
    if (search) {
      const like = `%${search}%`;
      const [rows, [{ count }]] = await Promise.all([
        this.repo.find({
          where: [
            { cnpjCompleto: ILike(like) },
            { nomeFantasia: ILike(like) },
            { cnpjBasico: ILike(like) },
          ],
          skip, take: limit, order: { cnpjCompleto: 'ASC' },
        }),
        this.db.query<{ count: string }[]>(
          `SELECT COUNT(*)::int AS count FROM estabelecimentos
           WHERE cnpj_completo ILIKE $1 OR nome_fantasia ILIKE $1 OR cnpj_basico ILIKE $1`,
          [like],
        ),
      ]);
      return [rows, Number(count)];
    }
    // No search: fast row estimate from pg_class
    const [rows, [{ estimate }]] = await Promise.all([
      this.repo.find({ skip, take: limit, order: { cnpjCompleto: 'ASC' } }),
      this.db.query<{ estimate: string }[]>(
        `SELECT GREATEST(0, reltuples)::bigint AS estimate FROM pg_class WHERE relname = 'estabelecimentos'`,
      ),
    ]);
    return [rows, Number(estimate)];
  }

  async findOne(id: number): Promise<Estabelecimento | null> {
    return this.repo.findOneBy({ id });
  }

  async create(data: Partial<Estabelecimento>): Promise<Estabelecimento> {
    return this.repo.save(this.repo.create(data));
  }

  async update(id: number, data: Partial<Estabelecimento>): Promise<Estabelecimento | null> {
    await this.repo.update(id, data);
    return this.repo.findOneBy({ id });
  }

  async remove(id: number): Promise<void> {
    await this.repo.delete(id);
  }

  private async upsertBatch(batch: Partial<Estabelecimento>[]): Promise<{ inserted: number; updated: number }> {
    if (batch.length === 0) return { inserted: 0, updated: 0 };

    const COLS = [
      'cnpj_basico', 'cnpj_ordem', 'cnpj_dv', 'cnpj_completo',
      'identificador_matriz_filial', 'nome_fantasia', 'situacao_cadastral',
      'data_situacao_cadastral', 'motivo_situacao_cadastral', 'nome_cidade_exterior',
      'codigo_pais', 'data_inicio_atividade', 'cnae_fiscal_principal', 'cnae_fiscal_secundaria',
      'tipo_logradouro', 'logradouro', 'numero', 'complemento', 'bairro', 'cep',
      'uf', 'codigo_municipio', 'ddd_1', 'telefone_1', 'ddd_2', 'telefone_2',
      'ddd_fax', 'fax', 'correio_eletronico', 'situacao_especial', 'data_situacao_especial',
    ] as const;

    const COL_TO_PROP: Record<string, keyof Partial<Estabelecimento>> = {
      'cnpj_basico': 'cnpjBasico', 'cnpj_ordem': 'cnpjOrdem', 'cnpj_dv': 'cnpjDv',
      'cnpj_completo': 'cnpjCompleto', 'identificador_matriz_filial': 'identificadorMatrizFilial',
      'nome_fantasia': 'nomeFantasia', 'situacao_cadastral': 'situacaoCadastral',
      'data_situacao_cadastral': 'dataSituacaoCadastral', 'motivo_situacao_cadastral': 'motivoSituacaoCadastral',
      'nome_cidade_exterior': 'nomeCidadeExterior', 'codigo_pais': 'codigoPais',
      'data_inicio_atividade': 'dataInicioAtividade', 'cnae_fiscal_principal': 'cnaePrincipal',
      'cnae_fiscal_secundaria': 'cnaeSecundarios', 'tipo_logradouro': 'tipoLogradouro',
      'logradouro': 'logradouro', 'numero': 'numero', 'complemento': 'complemento',
      'bairro': 'bairro', 'cep': 'cep', 'uf': 'uf', 'codigo_municipio': 'codigoMunicipio',
      'ddd_1': 'ddd1', 'telefone_1': 'telefone1', 'ddd_2': 'ddd2', 'telefone_2': 'telefone2',
      'ddd_fax': 'dddFax', 'fax': 'fax', 'correio_eletronico': 'email',
      'situacao_especial': 'situacaoEspecial', 'data_situacao_especial': 'dataSituacaoEspecial',
    };

    const UPDATE_COLS = COLS.filter((c) => c !== 'cnpj_basico' && c !== 'cnpj_completo' && c !== 'cnpj_ordem' && c !== 'cnpj_dv');

    const values: unknown[] = [];
    const rows = batch.map((record, i) => {
      const base = i * COLS.length;
      COLS.forEach((col) => values.push((record as Record<string, unknown>)[COL_TO_PROP[col]] ?? null));
      return `(${COLS.map((_, j) => `$${base + j + 1}`).join(',')})`;
    });

    const sql = `
      INSERT INTO estabelecimentos (${COLS.join(',')})
      VALUES ${rows.join(',')}
      ON CONFLICT (cnpj_completo) DO UPDATE SET
      ${UPDATE_COLS.map((c) => `${c} = EXCLUDED.${c}`).join(',')}
      RETURNING (xmax = 0) AS is_insert
    `;

    const result: { is_insert: boolean }[] = await this.repo.query(sql, values);
    const inserted = result.filter((r) => r.is_insert).length;
    return { inserted, updated: result.length - inserted };
  }

  async importFromFile(
    filePath: string,
    onProgress: (p: ImportProgress) => void,
    shouldStop: () => boolean = () => false,
  ): Promise<void> {
    const isZip = filePath.toLowerCase().endsWith('.zip');
    let inserted = 0;
    let updated = 0;
    let errors = 0;
    let processed = 0;

    const processStream = async (rawStream: NodeJS.ReadableStream, totalBytes: number) => {
      let bytesRead = 0;

      const counter = new Transform({
        transform(chunk: Buffer, _enc, cb) { bytesRead += chunk.length; cb(null, chunk); },
      });

      const prog = (): ImportProgress => ({
        processed, inserted, updated, errors, done: false,
        bytesRead, totalBytes,
        percent: totalBytes > 0 ? Math.min(99, Math.round(bytesRead / totalBytes * 100)) : 0,
      });

      const batch: Partial<Estabelecimento>[] = [];

      const flush = async () => {
        if (batch.length === 0) return;
        try {
          const counts = await this.upsertBatch(batch);
          inserted += counts.inserted;
          updated += counts.updated;
        } catch (batchErr: any) {
          for (const record of batch) {
            try {
              const counts = await this.upsertBatch([record]);
              inserted += counts.inserted;
              updated += counts.updated;
            } catch (rowErr: any) {
              errors++;
              console.error(`[estab] cnpj=${record.cnpjCompleto} — ${rowErr?.message}`);
            }
          }
        }
        processed += batch.length;
        onProgress(prog());
        batch.length = 0;
      };

      const decoded = rawStream.pipe(counter).pipe(iconv.decodeStream('win1252'));
      const rl = readline.createInterface({ input: decoded, crlfDelay: Infinity });

      for await (const line of rl) {
        if (!line.trim()) continue;
        try {
          const record = parseLine(line);
          if (!record) { errors++; continue; }
          batch.push(record);
          if (batch.length >= BATCH_SIZE) {
            await flush();
            if (shouldStop()) { rl.close(); break; }
          }
        } catch { errors++; }
      }

      await flush();
    };

    if (isZip) {
      const zip = await unzipper.Open.file(filePath);
      const entry = zip.files.find((f) => !f.path.startsWith('__MACOSX') && f.type === 'File');
      if (!entry) throw new Error('Nenhum arquivo encontrado no ZIP');
      await processStream(entry.stream(), entry.uncompressedSize);
    } else {
      const totalBytes = fs.statSync(filePath).size;
      await processStream(fs.createReadStream(filePath), totalBytes);
    }

    fs.unlink(filePath, () => { /* cleanup */ });
    onProgress({ processed, inserted, updated, errors, done: true, percent: 100, bytesRead: 0, totalBytes: 0 });
  }
}
