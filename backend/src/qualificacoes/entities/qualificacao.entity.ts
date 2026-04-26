import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

@Entity('qualificacoes')
export class Qualificacao {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index({ unique: true })
  @Column({ length: 2 })
  codigo!: string;

  @Column()
  descricao!: string;
}
