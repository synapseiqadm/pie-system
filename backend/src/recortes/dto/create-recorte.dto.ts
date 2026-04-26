import { IsString, IsOptional, IsObject } from 'class-validator';

export class CreateRecorteDto {
  @IsString()
  nome: string;

  @IsOptional()
  @IsString()
  descricao?: string;

  @IsOptional()
  @IsObject()
  filtros?: {
    ufs?: string[]; cnaes?: string[]; situacoes?: string[];
    municipios?: string[]; bairros?: string[];
    portes?: string[]; naturezas?: string[];
    capitalMin?: number; capitalMax?: number; enrichLimit?: number;
  };
}
