import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
export class Cnae {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ unique: true, length: 7 })
  codigo!: string;

  @Column()
  descricao!: string;
}
