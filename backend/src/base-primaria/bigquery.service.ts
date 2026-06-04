import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { BigQuery } from '@google-cloud/bigquery';

@Injectable()
export class BigQueryService implements OnModuleInit {
  private readonly logger = new Logger(BigQueryService.name);
  private bq: BigQuery;

  readonly project = process.env.GOOGLE_CLOUD_PROJECT_ID ?? '';
  readonly dataset = process.env.BIGQUERY_DATASET ?? 'receita_federal';

  onModuleInit() {
    this.bq = new BigQuery({
      projectId: this.project,
      credentials: JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON ?? '{}'),
    });
    this.logger.log('BigQuery client inicializado');
  }

  table(name: string): string {
    return `\`${this.project}.${this.dataset}.${name}\``;
  }

  async query<T = Record<string, unknown>>(sql: string): Promise<T[]> {
    const [rows] = await this.bq.query({ query: sql, useLegacySql: false });
    return rows as T[];
  }
}
