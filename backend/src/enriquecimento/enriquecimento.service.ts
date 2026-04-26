import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { RecortesService } from '../recortes/recortes.service';
import { DuckDbService } from '../base-primaria/duckdb.service';
import { ParquetService } from '../base-primaria/parquet.service';
import { SiteEnriquecimento } from './entities/site-enriquecimento.entity';
import { CnpjSiteCache } from './entities/cnpj-site-cache.entity';
import { AiService } from '../ai/ai.service';

export type TipoTelefone = 'celular' | 'fixo' | 'invalido' | 'sem_telefone';

export type PresencaDigital = {
  url?:           string;
  instagramUrl?:  string;
  facebookUrl?:   string;
  linkedinUrl?:   string;
  whatsappUrl?:   string;
  reclameaquiUrl?: string;
  googlePhone?:   string;
  googleRating?:  number;
  googleRatingCount?: number;
  googleBusinessStatus?: string;
  googleAddress?: string;
};

export type TelefoneRow = {
  cnpj: string;
  nome_fantasia: string;
  uf: string;
  ddd: string;
  numero: string;
  telefone_formatado: string;  // (DD) NNNNN-NNNN
  telefone_e164: string;        // +55DDNNNNNNNNN
  tipo: TipoTelefone;
};

export type TelefoneStats = {
  total: number;
  celular: number;
  fixo: number;
  invalido: number;
  sem_telefone: number;
  aproveitamento: number; // % com telefone válido
};

// DDDs válidos no Brasil
const DDDS_VALIDOS = new Set([
  '11','12','13','14','15','16','17','18','19',
  '21','22','24','27','28',
  '31','32','33','34','35','37','38',
  '41','42','43','44','45','46','47','48','49',
  '51','53','54','55',
  '61','62','63','64','65','66','67','68','69',
  '71','73','74','75','77','79',
  '81','82','83','84','85','86','87','88','89',
  '91','92','93','94','95','96','97','98','99',
]);

function classifyPhone(ddd: string, numero: string): TipoTelefone {
  const d = ddd?.trim() ?? '';
  const n = numero?.trim() ?? '';
  if (!n || !d) return 'sem_telefone';
  if (!DDDS_VALIDOS.has(d)) return 'invalido';
  if (n.length === 9 && n.startsWith('9')) return 'celular';
  if (n.length === 8) return 'fixo';
  return 'invalido';
}

function formatPhone(ddd: string, numero: string): string {
  const d = ddd?.trim() ?? '';
  const n = numero?.trim() ?? '';
  if (!d || !n) return '';
  if (n.length === 9) return `(${d}) ${n.slice(0, 5)}-${n.slice(5)}`;
  if (n.length === 8) return `(${d}) ${n.slice(0, 4)}-${n.slice(4)}`;
  return `${d}${n}`;
}

// ── Site enrichment helpers ──────────────────────────────────────────────────

const LEGAL_SUFFIXES = /\b(ltda|me|mei|epp|s\.?a\.?|cia|eireli|ss|lda|microempresa|micro empresa)\b/gi;
const GENERIC_WORDS  = /\b(comercio|comercial|servicos|industria|industrias|group|grupo)\b/gi;

function domainMatchesName(domain: string, nome: string): boolean {
  if (!nome?.trim() || !domain?.trim()) return false;

  const normalize = (s: string) =>
    s.toLowerCase()
     .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
     .replace(/[^a-z0-9]/g, ' ')
     .split(' ').filter(w => w.length > 2);

  const nameTokens = normalize(nome);
  const domainLabel = domain.split('.')[0]; // e.g. "restaurantedomjose" from "restaurantedomjose.com.br"
  return nameTokens.some(t => domainLabel.includes(t));
}

function emailCandidates(email: string, nome: string): string[] {
  if (!email?.trim()) return [];
  const at = email.trim().toLowerCase().lastIndexOf('@');
  if (at < 0) return [];
  const domain = email.trim().toLowerCase().slice(at + 1);
  // Ignore common free providers — not a company domain
  const FREE = ['gmail.com','hotmail.com','outlook.com','yahoo.com','bol.com.br','uol.com.br','terra.com.br','ig.com.br'];
  if (FREE.includes(domain)) return [];
  // Ignore third-party domains (accountant, association, etc.) — no name token overlap
  if (!domainMatchesName(domain, nome)) return [];
  return [`https://${domain}`, `https://www.${domain}`];
}

function slugCandidates(nome: string): string[] {
  if (!nome?.trim()) return [];
  const base = nome
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')   // strip accents
    .replace(LEGAL_SUFFIXES, ' ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ').trim();

  const words = base.split(' ').filter(w => w.length > 1);
  if (!words.length) return [];

  const full     = words.join('');
  const hyphened = words.join('-');
  const short    = words.slice(0, 2).join('');

  const slugs = [...new Set([full, short, hyphened].filter(s => s.length >= 3))];

  const urls: string[] = [];
  for (const s of slugs) {
    urls.push(`https://${s}.com.br`);
    urls.push(`https://www.${s}.com.br`);
    urls.push(`https://${s}.com`);
  }
  return [...new Set(urls)];
}

type PlacesResult = {
  websiteUri?:      string;
  phone?:           string;
  rating?:          number;
  ratingCount?:     number;
  businessStatus?:  string;
  address?:         string;
};

async function fetchGooglePlaces(nome: string, uf: string, apiKey: string): Promise<PlacesResult | null> {
  if (!apiKey?.trim()) return null;
  const query = `${nome}${uf ? ' ' + uf : ''} Brasil`;
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8_000);
  try {
    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'places.websiteUri,places.nationalPhoneNumber,places.rating,places.userRatingCount,places.businessStatus,places.formattedAddress',
      },
      body: JSON.stringify({
        textQuery: query,
        languageCode: 'pt-BR',
        maxResultCount: 1,
        regionCode: 'BR',
      }),
    });
    if (!res.ok) return null;
    const data: { places?: Record<string, unknown>[] } = await res.json();
    const place = data.places?.[0];
    if (!place) return null;
    return {
      websiteUri:     place['websiteUri']            as string | undefined,
      phone:          place['nationalPhoneNumber']   as string | undefined,
      rating:         place['rating']                as number | undefined,
      ratingCount:    place['userRatingCount']       as number | undefined,
      businessStatus: place['businessStatus']        as string | undefined,
      address:        place['formattedAddress']      as string | undefined,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function verifyUrl(url: string): Promise<string | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6_000);
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      signal: ctrl.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PIE-bot/1.0)' },
    });
    if (res.status < 400) return res.url || url;
    // Some servers reject HEAD — retry with GET (first byte only)
    const res2 = await fetch(url, {
      method: 'GET',
      signal: ctrl.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PIE-bot/1.0)', 'Range': 'bytes=0-0' },
    });
    return res2.status < 400 ? (res2.url || url) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

type PageMeta = {
  title: string;
  description: string;
  instagramUrl?: string;
  facebookUrl?: string;
  linkedinUrl?: string;
  whatsappUrl?: string;
};

function firstMatch(html: string, re: RegExp): string | undefined {
  re.lastIndex = 0;
  return re.exec(html)?.[1] ?? undefined;
}

async function fetchPageMeta(url: string): Promise<PageMeta | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8_000);
  try {
    const res = await fetch(url, {
      method: 'GET', signal: ctrl.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PIE-bot/1.0)' },
    });
    if (res.status >= 400) return null;
    const html = await res.text();

    const title = html.match(/<title[^>]*>([^<]{1,200})<\/title>/i)?.[1]?.trim() ?? '';
    const desc  = (
      html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']{0,300})["']/i) ||
      html.match(/<meta[^>]+content=["']([^"']{0,300})["'][^>]+name=["']description["']/i)
    )?.[1]?.trim() ?? '';

    // ── Redes sociais ────────────────────────────────────────────────────────
    const instagramUrl = firstMatch(html,
      /href=["'](https?:\/\/(?:www\.)?instagram\.com\/(?!(?:p|reel|stories|explore|accounts|tv|direct|ar)\/)[a-zA-Z0-9._]{2,30}\/?)['"]/gi,
    );
    const facebookUrl = firstMatch(html,
      /href=["'](https?:\/\/(?:www\.)?(?:fb\.com|facebook\.com)\/(?!(?:sharer|share\.php|login|dialog|watch|events|groups\/discover)(?:[\/?]|$))[a-zA-Z0-9._/-]{2,100})['"]/gi,
    );
    const linkedinUrl = firstMatch(html,
      /href=["'](https?:\/\/(?:www\.)?linkedin\.com\/company\/[a-zA-Z0-9._-]{2,100}\/?)['"]/gi,
    );
    const whatsappUrl = firstMatch(html,
      /href=["'](https?:\/\/(?:wa\.me\/\+?[\d]+|api\.whatsapp\.com\/send\?[^"'&]{1,200}|web\.whatsapp\.com\/send\?[^"']{1,200}))['"]/gi,
    );

    return { title, description: desc, instagramUrl, facebookUrl, linkedinUrl, whatsappUrl };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function findReclameAqui(nome: string): Promise<string | null> {
  if (!nome?.trim()) return null;
  const base = nome
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(LEGAL_SUFFIXES, ' ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ').trim();

  const words = base.split(' ').filter(w => w.length > 1);
  if (!words.length) return null;

  const slugs = [...new Set([
    words.join('-'),
    words.slice(0, 3).join('-'),
    words.slice(0, 2).join('-'),
  ].filter(s => s.length >= 3))];

  for (const slug of slugs) {
    const url = `https://www.reclameaqui.com.br/empresa/${slug}/`;
    const result = await verifyUrl(url);
    if (result) return result;
  }
  return null;
}

@Injectable()
export class EnriquecimentoService {
  private readonly logger = new Logger(EnriquecimentoService.name);
  private readonly googlePlacesKey: string;

  private readonly cacheTtlDays: number;

  constructor(
    private readonly recortes: RecortesService,
    private readonly duck: DuckDbService,
    private readonly parquet: ParquetService,
    private readonly ai: AiService,
    @InjectRepository(SiteEnriquecimento)
    private readonly siteRepo: Repository<SiteEnriquecimento>,
    @InjectRepository(CnpjSiteCache)
    private readonly siteCacheRepo: Repository<CnpjSiteCache>,
  ) {
    this.googlePlacesKey = process.env.GOOGLE_PLACES_API_KEY ?? '';
    this.cacheTtlDays    = Number(process.env.SITE_CACHE_TTL_DAYS ?? '30');
    if (!this.googlePlacesKey) {
      this.logger.warn('GOOGLE_PLACES_API_KEY não configurada — estratégia Google Places desativada');
    }
  }

  // Só stats — rápido, sem paginar dados
  async statsTelefone(recorteId: number): Promise<TelefoneStats> {
    const { stats } = await this.enriquecerTelefone(recorteId, 1, 0);
    return stats;
  }

  async enriquecerTelefone(
    recorteId: number,
    page = 1,
    limit = 50,
  ): Promise<{ stats: TelefoneStats; data: TelefoneRow[]; total: number }> {
    const recorte = await this.recortes.findOne(recorteId);
    if (!this.parquet.hasFiles('estabelecimentos')) {
      return { stats: { total: 0, celular: 0, fixo: 0, invalido: 0, sem_telefone: 0, aproveitamento: 0 }, data: [], total: 0 };
    }

    const clauses = this.recortes.buildWhere(recorte.filtros);
    const from    = this.recortes.buildFrom();
    const where   = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const offset  = (page - 1) * limit;

    // Query com classificação inline
    const sql = `
      SELECT
        TRIM(e.cnpj_basico) || TRIM(e.cnpj_ordem) || TRIM(e.cnpj_dv) AS cnpj,
        COALESCE(TRIM(e.nome_fantasia), '')  AS nome_fantasia,
        TRIM(e.uf)                           AS uf,
        TRIM(e.ddd_1)                        AS ddd,
        TRIM(e.telefone_1)                   AS numero,
        CASE
          WHEN LENGTH(TRIM(e.telefone_1)) = 0 OR TRIM(e.ddd_1) = ''
            THEN 'sem_telefone'
          WHEN LENGTH(TRIM(e.telefone_1)) = 9 AND LEFT(TRIM(e.telefone_1), 1) = '9'
            THEN 'celular'
          WHEN LENGTH(TRIM(e.telefone_1)) = 8
            THEN 'fixo'
          ELSE 'invalido'
        END AS tipo
      FROM ${from}
      ${where}
      QUALIFY ROW_NUMBER() OVER (PARTITION BY e.cnpj_basico, e.cnpj_ordem, e.cnpj_dv ORDER BY e.cnpj_basico) = 1
    `;

    // Sequential — single DuckDB connection cannot handle concurrent queries
    const statsRows = await this.duck.query<{ tipo: string; cnt: number }>(`
      SELECT tipo, COUNT(*)::int AS cnt FROM (${sql}) t GROUP BY tipo
    `);
    const dataRows = limit > 0
      ? await this.duck.query<{ cnpj: string; nome_fantasia: string; uf: string; ddd: string; numero: string; tipo: string }>(`
          SELECT * FROM (${sql}) t
          WHERE tipo IN ('celular', 'fixo')
          ORDER BY tipo, ddd, numero
          LIMIT ${limit} OFFSET ${offset}
        `)
      : [];

    // Montar stats
    const statsMap = Object.fromEntries(statsRows.map((r) => [r.tipo, Number(r.cnt)]));
    const celular     = statsMap['celular']     ?? 0;
    const fixo        = statsMap['fixo']        ?? 0;
    const invalido    = statsMap['invalido']    ?? 0;
    const sem_telefone = statsMap['sem_telefone'] ?? 0;
    const total       = celular + fixo + invalido + sem_telefone;
    const validos     = celular + fixo;

    const stats: TelefoneStats = {
      total,
      celular,
      fixo,
      invalido,
      sem_telefone,
      aproveitamento: total > 0 ? Math.round((validos / total) * 100) : 0,
    };

    // Formatar rows
    const data: TelefoneRow[] = dataRows.map((r) => ({
      cnpj: r.cnpj,
      nome_fantasia: r.nome_fantasia,
      uf: r.uf,
      ddd: r.ddd,
      numero: r.numero,
      telefone_formatado: formatPhone(r.ddd, r.numero),
      telefone_e164: `+55${r.ddd}${r.numero}`,
      tipo: r.tipo as TipoTelefone,
    }));

    return { stats, data, total: validos };
  }

  // ── Site enrichment ─────────────────────────────────────────────────────────

  // ── Helpers de cache ────────────────────────────────────────────────────────

  private applyCache(
    record: SiteEnriquecimento,
    cached: CnpjSiteCache,
  ): SiteEnriquecimento {
    record.status               = cached.status;
    record.url                  = cached.url;
    record.slug                 = cached.slug;
    record.instagramUrl         = cached.instagramUrl;
    record.facebookUrl          = cached.facebookUrl;
    record.linkedinUrl          = cached.linkedinUrl;
    record.whatsappUrl          = cached.whatsappUrl;
    record.reclameaquiUrl       = cached.reclameaquiUrl;
    record.googlePhone          = cached.googlePhone;
    record.googleRating         = cached.googleRating;
    record.googleRatingCount    = cached.googleRatingCount;
    record.googleBusinessStatus = cached.googleBusinessStatus;
    record.googleAddress        = cached.googleAddress;
    return record;
  }

  private async saveCache(cnpj: string, record: SiteEnriquecimento): Promise<void> {
    const cached = (await this.siteCacheRepo.findOneBy({ cnpj })) ?? this.siteCacheRepo.create({ cnpj });
    cached.status               = record.status;
    cached.url                  = record.url;
    cached.slug                 = record.slug;
    cached.instagramUrl         = record.instagramUrl;
    cached.facebookUrl          = record.facebookUrl;
    cached.linkedinUrl          = record.linkedinUrl;
    cached.whatsappUrl          = record.whatsappUrl;
    cached.reclameaquiUrl       = record.reclameaquiUrl;
    cached.googlePhone          = record.googlePhone;
    cached.googleRating         = record.googleRating;
    cached.googleRatingCount    = record.googleRatingCount;
    cached.googleBusinessStatus = record.googleBusinessStatus;
    cached.googleAddress        = record.googleAddress;
    await this.siteCacheRepo.save(cached);
  }

  // ── Enriquecimento por linha ─────────────────────────────────────────────────

  async enrichSiteRow(
    cnpj: string, nome: string, email: string, recorteId: number,
    cnae = '', uf = '',
  ): Promise<SiteEnriquecimento> {
    const existing = await this.siteRepo.findOneBy({ cnpj, recorteId });
    const record   = existing ?? this.siteRepo.create({ cnpj, recorteId });

    // ── 1. Cache hit — evita toda chamada externa ──────────────────────────────
    const ttlCutoff = new Date(Date.now() - this.cacheTtlDays * 86_400_000);
    const cached = await this.siteCacheRepo.findOneBy({ cnpj });
    if (cached && cached.cachedAt > ttlCutoff) {
      return this.siteRepo.save(this.applyCache(record, cached));
    }

    // ── 2. Fase 1: fontes autoritativas (email próprio + Google Places) ────────
    //    Não requerem validação por IA — confiança alta por definição.
    const [emailUrls, placesResult, reclameaquiUrl] = await Promise.all([
      Promise.resolve(emailCandidates(email, nome)),
      fetchGooglePlaces(nome, uf, this.googlePlacesKey),
      findReclameAqui(nome),
    ]);

    const phase1Candidates = [
      ...emailUrls,
      ...(placesResult?.websiteUri ? [placesResult.websiteUri] : []),
    ];

    let found:     string | null = null;
    let usedSlug   = '';
    let foundMeta: PageMeta | null = null;

    for (const url of [...new Set(phase1Candidates)]) {
      const httpResult = await verifyUrl(url);
      if (!httpResult) continue;
      foundMeta = await fetchPageMeta(httpResult);
      found     = httpResult;
      usedSlug  = url;
      break; // fonte autoritativa: sem validação de IA
    }

    // ── 3. Fase 2: IA + slug (só se Fase 1 falhou) ────────────────────────────
    //    Requer validação por IA pois confiança é menor.
    if (!found) {
      const [aiDomains, slugUrls] = await Promise.all([
        this.ai.enabled ? this.ai.gerarCandidatosSite(nome, cnae, '', uf) : Promise.resolve([]),
        Promise.resolve(slugCandidates(nome)),
      ]);

      const phase2Candidates = [
        ...aiDomains.flatMap(d => [`https://${d}`, `https://www.${d}`]),
        ...slugUrls,
      ];

      for (const url of [...new Set(phase2Candidates)]) {
        const httpResult = await verifyUrl(url);
        if (!httpResult) continue;

        const meta = await fetchPageMeta(httpResult);
        if (this.ai.enabled && meta && (meta.title || meta.description)) {
          const valid = await this.ai.validarSite(httpResult, meta.title, meta.description, nome, cnpj);
          if (!valid) continue;
        }

        found    = httpResult;
        foundMeta = meta;
        usedSlug  = url;
        break;
      }
    }

    // ── 4. Persistir resultado ────────────────────────────────────────────────
    record.url                  = found ?? undefined;
    record.status               = found ? 'encontrado' : 'nao_encontrado';
    record.slug                 = usedSlug || undefined;
    record.instagramUrl         = foundMeta?.instagramUrl;
    record.facebookUrl          = foundMeta?.facebookUrl;
    record.linkedinUrl          = foundMeta?.linkedinUrl;
    record.whatsappUrl          = foundMeta?.whatsappUrl;
    record.reclameaquiUrl       = reclameaquiUrl ?? undefined;
    record.googlePhone          = placesResult?.phone;
    record.googleRating         = placesResult?.rating;
    record.googleRatingCount    = placesResult?.ratingCount;
    record.googleBusinessStatus = placesResult?.businessStatus;
    record.googleAddress        = placesResult?.address;

    const saved = await this.siteRepo.save(record);
    await this.saveCache(cnpj, saved); // atualiza cache global
    return saved;
  }

  async enrichSiteBatch(
    recorteId: number,
    onProgress: (done: number, total: number, found: number) => void,
  ): Promise<{ total: number; encontrado: number; nao_encontrado: number }> {
    const recorte = await this.recortes.findOne(recorteId);
    if (!this.parquet.hasFiles('estabelecimentos')) {
      return { total: 0, encontrado: 0, nao_encontrado: 0 };
    }

    const clauses = this.recortes.buildWhere(recorte.filtros);
    const from    = this.recortes.buildFrom();
    const where   = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

    const rows = await this.duck.query<{ cnpj: string; nome: string; email: string; cnae: string; uf: string }>(`
      SELECT
        TRIM(e.cnpj_basico) || TRIM(e.cnpj_ordem) || TRIM(e.cnpj_dv) AS cnpj,
        COALESCE(NULLIF(TRIM(e.nome_fantasia), ''), TRIM(e.cnpj_basico)) AS nome,
        COALESCE(TRIM(e.correio_eletronico), '') AS email,
        COALESCE(TRIM(e.cnae_fiscal_principal), '') AS cnae,
        COALESCE(TRIM(e.uf), '') AS uf
      FROM ${from}
      ${where}
      QUALIFY ROW_NUMBER() OVER (PARTITION BY e.cnpj_basico, e.cnpj_ordem, e.cnpj_dv ORDER BY e.cnpj_basico) = 1
    `);

    const total = rows.length;
    const CONCURRENCY = 8;

    // Skip CNPJs already processed — allows safe restart without losing work
    const done_records = await this.siteRepo.find({
      where: { recorteId },
      select: ['cnpj', 'status'],
    });
    const doneSet     = new Set(done_records.map(r => r.cnpj));
    const doneFound   = done_records.filter(r => r.status === 'encontrado').length;
    const pending     = rows.filter(r => !doneSet.has(r.cnpj));

    let done      = doneSet.size;
    let encontrado = doneFound;

    // Emit initial progress so UI shows already-completed work immediately
    if (done > 0) onProgress(done, total, encontrado);

    // Process in batches of CONCURRENCY
    for (let i = 0; i < pending.length; i += CONCURRENCY) {
      const batch = pending.slice(i, i + CONCURRENCY);
      const results = await Promise.all(
        batch.map(r => this.enrichSiteRow(r.cnpj, r.nome, r.email, recorteId, r.cnae, r.uf)),
      );
      done += batch.length;
      encontrado += results.filter(r => r.status === 'encontrado').length;
      onProgress(done, total, encontrado);
    }

    return { total, encontrado, nao_encontrado: total - encontrado };
  }

  async revalidarSites(
    recorteId: number,
    onProgress: (done: number, total: number, rejeitados: number) => void,
  ): Promise<{ total: number; mantidos: number; rejeitados: number }> {
    if (!this.ai.enabled) {
      this.logger.warn('revalidarSites chamado sem IA configurada — nenhuma ação tomada');
      return { total: 0, mantidos: 0, rejeitados: 0 };
    }

    const records = await this.siteRepo.find({ where: { recorteId, status: 'encontrado' } });
    if (!records.length) return { total: 0, mantidos: 0, rejeitados: 0 };

    // Busca nomes em lote via DuckDB
    const cnpjs = records.map(r => `'${r.cnpj.replace(/'/g, "''")}'`).join(',');
    const nomeMap = new Map<string, string>();
    try {
      const from = this.recortes.buildFrom();
      const rows = await this.duck.query<{ cnpj: string; nome: string }>(`
        SELECT
          TRIM(e.cnpj_basico) || TRIM(e.cnpj_ordem) || TRIM(e.cnpj_dv) AS cnpj,
          COALESCE(NULLIF(TRIM(e.nome_fantasia), ''), TRIM(e.cnpj_basico)) AS nome
        FROM ${from}
        WHERE TRIM(e.cnpj_basico) || TRIM(e.cnpj_ordem) || TRIM(e.cnpj_dv) IN (${cnpjs})
        QUALIFY ROW_NUMBER() OVER (PARTITION BY e.cnpj_basico, e.cnpj_ordem, e.cnpj_dv ORDER BY e.cnpj_basico) = 1
      `);
      for (const r of rows) nomeMap.set(r.cnpj, r.nome);
    } catch (err: any) {
      this.logger.warn(`revalidarSites: falha ao buscar nomes — ${err?.message}`);
    }

    const total = records.length;
    let done = 0;
    let rejeitados = 0;
    const CONCURRENCY = 4;

    for (let i = 0; i < records.length; i += CONCURRENCY) {
      const batch = records.slice(i, i + CONCURRENCY);
      await Promise.all(batch.map(async (record) => {
        if (!record.url) return;
        const meta = await fetchPageMeta(record.url);
        if (!meta || (!meta.title && !meta.description)) return; // sem conteúdo para validar

        const nome = nomeMap.get(record.cnpj) ?? record.cnpj;
        const valid = await this.ai.validarSite(record.url, meta.title, meta.description, nome, record.cnpj);
        if (!valid) {
          record.status       = 'nao_encontrado';
          record.url          = undefined;
          record.slug         = undefined;
          record.instagramUrl = undefined;
          record.facebookUrl  = undefined;
          record.linkedinUrl  = undefined;
          record.whatsappUrl  = undefined;
          await this.siteRepo.save(record);
          rejeitados++;
        } else {
          // Site confirmado — atualiza redes sociais (pode ter mudado ou não ter sido extraído antes)
          record.instagramUrl = meta.instagramUrl;
          record.facebookUrl  = meta.facebookUrl;
          record.linkedinUrl  = meta.linkedinUrl;
          record.whatsappUrl  = meta.whatsappUrl;
          await this.siteRepo.save(record);
        }
      }));
      done += batch.length;
      onProgress(done, total, rejeitados);
    }

    return { total, mantidos: total - rejeitados, rejeitados };
  }

  async getSiteEnriquecimento(
    recorteId: number,
    page = 1,
    limit = 50,
  ): Promise<{ data: SiteEnriquecimento[]; total: number; encontrado: number }> {
    const [data, total] = await this.siteRepo.findAndCount({
      where: { recorteId },
      order: { status: 'ASC', enriquecidoEm: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    const encontrado = await this.siteRepo.count({ where: { recorteId, status: 'encontrado' } });
    return { data, total, encontrado };
  }

  async getSiteMap(recorteId: number): Promise<Map<string, PresencaDigital>> {
    // Include rows without a site URL too — they may have Places data (phone, address, rating)
    const rows = await this.siteRepo.find({
      where: { recorteId },
      select: ['cnpj', 'url', 'instagramUrl', 'facebookUrl', 'linkedinUrl', 'whatsappUrl', 'reclameaquiUrl',
               'googlePhone', 'googleRating', 'googleRatingCount', 'googleBusinessStatus', 'googleAddress'],
    });
    const map = new Map<string, PresencaDigital>();
    for (const r of rows) {
      const hasAny = r.url || r.googlePhone || r.googleRating || r.googleAddress;
      if (!hasAny) continue;
      map.set(r.cnpj, {
        url:                  r.url,
        instagramUrl:         r.instagramUrl,
        facebookUrl:          r.facebookUrl,
        linkedinUrl:          r.linkedinUrl,
        whatsappUrl:          r.whatsappUrl,
        reclameaquiUrl:       r.reclameaquiUrl,
        googlePhone:          r.googlePhone,
        googleRating:         r.googleRating,
        googleRatingCount:    r.googleRatingCount,
        googleBusinessStatus: r.googleBusinessStatus,
        googleAddress:        r.googleAddress,
      });
    }
    return map;
  }
}
