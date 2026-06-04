import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as unzipper from 'unzipper';
import { pipeline } from 'stream/promises';
import { Storage } from '@google-cloud/storage';
import { BigQuery } from '@google-cloud/bigquery';
import { BigQueryService } from './bigquery.service';

export type TipoBase = 'estabelecimentos' | 'empresas' | 'socios';

@Injectable()
export class BigQueryUploadService implements OnModuleInit {
  private readonly logger = new Logger(BigQueryUploadService.name);
  private storage: Storage;
  private bq: BigQuery;
  private readonly bucket = process.env.GCS_BUCKET ?? 'pie-receita-uploads';

  constructor(private readonly bqService: BigQueryService) {}

  onModuleInit() {
    const credentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON ?? '{}');
    this.storage = new Storage({ projectId: this.bqService.project, credentials });
    this.bq = new BigQuery({ projectId: this.bqService.project, credentials });
  }

  // Compatibilidade com a API anterior — não é mais relevante com BQ
  nextPartIndex(_tipo: TipoBase): number {
    return 0;
  }

  async *convertZip(
    zipPath: string,
    tipo: TipoBase,
    _partIndex: number,
  ): AsyncGenerator<{ stage: string; detail?: string }> {
    const ts = Date.now();
    const tmpRaw = path.join(os.tmpdir(), `_tmp_${ts}.csv`);
    const isZip = zipPath.toLowerCase().endsWith('.zip');
    const gcsPath = `${tipo}/_upload_${ts}.csv`;

    try {
      // Estágio 1 — extrair ZIP para CSV temp
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

      // Estágio 2 — upload para GCS
      yield { stage: 'enviando', detail: 'Enviando para GCS...' };

      await this.storage.bucket(this.bucket).upload(tmpRaw, {
        destination: gcsPath,
        metadata: { contentType: 'text/csv' },
      });

      // Estágio 3 — BQ Load Job (WRITE_TRUNCATE = idempotente)
      yield { stage: 'carregando', detail: 'Carregando no BigQuery...' };

      const [job] = await this.bq
        .dataset(this.bqService.dataset)
        .table(tipo)
        .load(`gs://${this.bucket}/${gcsPath}`, {
          sourceFormat: 'CSV',
          fieldDelimiter: ';',
          encoding: 'ISO-8859-1',
          maxBadRecords: 100,
          writeDisposition: 'WRITE_TRUNCATE',
          skipLeadingRows: 0,
        } as any);

      const errors = (job as any).status?.errors;
      if (errors?.length) throw new Error(`BQ Load Job falhou: ${JSON.stringify(errors[0])}`);

      const [meta] = await this.bq.dataset(this.bqService.dataset).table(tipo).getMetadata();
      const total = Number(meta.numRows ?? 0);

      yield { stage: 'concluido', detail: `${total.toLocaleString('pt-BR')} registros` };

    } finally {
      const tryUnlink = (f: string) => { try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch {} };
      tryUnlink(tmpRaw);
      tryUnlink(zipPath);
      try { await this.storage.bucket(this.bucket).file(gcsPath).delete({ ignoreNotFound: true }); } catch {}
    }
  }
}
