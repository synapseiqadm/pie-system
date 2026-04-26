import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

@Entity('municipios')
export class Municipio {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index({ unique: true })
  @Column({ length: 7 })
  codigo!: string;

  @Column()
  descricao!: string;
}
