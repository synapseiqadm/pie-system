import { IsString, IsNotEmpty, IsOptional, Length, Matches, IsNumber, Min } from 'class-validator';

export class CreateEmpresaDto {
  @IsString()
  @IsNotEmpty()
  @Length(8, 8)
  @Matches(/^\d{8}$/, { message: 'CNPJ básico deve conter exatamente 8 dígitos' })
  cnpjBasico!: string;

  @IsString()
  @IsNotEmpty()
  razaoSocial!: string;

  @IsString()
  @IsOptional()
  naturezaJuridica?: string;

  @IsString()
  @IsOptional()
  qualificacaoResponsavel?: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  capitalSocial?: number;

  @IsString()
  @IsOptional()
  porte?: string;

  @IsString()
  @IsOptional()
  enteFederativo?: string;
}
