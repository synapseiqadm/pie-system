import { IsString, IsNotEmpty, IsOptional, IsEmail, IsBoolean, IsInt, Min, Max, Matches } from 'class-validator';

export class CreateLeadDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{14}$/, { message: 'CNPJ deve conter 14 dígitos numéricos' })
  cnpj!: string;

  @IsString()
  @IsNotEmpty()
  nome!: string;

  @IsString()
  @IsOptional()
  cnae?: string;

  @IsString()
  @IsOptional()
  porte?: string;

  @IsString()
  @IsOptional()
  regiao?: string;

  @IsString()
  @IsOptional()
  website?: string;

  @IsString()
  @IsOptional()
  telefone?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsBoolean()
  @IsOptional()
  isMatriz?: boolean;

  @IsInt()
  @Min(0)
  @Max(100)
  @IsOptional()
  score?: number;
}
