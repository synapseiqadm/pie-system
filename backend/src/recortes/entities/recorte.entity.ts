import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export type FiltrosRecorte = {
  ufs?: string[];
  cnaes?: string[];
  situacoes?: string[];
  municipios?: string[];
  bairros?: string[];
  portes?: string[];       // 'MEI' (natureza 2135) · '01' ME · '03' EPP · '05' Demais
  naturezas?: string[];    // códigos de natureza jurídica (ex: '2305' LTDA, '2062' SA)
  capitalMin?: number;     // capital social mínimo (R$)
  capitalMax?: number;     // capital social máximo (R$)
  enrichLimit?: number;    // máx registros para enriquecer (amostragem)
};

@Entity('recortes')
export class Recorte {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  nome: string;

  @Column({ nullable: true })
  descricao?: string;

  @Column({ type: 'jsonb', default: '{}' })
  filtros: FiltrosRecorte;

  @Column({ nullable: true, name: 'total_cached' })
  totalCached?: number;

  @CreateDateColumn({ name: 'criado_em' })
  criadoEm: Date;

  @UpdateDateColumn({ name: 'atualizado_em' })
  atualizadoEm: Date;

  @Column({ nullable: true, name: 'executado_em' })
  executadoEm?: Date;
}
