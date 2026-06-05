import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, Unique, Index,
} from 'typeorm';

export type AddressStatus = 'verificado' | 'suspeito' | 'nao_verificado';

/**
 * Job tracking de enriquecimento de endereço por (cnpj, recorteId).
 * Campos de resumo para UI — dados completos em enrichment_data (module='address').
 */
@Entity('address_enriquecimento')
@Unique(['cnpj', 'recorteId'])
export class AddressEnriquecimento {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index()
  @Column()
  cnpj!: string;

  @Index()
  @Column()
  recorteId!: number;

  @Column({ default: 'nao_verificado' })
  status!: AddressStatus;

  @Column({ type: 'int', default: 0 })
  matchScore!: number;

  @Column({ default: 'unverified' })
  confidence!: string;

  @Column({ nullable: true })
  businessStatus?: string;

  @Column({ nullable: true })
  placesAddress?: string;

  @Column({ nullable: true })
  placesPhone?: string;

  @Column({ type: 'float', nullable: true })
  placesRating?: number;

  @Column({ type: 'int', nullable: true })
  placesReviewsCount?: number;

  @Column({ type: 'boolean', nullable: true })
  placesHasHours?: boolean;

  @CreateDateColumn()
  enriquecidoEm!: Date;
}
