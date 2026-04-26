import { Controller, Get, Post, Put, Delete, Body, Param, Query, Res, ParseIntPipe } from '@nestjs/common';
import type { Response } from 'express';
import { RecortesService } from './recortes.service';
import { CreateRecorteDto } from './dto/create-recorte.dto';
import { AiService } from '../ai/ai.service';
import { CnaesService } from '../cnaes/cnaes.service';
import { MunicipiosService } from '../municipios/municipios.service';

@Controller('recortes')
export class RecortesController {
  constructor(
    private readonly service: RecortesService,
    private readonly ai: AiService,
    private readonly cnaes: CnaesService,
    private readonly municipios: MunicipiosService,
  ) {}

  // ── IA ────────────────────────────────────────────────────────────────────

  @Post('ai/sugerir')
  async aiSugerir(@Body('query') query: string) {
    // Tokeniza a query para buscar cada palavra independentemente no banco.
    // Sem isso, "autopeças em itu sp" seria buscado como frase exata e não retornaria nada.
    // Importante: preservar acentos nos tokens — ILIKE no PostgreSQL é case-insensitive
    // mas NÃO accent-insensitive, então "autopecas" não bate com "autopeças" no banco.
    const tokens = (query ?? '')
      .toLowerCase()
      .replace(/[^a-záéíóúàâêîôûãõäëïöüç0-9]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length >= 3); // descarta stopwords curtas ("em", "de", "sp")

    const unique = [...new Set(tokens)];

    if (!unique.length) {
      return this.ai.sugerirFiltros(query, [], []);
    }

    // Busca por token em paralelo para CNAE e municípios
    const [cnaePerToken, muniPerToken] = await Promise.all([
      Promise.all(unique.map(t => this.cnaes.findAll(t, 15))),
      Promise.all(unique.map(t => this.municipios.findAll(t, 10))),
    ]);

    // Achata e deduplica preservando a ordem (tokens mais à esquerda têm prioridade)
    const seenCnae = new Set<string>();
    const cnaesCandidatos = cnaePerToken.flat()
      .filter(c => { if (seenCnae.has(c.codigo)) return false; seenCnae.add(c.codigo); return true; })
      .slice(0, 40);

    const seenMuni = new Set<string>();
    const municipiosCandidatos = muniPerToken.flat()
      .filter(m => { if (seenMuni.has(m.codigo)) return false; seenMuni.add(m.codigo); return true; })
      .slice(0, 20);

    const resultado = await this.ai.sugerirFiltros(query, cnaesCandidatos, municipiosCandidatos);

    // Quando a IA sugere CNAEs sem RAG (lista vazia), valida os códigos contra o banco
    // para remover alucinações. Normaliza formato antes: "45.30-7/02" → "4530702"
    if (cnaesCandidatos.length === 0 && resultado.cnaes.length > 0) {
      resultado.cnaes = resultado.cnaes.map(c => ({
        ...c,
        codigo: c.codigo.replace(/\D/g, ''), // remove qualquer não-dígito
      }));
      const codigos = resultado.cnaes.map(c => c.codigo);
      const validos = await this.cnaes.findByCodigos(codigos);
      const validosMap = new Map(validos.map(v => [v.codigo, v.descricao]));
      resultado.cnaes = resultado.cnaes
        .filter(c => validosMap.has(c.codigo))
        .map(c => ({ ...c, descricao: validosMap.get(c.codigo) ?? c.descricao }));
    }

    return resultado;
  }

  // ── Análise preview (sem salvar) ──────────────────────────────────────────

  @Post('analise-preview')
  analisePreview(@Body('filtros') filtros: Record<string, unknown>) {
    return this.service.analiseFromFiltros((filtros ?? {}) as any);
  }

  // ── CRUD ──────────────────────────────────────────────────────────────────

  @Get()
  findAll() { return this.service.findAll(); }

  @Get('detail/:cnpj')
  detalhe(@Param('cnpj') cnpj: string) { return this.service.detalhe(cnpj); }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) { return this.service.findOne(id); }

  @Post()
  create(@Body() dto: CreateRecorteDto) { return this.service.create(dto); }

  @Put(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: Partial<CreateRecorteDto>) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) { return this.service.remove(id); }

  @Get(':id/analise')
  analise(@Param('id', ParseIntPipe) id: number) { return this.service.analise(id); }

  @Post(':id/executar')
  executar(
    @Param('id', ParseIntPipe) id: number,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.executar(id, page ? Number(page) : 1, limit ? Number(limit) : 50);
  }

  @Get(':id/exportar')
  async exportar(@Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    const recorte = await this.service.findOne(id);
    const filename = `recorte_${id}_${recorte.nome.replace(/[^a-z0-9]/gi, '_')}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.write('\uFEFF'); // BOM para Excel reconhecer UTF-8
    for await (const chunk of this.service.exportarCsv(id)) {
      res.write(chunk);
    }
    res.end();
  }
}
