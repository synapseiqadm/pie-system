import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Lead } from '../../leads/entities/lead.entity';
import { Tenant } from '../../tenants/entities/tenant.entity';

export enum PipelineStage {
  NOVO = 'novo',
  CONTATO = 'contato',
  QUALIFICADO = 'qualificado',
  PROPOSTA = 'proposta',
  SELL_OUT = 'sell_out',
}

@Entity()
export class Opportunity {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => Lead, { eager: true })
  lead!: Lead;

  @ManyToOne(() => Tenant, { eager: true })
  tenant!: Tenant;

  @Column({ type: 'enum', enum: PipelineStage, default: PipelineStage.NOVO })
  stage!: PipelineStage;

  @Column({ nullable: true })
  oferta?: string;

  @Column({ nullable: true })
  canal?: string;

  @Column({ type: 'int', nullable: true })
  score?: number;

  @Column({ nullable: true })
  motivoPerda?: string;

  @CreateDateColumn()
  criadoEm!: Date;

  @UpdateDateColumn()
  atualizadoEm!: Date;
}
