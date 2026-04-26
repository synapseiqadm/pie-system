import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

@Entity('estabelecimentos')
export class Estabelecimento {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index()
  @Column({ name: 'cnpj_basico', length: 8 })
  cnpjBasico!: string;

  @Column({ name: 'cnpj_ordem', length: 4 })
  cnpjOrdem!: string;

  @Column({ name: 'cnpj_dv', length: 2 })
  cnpjDv!: string;

  @Index({ unique: true })
  @Column({ name: 'cnpj_completo', length: 14 })
  cnpjCompleto!: string;

  @Column({ name: 'identificador_matriz_filial', length: 1, nullable: true })
  identificadorMatrizFilial?: string;

  @Column({ name: 'nome_fantasia', nullable: true })
  nomeFantasia?: string;

  @Column({ name: 'situacao_cadastral', length: 2, nullable: true })
  situacaoCadastral?: string;

  @Column({ name: 'data_situacao_cadastral', length: 8, nullable: true })
  dataSituacaoCadastral?: string;

  @Column({ name: 'motivo_situacao_cadastral', length: 2, nullable: true })
  motivoSituacaoCadastral?: string;

  @Column({ name: 'nome_cidade_exterior', nullable: true })
  nomeCidadeExterior?: string;

  @Column({ name: 'codigo_pais', length: 3, nullable: true })
  codigoPais?: string;

  @Column({ name: 'data_inicio_atividade', length: 8, nullable: true })
  dataInicioAtividade?: string;

  @Column({ name: 'cnae_fiscal_principal', length: 7, nullable: true })
  cnaePrincipal?: string;

  @Column({ name: 'cnae_fiscal_secundaria', type: 'text', nullable: true })
  cnaeSecundarios?: string;

  @Column({ name: 'tipo_logradouro', nullable: true })
  tipoLogradouro?: string;

  @Column({ name: 'logradouro', nullable: true })
  logradouro?: string;

  @Column({ name: 'numero', nullable: true })
  numero?: string;

  @Column({ name: 'complemento', nullable: true })
  complemento?: string;

  @Column({ name: 'bairro', nullable: true })
  bairro?: string;

  @Column({ name: 'cep', length: 8, nullable: true })
  cep?: string;

  @Column({ name: 'uf', length: 2, nullable: true })
  uf?: string;

  @Column({ name: 'codigo_municipio', length: 7, nullable: true })
  codigoMunicipio?: string;

  @Column({ name: 'ddd_1', length: 4, nullable: true })
  ddd1?: string;

  @Column({ name: 'telefone_1', length: 9, nullable: true })
  telefone1?: string;

  @Column({ name: 'ddd_2', length: 4, nullable: true })
  ddd2?: string;

  @Column({ name: 'telefone_2', length: 9, nullable: true })
  telefone2?: string;

  @Column({ name: 'ddd_fax', length: 4, nullable: true })
  dddFax?: string;

  @Column({ name: 'fax', length: 9, nullable: true })
  fax?: string;

  @Column({ name: 'correio_eletronico', nullable: true })
  email?: string;

  @Column({ name: 'situacao_especial', nullable: true })
  situacaoEspecial?: string;

  @Column({ name: 'data_situacao_especial', length: 8, nullable: true })
  dataSituacaoEspecial?: string;
}
