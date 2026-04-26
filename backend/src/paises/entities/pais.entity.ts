import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

@Entity('paises')
export class Pais {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index({ unique: true })
  @Column({ length: 3 })
  codigo!: string;

  @Column()
  descricao!: string;
}
