import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, Unique, Index,
} from 'typeorm';

export type SiteStatus = 'encontrado' | 'nao_encontrado';

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

  @CreateDateColumn()
  enriquecidoEm!: Date;
}
