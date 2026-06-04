import { Injectable } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import * as iconv from 'iconv-lite';
import * as fs from 'fs';
import * as readline from 'readline';
import * as unzipper from 'unzipper';
import { Transform } from 'stream';
import { Empresa } from './entities/empresa.entity';
import { CreateEmpresaDto } from './dto/create-empresa.dto';

const BATCH_SIZE = 2000;

export type ImportProgress = {
  processed: number; inserted: number; updated: number; errors: number; done: boolean;
  percent: number; bytesRead: number; totalBytes: number;
};

@Injectable()
export class EmpresasService {
  constructor(
    @InjectRepository(Empresa)
    private repo: Repository<Empresa>,
    @InjectDataSource() private db: DataSource,
  ) {}

  create(dto: CreateEmpresaDto) {
    return this.repo.save(dto);
  }

  async findAll(search?: string, page = 1, limit = 50): Promise<[Empresa[], number]> {
    const skip = (page - 1) * limit;
    if (search) {
      const like = `%${search}%`;
      const [rows, [{ count }]] = await Promise.all([
        this.db.query<Empresa[]>(
          `SELECT * FROM public.empresa
           WHERE "razaoSocial" ILIKE $1 OR "cnpjBasico" ILIKE $1
           ORDER BY "razaoSocial" LIMIT $2 OFFSET $3`,
          [like, limit, skip],
        ),
        this.db.query<{ count: string }[]>(
          `SELECT COUNT(*)::int AS count FROM public.empresa
           WHERE "razaoSocial" ILIKE $1 OR "cnpjBasico" ILIKE $1`,
          [like],
        ),
      ]);
      return [rows, Number(count)];
    }
    // No search: use fast row estimate instead of COUNT(*)
    const [rows, estimateRows] = await Promise.all([
      this.db.query<Empresa[]>(
        `SELECT * FROM public.empresa ORDER BY "razaoSocial" LIMIT $1 OFFSET $2`,
        [limit, skip],
      ),
      this.db.query<{ estimate: string }[]>(
        `SELECT COALESCE(GREATEST(0, reltuples), 0)::bigint AS estimate FROM pg_class WHERE relname = 'empresa' LIMIT 1`,
      ),
    ]);
    return [rows, Number(estimateRows[0]?.estimate ?? 0)];
  }

  findOne(id: number) {
    return this.repo.findOneBy({ id });
  }

  async update(id: number, dto: Partial<CreateEmpresaDto>) {
    await this.repo.update(id, dto);
    return this.repo.findOneBy({ id });
  }

  remove(id: number) {
    return this.repo.delete(id);
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

      let batch: Partial<Empresa>[] = [];

      const flush = async () => {
        if (batch.length === 0) return;
        try {
          await this.repo.upsert(batch, { conflictPaths: ['cnpjBasico'], skipUpdateIfNoValuesChanged: true });
          inserted += batch.length;
        } catch {
          for (const item of batch) {
            try {
              const existing = await this.repo.findOneBy({ cnpjBasico: item.cnpjBasico! });
              if (existing) { await this.repo.update(existing.id, item); updated++; }
              else { await this.repo.save(item); inserted++; }
            } catch { errors++; }
          }
        }
        processed += batch.length;
        onProgress(prog());
        batch = [];
      };

      const decoded = rawStream.pipe(counter).pipe(iconv.decodeStream('win1252'));
      const rl = readline.createInterface({ input: decoded, crlfDelay: Infinity });

      for await (const line of rl) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const cols = trimmed.split(';').map((c) => c.replace(/^"|"$/g, '').trim());
          if (cols.length < 2) continue;
          const cnpjBasico = cols[0];
          if (!/^\d{8}$/.test(cnpjBasico)) continue;
          const razaoSocial = cols[1];
          if (!razaoSocial) continue;
          const capitalSocial = parseFloat(cols[4]?.replace(',', '.') ?? '0') || 0;
          batch.push({
            cnpjBasico, razaoSocial,
            naturezaJuridica: cols[2] || undefined,
            qualificacaoResponsavel: cols[3] || undefined,
            capitalSocial,
            porte: cols[5] || undefined,
            enteFederativo: cols[6] || undefined,
          });
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
