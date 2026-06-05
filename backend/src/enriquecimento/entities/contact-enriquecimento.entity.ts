import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, Unique, Index,
} from 'typeorm';

export type ContactQuality = 'direct' | 'third_party' | 'not_found';

/**
 * Job tracking de enriquecimento de contato PJ por (cnpj, recorteId).
 * Campos de resumo para UI — dados completos em enrichment_data (module='contact').
 *
 * Detecção de terceiro baseada em 4 sinais (sem chamadas externas):
 *   1. Domínio free (gmail, hotmail...)
 *   2. Telefone/email compartilhado em >N CNPJs no recorte
 *   3. Domínio sem relação com nome fantasia
 *   4. Telefone/email aparece em CNPJ com CNAE de contabilidade (6920601/6920602)
 */
@Entity('contact_enriquecimento')
@Unique(['cnpj', 'recorteId'])
export class ContactEnriquecimento {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index()
  @Column()
  cnpj!: string;

  @Index()
  @Column()
  recorteId!: number;

  @Column({ type: 'boolean', nullable: true })
  phoneIsThirdParty?: boolean;

  @Column({ nullable: true })
  phoneThirdPartyReason?: string;

  @Column({ nullable: true })
  phoneDirect?: string;

  @Column({ nullable: true })
  phoneDirectSource?: string;

  @Column({ type: 'boolean', nullable: true })
  emailIsThirdParty?: boolean;

  @Column({ nullable: true })
  emailThirdPartyReason?: string;

  @Column({ nullable: true })
  emailCorporate?: string;

  @Column({ nullable: true })
  emailCorporateSource?: string;

  @Column({ default: 'not_found' })
  contactQuality!: ContactQuality;

  @CreateDateColumn()
  enriquecidoEm!: Date;
}
