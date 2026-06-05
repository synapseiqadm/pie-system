import {
  Entity, PrimaryGeneratedColumn, Column,
  Index, Unique,
} from 'typeorm';

export type EnrichmentModule     = 'address' | 'contact' | 'digital' | 'socio' | 'outbound';
export type EnrichmentSource     = 'rf' | 'places' | 'scraping' | 'linkedin' | 'manual' | 'apify';
export type EnrichmentConfidence = 'high' | 'medium' | 'low' | 'unverified';
export type EnrichmentStatus     = 'valid' | 'suspect' | 'outdated' | 'manual';

/**
 * Tabela central de enriquecimento — substituiu cnpj_site_cache.
 * Cada linha representa um campo enriquecido de um CNPJ com rastreabilidade completa:
 * fonte, confiança, status e histórico de feedback pós-contato.
 *
 * Módulos implementados:
 *   - digital: site, redes sociais, Google Places (Módulo 3 — Presença Digital)
 *
 * Módulos pendentes (ver CLAUDE.md §débitos):
 *   - address  (Módulo 1 — Endereço, score multi-âncora Places)
 *   - contact  (Módulo 2 — Contato PJ, detecção de contador)
 *   - socio    (Módulo 4 — Sócio)
 *   - outbound (Módulo 5 — Perfil consolidado)
 */
@Entity('enrichment_data')
@Unique(['cnpj', 'module', 'fieldName', 'status'])
@Index(['cnpj', 'module'])
@Index(['status', 'enrichedAt'])
export class EnrichmentData {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ length: 14 })
  cnpj!: string;

  @Column({ type: 'varchar', length: 20 })
  module!: EnrichmentModule;

  @Column({ name: 'field_name', length: 80 })
  fieldName!: string;

  @Column({ name: 'field_value', type: 'text', nullable: true })
  fieldValue?: string;

  @Column({ type: 'varchar', length: 20 })
  source!: EnrichmentSource;

  @Column({ type: 'varchar', length: 20, default: 'unverified' })
  confidence!: EnrichmentConfidence;

  @Column({ type: 'varchar', length: 20, default: 'valid' })
  status!: EnrichmentStatus;

  // Não usa @CreateDateColumn — precisa ser sobrescrito no upsert
  @Column({ name: 'enriched_at', type: 'timestamptz', default: () => 'NOW()' })
  enrichedAt!: Date;

  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy?: string;

  @Column({ name: 'updated_at', type: 'timestamptz', nullable: true })
  updatedAt?: Date;

  @Column({ name: 'invalidation_reason', type: 'text', nullable: true })
  invalidationReason?: string;

  @Column({ name: 'raw_payload', type: 'jsonb', nullable: true })
  rawPayload?: Record<string, unknown>;
}
