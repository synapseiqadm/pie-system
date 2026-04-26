import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import * as duckdb from 'duckdb';

@Injectable()
export class DuckDbService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DuckDbService.name);
  private db: duckdb.Database;
  private conn: duckdb.Connection;

  onModuleInit() {
    this.db = new duckdb.Database(':memory:');
    this.conn = this.db.connect();
    this.logger.log('DuckDB inicializado');
  }

  onModuleDestroy() {
    try { this.conn.close(); } catch {}
    try { this.db.close(); } catch {}
  }

  /** Close and reopen the connection to flush all file handles (needed on Windows after COPY TO). */
  reconnect() {
    try { this.conn.close(); } catch {}
    this.conn = this.db.connect();
  }

  query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
    return new Promise((resolve, reject) => {
      (this.conn.all as any)(sql, ...params, (err: Error | null, rows: T[]) => {
        if (err) reject(err);
        else resolve(rows ?? []);
      });
    });
  }

  run(sql: string, params: unknown[] = []): Promise<void> {
    return new Promise((resolve, reject) => {
      (this.conn.run as any)(sql, ...params, (err: Error | null) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
}
