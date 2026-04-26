import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('import_logs')
export class ImportLog {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  entidade!: string;

  @Column({ type: 'int' })
  registros!: number;

  @Column({ nullable: true })
  erros?: number;

  @CreateDateColumn({ name: 'importado_em' })
  importadoEm!: Date;
}
