import { Injectable, Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';

export type SugestaoFiltros = {
  cnaes:      { codigo: string; descricao: string; justificativa: string }[];
  ufs:        string[];
  municipios: { codigo: string; descricao: string }[];
  bairros:    string[];
  situacoes:  string[];
};

const UFS_VALIDAS =
  'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO';

// ── Rate limiter simples (sliding window) ─────────────────────────────────────
class RateLimiter {
  private readonly timestamps: number[] = [];
  constructor(private readonly maxPerMinute: number) {}

  async throttle(): Promise<void> {
    const now = Date.now();
    // Remove chamadas com mais de 60 segundos
    while (this.timestamps.length && now - this.timestamps[0] >= 60_000) {
      this.timestamps.shift();
    }
    if (this.timestamps.length >= this.maxPerMinute) {
      // Aguarda até a chamada mais antiga completar 60s
      const waitMs = 60_000 - (now - this.timestamps[0]) + 50;
      await new Promise(r => setTimeout(r, waitMs));
      return this.throttle(); // re-verifica após espera
    }
    this.timestamps.push(now);
  }
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly client: Anthropic | null;
  private readonly limiter = new RateLimiter(40); // 40 RPM — margem abaixo do limite de 50

  constructor() {
    this.client = process.env.ANTHROPIC_API_KEY
      ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
      : null;

    if (!this.client) {
      this.logger.warn('ANTHROPIC_API_KEY não configurada — IA desativada, usando fallbacks textuais');
    }
  }

  get enabled() { return !!this.client; }

  // ── Sugerir filtros para recorte ──────────────────────────────────────────

  async sugerirFiltros(
    query: string,
    cnaesCandidatos: { codigo: string; descricao: string }[],
    municipiosCandidatos: { codigo: string; descricao: string }[],
  ): Promise<SugestaoFiltros> {
    if (!this.client) {
      return {
        cnaes: cnaesCandidatos.slice(0, 5).map(c => ({ ...c, justificativa: 'sugestão por busca textual' })),
        ufs: [], municipios: [], bairros: [], situacoes: ['02'],
      };
    }

    const temCnaes = cnaesCandidatos.length > 0;
    const temMunis = municipiosCandidatos.length > 0;

    const cnaeBloco = temCnaes
      ? `CNAEs encontrados na base para este perfil (use preferencialmente estes):\n${cnaesCandidatos.map(c => `${c.codigo} - ${c.descricao}`).join('\n')}`
      : `Nenhum CNAE foi pré-filtrado pelo banco. Use seu conhecimento completo da tabela CNAE brasileira.
Você conhece bem a tabela — mapeie o setor descrito para todos os CNAEs relevantes:
- Inclua fabricação, comércio (atacado e varejo) E serviços quando aplicável ao setor
- Retorne de 8 a 20 CNAEs; para setores amplos, cubra as principais subdivisões
- Formato obrigatório: exatamente 7 dígitos, sem pontos, hífens ou barras (ex: "4530702", nunca "45.30-7/02")
- Exemplos de mapeamento correto:
  "autopeças" → 4530701 (atacado peças), 4530702 (varejo peças), 4520001 (manutenção mecânica)
  "panificadora" → 1071600 (fabricação pão), 4721102 (padaria/confeitaria)
  "industrias" → CNAEs da seção C (1xxxxxx a 3xxxxxx), priorizando os mais frequentes no Brasil`;

    const muniBloco = temMunis
      ? `Municípios encontrados na base (use APENAS estes):\n${municipiosCandidatos.map(m => `${m.codigo} - ${m.descricao}`).join('\n')}`
      : `Nenhum município foi pré-filtrado. Se o texto mencionar uma cidade específica, retorne array vazio em municipios (o usuário pode buscar manualmente).`;

    const prompt = `Você é especialista em segmentação de empresas brasileiras via CNPJ.
O usuário quer encontrar empresas com o seguinte perfil: "${query}"

Analise o perfil de forma integrada: infira simultaneamente a atividade econômica (CNAEs) e a localização (UFs, municípios, bairros) que melhor representam o segmento descrito. Considere que:
- Um segmento pode ser nacional (sem restrição geográfica) ou geograficamente específico
- O mesmo texto pode conter pistas tanto de setor quanto de localidade (ex: "padarias no Centro do Recife" → CNAE de panificação + PE + Recife + bairro Centro)
- Prefira CNAEs mais específicos quando possível; inclua CNAEs secundários relacionados se relevante

${cnaeBloco}

${muniBloco}

UFs brasileiras válidas: ${UFS_VALIDAS}

Retorne APENAS JSON válido (sem markdown, sem explicações):
{"cnaes":[{"codigo":"","descricao":"","justificativa":""}],"ufs":[],"municipios":[{"codigo":"","descricao":""}],"bairros":[],"situacoes":["02"]}

Regras:
- ufs: quando o município for identificado, inclua também a UF correspondente
- bairros: extraia do texto do usuário, normalize para minúsculas sem acentos
- situacoes: default ["02"] (Ativa) salvo instrução contrária do usuário
- Se não houver informação para um campo, retorne array vazio`;

    try {
      await this.limiter.throttle();
      const msg = await this.client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2048,
        messages: [{ role: 'user', content: prompt }],
      });

      const text = msg.content.find(b => b.type === 'text')?.text ?? '';
      const json = text.match(/\{[\s\S]*\}/)?.[0];
      if (!json) throw new Error('Resposta sem JSON');
      return JSON.parse(json) as SugestaoFiltros;
    } catch (err: any) {
      this.logger.error(`sugerirFiltros falhou: ${err?.message}`);
      return {
        cnaes: cnaesCandidatos.slice(0, 5).map(c => ({ ...c, justificativa: 'sugestão por busca textual' })),
        ufs: [], municipios: [], bairros: [], situacoes: ['02'],
      };
    }
  }

  // ── Gerar candidatos de domínio para enriquecimento de site ───────────────

  async gerarCandidatosSite(
    nome: string,
    cnae: string,
    municipio: string,
    uf: string,
  ): Promise<string[]> {
    if (!this.client) return [];

    const prompt = `Gere até 5 nomes de domínio prováveis para esta empresa brasileira.
Retorne APENAS um JSON array de domínios (sem protocolo, sem www, sem explicações).

Nome: ${nome}
CNAE: ${cnae}
Município: ${municipio} - ${uf}

Exemplo de resposta: ["restaurantedomjose.com.br","domjose.com.br","rdomjose.com.br"]

Considere: abreviações comuns, nome de fantasia, variações sem sufixos legais (ltda, me, etc).
Máximo 5 domínios. Não inclua provedores genéricos de hospedagem.`;

    try {
      await this.limiter.throttle();
      const msg = await this.client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 256,
        messages: [{ role: 'user', content: prompt }],
      });

      const text = msg.content.find(b => b.type === 'text')?.text ?? '';
      // Use non-greedy match to avoid spanning across multiple arrays or trailing content
      const json = text.match(/\[[\s\S]*?\]/)?.[0];
      if (!json) return [];
      const arr = JSON.parse(json);
      return Array.isArray(arr) ? arr.filter((d: unknown) => typeof d === 'string') : [];
    } catch (err: any) {
      this.logger.error(`gerarCandidatosSite falhou: ${err?.message}`);
      return [];
    }
  }

  // ── Validar se página pertence à empresa ─────────────────────────────────

  async validarSite(
    url: string,
    titulo: string,
    descricao: string,
    nome: string,
    cnpj: string,
  ): Promise<boolean> {
    if (!this.client) return true; // sem IA, aceita qualquer HTTP 200

    if (!titulo && !descricao) return true; // sem conteúdo para validar

    const prompt = `Este site pertence à empresa listada abaixo? Responda APENAS "sim" ou "nao".

Empresa: ${nome}
CNPJ: ${cnpj}

Site encontrado:
URL: ${url}
Título: ${titulo}
Descrição: ${descricao}`;

    try {
      await this.limiter.throttle();
      const msg = await this.client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 16,
        messages: [{ role: 'user', content: prompt }],
      });

      const text = msg.content.find(b => b.type === 'text')?.text?.toLowerCase().trim() ?? '';
      return text.startsWith('sim');
    } catch (err: any) {
      this.logger.error(`validarSite falhou: ${err?.message}`);
      return true; // em caso de erro, não bloqueia
    }
  }
}
