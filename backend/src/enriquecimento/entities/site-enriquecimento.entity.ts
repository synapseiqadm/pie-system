import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, Unique, Index,
} from 'typeorm';

export type SiteStatus = 'encontrado' | 'nao_encontrado';

/**
 * Rastreia o estado do job de enriquecimento por (cnpj, recorteId).
 *
 * DÉBITO TÉCNICO — ver CLAUDE.md §14:
 *   Os campos de dados (url, instagramUrl, googlePhone, etc.) são duplicados de
 *   enrichment_data e existem apenas para compatibilidade da UI atual.
 *   Migrar getSiteEnriquecimento / getSiteMap para ler de enrichment_data
 *   e remover esses campos desta entity em sprint futura.
 *
 *   A tabela cnpj_site_cache no Neon está órfã — pode ser dropada a qualquer momento.
 */
@Entity('site_enriquecimento')
@Unique(['cnpj', 'recorteId'])
export class SiteEnriquecimento {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index()
  @Column()
  cnpj!: string;

  @Index()
  @Column()
  recorteId!: number;

  @Column({ nullable: true })
  url?: string;

  @Column({ default: 'nao_encontrado' })
  status!: SiteStatus;

  @Column({ nullable: true })
  slug?: string; // slug que gerou o resultado

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

  // ── Google Places ────────────────────────────────────────────────────────────
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
  confiabilidadeLabel!: string; // 'alto' | 'medio' | 'baixo'

  @CreateDateColumn()
  enriquecidoEm!: Date;
}
