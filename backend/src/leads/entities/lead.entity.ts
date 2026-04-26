import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, Unique, Index,
} from 'typeorm';

export type LeadStatus = 'novo' | 'qualificado' | 'contato' | 'descartado' | 'convertido';

@Entity()
@Unique(['cnpj', 'recorteId'])
export class Lead {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index()
  @Column()
  cnpj!: string;

  @Index()
  @Column()
  recorteId!: number;

  @Column({ default: 'novo' })
  status!: LeadStatus;

  @Column({ type: 'text', nullable: true })
  notas?: string;

  @CreateDateColumn()
  criadoEm!: Date;

  @UpdateDateColumn()
  atualizadoEm!: Date;
}
