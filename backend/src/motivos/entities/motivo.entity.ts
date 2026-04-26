import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

@Entity('motivos')
export class Motivo {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index({ unique: true })
  @Column({ length: 2 })
  codigo!: string;

  @Column()
  descricao!: string;
}
