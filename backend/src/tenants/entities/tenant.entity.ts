import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity()
export class Tenant {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ unique: true })
  nome!: string;

  @Column({ nullable: true })
  descricao?: string;

  @CreateDateColumn()
  criadoEm!: Date;
}
