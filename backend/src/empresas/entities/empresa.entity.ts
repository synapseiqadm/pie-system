import { Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export const PORTE_LABEL: Record<string, string> = {
  '00': 'Não informado',
  '01': 'Micro Empresa',
  '03': 'Pequeno Porte',
  '05': 'Demais',
  '10': 'Grande',
};

@Entity()
export class Empresa {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index({ unique: true })
  @Column({ length: 8 })
  cnpjBasico!: string;

  @Column()
  razaoSocial!: string;

  @Column({ length: 4, nullable: true })
  naturezaJuridica?: string;

  @Column({ length: 2, nullable: true })
  qualificacaoResponsavel?: string;

  @Column({ type: 'decimal', precision: 18, scale: 2, nullable: true })
  capitalSocial?: number;

  @Column({ length: 2, nullable: true })
  porte?: string;

  @Column({ nullable: true })
  enteFederativo?: string;

  @CreateDateColumn()
  criadoEm!: Date;

  @UpdateDateColumn()
  atualizadoEm!: Date;
}
