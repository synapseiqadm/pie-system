import { IsString, IsNotEmpty, Length, Matches } from 'class-validator';

export class CreateCnaeDto {
  @IsString()
  @IsNotEmpty()
  @Length(7, 7)
  @Matches(/^\d{7}$/, { message: 'Código CNAE deve conter exatamente 7 dígitos numéricos' })
  codigo!: string;

  @IsString()
  @IsNotEmpty()
  descricao!: string;
}
