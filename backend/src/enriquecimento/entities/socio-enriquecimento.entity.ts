import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, Unique, Index,
} from 'typeorm';

/**
 * Job tracking de enriquecimento de sócio por (cnpj, recorteId).
 * Armazena o sócio-decisor prioritário encontrado e o melhor candidato de email.
 * Dados completos em enrichment_data (module='socio').
 *
 * LGPD: base legal legitimate_interest (prospecção B2B).
 * Campo dnc respeita solicitações de exclusão — nunca exportar dados de PF marcados.
 *
 * Fase 2 (LinkedIn via Apify): não implementada — ver CLAUDE.md §14 débitos.
 */
@Entity('socio_enriquecimento')
@Unique(['cnpj', 'recorteId'])
export class SocioEnriquecimento {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index()
  @Column()
  cnpj!: string;

  @Index()
  @Column()
  recorteId!: number;

  @Column({ nullable: true })
  socioNome?: string;

  @Column({ nullable: true })
  socioQualificacao?: string;

  @Column({ nullable: true })
  socioEmailCandidate?: string;

  @Column({ default: 'low' })
  socioEmailConfidence!: string; // 'low' até confirmação manual

  @Column({ default: false })
  hasCandidate!: boolean;

  @Column({ default: 'legitimate_interest' })
  lgpdBasis!: string;

  @Column({ default: false })
  dnc!: boolean; // Do Not Contact — respeitado em exports e campanhas

  @CreateDateColumn()
  enriquecidoEm!: Date;
}
