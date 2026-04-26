import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

@Entity('naturezas_juridicas')
export class Natureza {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index({ unique: true })
  @Column({ length: 4 })
  codigo!: string;

  @Column()
  descricao!: string;
}
