import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('impactos_lead')
@Index(['cnpj'])
@Index(['impactadoEm'])
@Index(['cnpj', 'impactadoEm'])
export class ImpactoLead {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  cnpj: string;

  @Column()
  canal: string; // whatsapp | email | sms | ligacao

  @Column({ nullable: true, name: 'campanha_nome' })
  campanhaNome?: string;

  @Column({ nullable: true, name: 'recorte_nome' })
  recorteNome?: string;

  @Column({ nullable: true, name: 'recorte_id' })
  recorteId?: number;

  @CreateDateColumn({ name: 'impactado_em' })
  impactadoEm: Date;
}
