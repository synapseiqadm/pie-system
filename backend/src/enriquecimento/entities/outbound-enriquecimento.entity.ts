import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, Unique, Index,
} from 'typeorm';

export type CanalScore = 'alto' | 'medio' | 'inviavel';

/**
 * Perfil consolidado outbound por (cnpj, recorteId).
 * Agrega os melhores valores dos módulos 1–4 e classifica
 * cada canal de outbound com score ALTO / MÉDIO / INVIÁVEL.
 *
 * Dados completos em enrichment_data (module='outbound').
 * DNC herdado do SocioEnriquecimento — respeitado em exports.
 */
@Entity('outbound_enriquecimento')
@Unique(['cnpj', 'recorteId'])
export class OutboundEnriquecimento {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index()
  @Column()
  cnpj!: string;

  @Index()
  @Column()
  recorteId!: number;

  // ── Contato direto ───────────────────────────────────────────────────────────
  @Column({ nullable: true })
  phoneBest?: string;

  @Column({ nullable: true })
  phoneBestSource?: string;

  @Column({ nullable: true })
  emailBest?: string;

  @Column({ nullable: true })
  emailBestSource?: string;

  @Column({ nullable: true })
  whatsappNumber?: string;

  // ── Endereço e operacionalidade ──────────────────────────────────────────────
  @Column({ type: 'boolean', nullable: true })
  isOperational?: boolean;

  @Column({ nullable: true })
  addressOperational?: string;

  // ── Presença digital ─────────────────────────────────────────────────────────
  @Column({ nullable: true })
  siteUrl?: string;

  @Column({ nullable: true })
  instagramUrl?: string;

  @Column({ nullable: true })
  linkedinCompanyUrl?: string;

  // ── Sócio decisor ────────────────────────────────────────────────────────────
  @Column({ nullable: true })
  socioNome?: string;

  @Column({ nullable: true })
  socioEmailCandidate?: string;

  // ── Canal scores ─────────────────────────────────────────────────────────────
  @Column({ default: 'inviavel' })
  emailScore!: CanalScore;

  @Column({ default: 'inviavel' })
  whatsappScore!: CanalScore;

  @Column({ default: 'inviavel' })
  sdrScore!: CanalScore;

  @Column({ default: 'inviavel' })
  linkedinScore!: CanalScore;

  @Column({ type: 'int', default: 0 })
  outboundScore!: number; // 0–100

  @CreateDateColumn()
  enriquecidoEm!: Date;
}
