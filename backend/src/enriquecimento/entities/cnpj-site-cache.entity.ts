import { Entity, PrimaryColumn, Column, UpdateDateColumn } from 'typeorm';
import type { SiteStatus } from './site-enriquecimento.entity';

/**
 * Cache global de enriquecimento de site por CNPJ.
 * Compartilhado entre recortes — evita re-processar o mesmo CNPJ em recortes diferentes.
 * TTL configurável via SITE_CACHE_TTL_DAYS (padrão: 30 dias).
 */
@Entity('cnpj_site_cache')
export class CnpjSiteCache {
  @PrimaryColumn()
  cnpj!: string;

  @Column({ default: 'nao_encontrado' })
  status!: SiteStatus;

  @Column({ nullable: true })
  url?: string;

  @Column({ nullable: true })
  slug?: string;

  @Column({ nullable: true })
  instagramUrl?: string;

  @Column({ nullable: true })
  facebookUrl?: string;

  @Column({ nullable: true })
  linkedinUrl?: string;

  @Column({ nullable: true })
  whatsappUrl?: string;

  @Column({ nullable: true })
  reclameaquiUrl?: string;

  @Column({ nullable: true })
  googlePhone?: string;

  @Column({ type: 'float', nullable: true })
  googleRating?: number;

  @Column({ type: 'int', nullable: true })
  googleRatingCount?: number;

  @Column({ nullable: true })
  googleBusinessStatus?: string;

  @Column({ nullable: true })
  googleAddress?: string;

  @Column({ type: 'int', default: 0 })
  confiabilidadeScore!: number;

  @Column({ default: 'baixo' })
  confiabilidadeLabel!: string;

  @UpdateDateColumn()
  cachedAt!: Date;
}
