import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RecortesService } from '../recortes/recortes.service';
import { BigQueryService } from '../base-primaria/bigquery.service';
import { SiteEnriquecimento } from './entities/site-enriquecimento.entity';
import { AddressEnriquecimento, AddressStatus } from './entities/address-enriquecimento.entity';
import { ContactEnriquecimento, ContactQuality } from './entities/contact-enriquecimento.entity';
import { EnrichmentData, EnrichmentConfidence, EnrichmentSource } from './entities/enrichment-data.entity';
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
  telefone_formatado: string;
  telefone_e164: string;
  tipo: TipoTelefone;
};

export type TelefoneStats = {
  total: number;
  celular: number;
  fixo: number;
  invalido: number;
  sem_telefone: number;
  aproveitamento: number;
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

// ── Pontuação de confiabilidade ───────────────────────────────────────────────

function calcularConfiabilidade(r: {
  url?: string; googlePhone?: string; googleRating?: number;
  googleRatingCount?: number; googleBusinessStatus?: string;
  whatsappUrl?: string; instagramUrl?: string; linkedinUrl?: string;
  facebookUrl?: string; reclameaquiUrl?: string;
}): { score: number; label: string } {
  let score = 0;
  if (r.url) score += r.googlePhone ? 30 : 15;
  if (r.googlePhone)  score += 15;
  if (r.googleRating != null && (r.googleRatingCount ?? 0) >= 5) {
    score += r.googleRating >= 4 ? 10 : 5;
  }
  if (r.googleBusinessStatus === 'OPERATIONAL') score += 5;
  if (r.whatsappUrl)   score += 15;
  if (r.instagramUrl)  score += 5;
  if (r.linkedinUrl)   score += 5;
  if (r.facebookUrl)   score += 3;
  if (r.reclameaquiUrl) score += 10;
  const total = Math.min(100, score);
  const label = total >= 70 ? 'alto' : total >= 40 ? 'medio' : 'baixo';
  return { score: total, label };
}

// ── Site enrichment helpers ──────────────────────────────────────────────────

const LEGAL_SUFFIXES = /\b(ltda|me|mei|epp|s\.?a\.?|cia|eireli|ss|lda|microempresa|micro empresa)\b/gi;
const GENERIC_WORDS  = /\b(comercio|comercial|servicos|industria|industrias|group|grupo)\b/gi;

function domainMatchesName(domain: string, nome: string): boolean {
  if (!nome?.trim() || !domain?.trim()) return false;
  const normalize = (s: string) =>
    s.toLowerCase()
     .normalize('NFD').replace(/[̀-ͯ]/g, '')
     .replace(/[^a-z0-9]/g, ' ')
     .split(' ').filter(w => w.length > 2);
  const nameTokens = normalize(nome);
  const domainLabel = domain.split('.')[0];
  return nameTokens.some(t => domainLabel.includes(t));
}

function emailCandidates(email: string, nome: string): string[] {
  if (!email?.trim()) return [];
  const at = email.trim().toLowerCase().lastIndexOf('@');
  if (at < 0) return [];
  const domain = email.trim().toLowerCase().slice(at + 1);
  const FREE = ['gmail.com','hotmail.com','outlook.com','yahoo.com','bol.com.br','uol.com.br','terra.com.br','ig.com.br'];
  if (FREE.includes(domain)) return [];
  if (!domainMatchesName(domain, nome)) return [];
  return [`https://${domain}`, `https://www.${domain}`];
}

function slugCandidates(nome: string): string[] {
  if (!nome?.trim()) return [];
  const base = nome
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
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
  extractedPhones?: string[];  // números BR normalizados (só dígitos) encontrados na página
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
    // Extrair telefones BR da página (normalizado — só dígitos, 10-11 chars com DDD)
    const phoneRe = /(?:\+55[\s-]?)?(?:\(?\d{2}\)?[\s-]?)(\d{4,5}[\s-]?\d{4})/g;
    const phonesRaw = html.match(phoneRe) ?? [];
    const extractedPhones = [...new Set(
      phonesRaw.map(p => p.replace(/\D/g, '')).filter(p => p.length >= 10 && p.length <= 13),
    )];

    return { title, description: desc, instagramUrl, facebookUrl, linkedinUrl, whatsappUrl, extractedPhones };
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
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
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

// ── Módulo 3 — score multi-âncora (validação de site Fase 2) ─────────────────

const UFS_BR = new Set([
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS',
  'MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO',
]);

function calcSiteAnchorScore(
  meta: PageMeta,
  rfDdd: string,
  rfTelefone: string,
  rfUf: string,
  placesPhone?: string,
): number {
  let score = 0;

  // Âncora telefone (30pts) — compara sufixo de 8 dígitos
  const rfNorm = `${rfDdd.trim()}${rfTelefone.trim()}`.replace(/\D/g, '');
  const plNorm = (placesPhone ?? '').replace(/\D/g, '');
  const suffix = 8;

  if (rfNorm.length >= suffix || plNorm.length >= suffix) {
    for (const p of meta.extractedPhones ?? []) {
      if (
        (rfNorm.length >= suffix && p.endsWith(rfNorm.slice(-suffix))) ||
        (plNorm.length >= suffix && p.endsWith(plNorm.slice(-suffix)))
      ) {
        score += 30;
        break;
      }
    }
  }

  // Âncora UF (20pts) — UF mencionada no título ou descrição
  const text = `${meta.title} ${meta.description}`.toUpperCase();
  if (rfUf && UFS_BR.has(rfUf.toUpperCase())) {
    // Verifica como palavra isolada (evita falsos positivos tipo "SP" dentro de "ISPO")
    if (new RegExp(`\\b${rfUf.toUpperCase()}\\b`).test(text)) {
      score += 20;
    }
  }

  return score;
}

const BANNED_HOSTS = new Set([
  'ifood.com.br', 'rappi.com.br', 'ubereats.com', 'aiqfome.com', '99food.com.br',
  'tripadvisor.com.br', 'tripadvisor.com',
  'yelp.com', 'foursquare.com',
  'guiamais.com.br', 'telelistas.net', 'encontra.com.br', 'yellowpages.com.br',
]);

function isBannedUrl(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    const h = hostname.toLowerCase();
    if (h.endsWith('.gov.br') || h === 'gov.br') return true;
    if (h.includes('prefeitura')) return true;
    if (h.includes('camara.leg')) return true;
    const bare = h.startsWith('www.') ? h.slice(4) : h;
    return BANNED_HOSTS.has(bare);
  } catch {
    return false;
  }
}

// ── Módulo 1 — Endereço: helpers ─────────────────────────────────────────────

type PlacesAddressResult = PlacesResult & {
  placeName?: string;
  primaryType?: string;
  hasHours?: boolean;
};

const ADDR_ABBREV: Record<string, string> = {
  'r.': 'rua', 'av.': 'avenida', 'av ': 'avenida ', 'al.': 'alameda',
  'pca': 'praca', 'pça': 'praca', 'trav.': 'travessa', 'rod.': 'rodovia',
  'est.': 'estrada', 'blvd': 'boulevard',
};

function normalizeAddr(s: string): string {
  if (!s) return '';
  let out = s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[.,\-/]/g, ' ');
  for (const [abbr, full] of Object.entries(ADDR_ABBREV)) out = out.replace(new RegExp(abbr, 'g'), full);
  return out.replace(/\s+/g, ' ').trim();
}

function tokenOverlap(a: string, b: string, minLen = 3): number {
  const tokA = new Set(a.split(' ').filter(w => w.length >= minLen));
  const tokB = new Set(b.split(' ').filter(w => w.length >= minLen));
  if (!tokA.size || !tokB.size) return 0;
  let common = 0;
  for (const t of tokA) if (tokB.has(t)) common++;
  return common / Math.min(tokA.size, tokB.size);
}

function normalizePhone(s: string): string {
  return (s ?? '').replace(/\D/g, '');
}

// CNAE division (2 dígitos) → tipos compatíveis no Places primaryType
const CNAE_PLACES_MAP: Record<string, string[]> = {
  '10': ['bakery', 'food_producer'],
  '47': ['store', 'clothing_store', 'electronics_store', 'hardware_store',
         'supermarket', 'convenience_store', 'shopping_mall', 'home_goods_store'],
  '45': ['car_repair', 'car_dealer', 'gas_station'],
  '46': ['wholesaler'],
  '55': ['hotel', 'lodging', 'motel'],
  '56': ['restaurant', 'cafe', 'bakery', 'bar', 'meal_delivery', 'meal_takeaway'],
  '64': ['bank', 'atm'],
  '65': ['insurance_agency'],
  '68': ['real_estate_agency'],
  '69': ['lawyer', 'accounting'],
  '77': ['car_rental'],
  '82': ['school'],
  '85': ['school', 'university', 'primary_school', 'secondary_school'],
  '86': ['hospital', 'pharmacy', 'doctor', 'dentist', 'physiotherapist'],
  '87': ['nursing_home'],
  '93': ['gym', 'sports_club', 'bowling_alley'],
  '96': ['beauty_salon', 'hair_care', 'spa', 'nail_salon'],
};

function scoreEndereco(rfAddr: string, placesAddr: string): number {
  const overlap = tokenOverlap(normalizeAddr(rfAddr), normalizeAddr(placesAddr));
  return Math.round(overlap * 40);
}

function scoreTelefone(rfDdd: string, rfTel: string, placesPhone: string): number {
  if (!placesPhone || !rfDdd || !rfTel) return 0;
  const rf = normalizePhone(`${rfDdd}${rfTel}`);
  const pl = normalizePhone(placesPhone);
  if (!rf || !pl) return 0;
  // Compara sufixo (DDD pode estar ausente no Places)
  const shorter = rf.length < pl.length ? rf : pl;
  const longer  = rf.length < pl.length ? pl : rf;
  return longer.endsWith(shorter) ? 30 : 0;
}

function scoreCnae(cnae: string, primaryType: string): number {
  if (!cnae || !primaryType) return 0;
  const div = cnae.slice(0, 2);
  const compat = CNAE_PLACES_MAP[div] ?? [];
  return compat.includes(primaryType) ? 20 : 0;
}

function scoreNome(rfNome: string, placesName: string): number {
  if (!rfNome || !placesName) return 0;
  const normalize = (s: string) =>
    s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ');
  const overlap = tokenOverlap(normalize(rfNome), normalize(placesName), 2);
  return overlap >= 0.7 ? 10 : Math.round(overlap * 10);
}

function calcMatchScore(
  rf: { addr: string; ddd: string; tel: string; nome: string; cnae: string },
  pl: PlacesAddressResult,
): number {
  return (
    scoreEndereco(rf.addr, pl.address ?? '') +
    scoreTelefone(rf.ddd, rf.tel, pl.phone ?? '') +
    scoreCnae(rf.cnae, pl.primaryType ?? '') +
    scoreNome(rf.nome, pl.placeName ?? '')
  );
}

async function fetchPlacesForAddress(
  query: string, apiKey: string,
): Promise<PlacesAddressResult | null> {
  if (!apiKey?.trim()) return null;
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8_000);
  try {
    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': [
          'places.displayName',
          'places.formattedAddress',
          'places.nationalPhoneNumber',
          'places.websiteUri',
          'places.rating',
          'places.userRatingCount',
          'places.businessStatus',
          'places.primaryType',
          'places.regularOpeningHours',
        ].join(','),
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
    const displayName = place['displayName'] as Record<string, string> | undefined;
    const hours       = place['regularOpeningHours'] as Record<string, unknown> | undefined;
    return {
      placeName:      displayName?.['text'],
      address:        place['formattedAddress']        as string | undefined,
      phone:          place['nationalPhoneNumber']     as string | undefined,
      websiteUri:     place['websiteUri']              as string | undefined,
      rating:         place['rating']                  as number | undefined,
      ratingCount:    place['userRatingCount']         as number | undefined,
      businessStatus: place['businessStatus']          as string | undefined,
      primaryType:    place['primaryType']             as string | undefined,
      hasHours:       hours != null,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchPlacesCascade(
  queries: string[],
  rf: { addr: string; ddd: string; tel: string; nome: string; cnae: string },
  apiKey: string,
): Promise<{ result: PlacesAddressResult; score: number } | null> {
  let best: { result: PlacesAddressResult; score: number } | null = null;

  for (const query of queries) {
    const result = await fetchPlacesForAddress(query, apiKey);
    if (!result) continue;

    const score = calcMatchScore(rf, result);
    if (!best || score > best.score) best = { result, score };
    if (score >= 70) break;   // match alto: não precisa tentar próxima query
  }

  return best;
}

// ── Módulo 2 — Contato PJ: helpers ───────────────────────────────────────────

const FREE_EMAIL_DOMAINS = new Set([
  'gmail.com','hotmail.com','outlook.com','yahoo.com','yahoo.com.br',
  'bol.com.br','uol.com.br','terra.com.br','ig.com.br','globo.com',
  'live.com','msn.com','icloud.com',
]);

const ACCOUNTING_CNAES = new Set(['6920601', '6920602']);

// Shared threshold: telefone/email aparecendo em mais de N CNPJs é suspeito
const SHARED_THRESHOLD = Number(process.env.CONTACT_SHARED_THRESHOLD ?? '5');

type ContactDetectionResult = {
  phoneIsThirdParty?: boolean;
  phoneThirdPartyReason?: string;
  phoneDirect?: string;
  phoneDirectSource?: string;
  emailIsThirdParty?: boolean;
  emailThirdPartyReason?: string;
  emailCorporate?: string;
  emailCorporateSource?: string;
  contactQuality: ContactQuality;
};

function detectContact(params: {
  nome: string;
  email: string;
  ddd: string;
  telefone: string;
  sharedPhones: Set<string>;
  sharedEmails: Set<string>;
  accountingPhones: Set<string>;
  accountingEmails: Set<string>;
  placesPhone?: string;
  whatsappUrl?: string;
}): ContactDetectionResult {
  const {
    nome, email, ddd, telefone,
    sharedPhones, sharedEmails, accountingPhones, accountingEmails,
    placesPhone, whatsappUrl,
  } = params;

  // ── Detecção telefone ───────────────────────────────────────────────────────
  let phoneIsThirdParty: boolean | undefined;
  let phoneThirdPartyReason: string | undefined;

  if (ddd && telefone) {
    const phoneKey = `${ddd.trim()}${telefone.trim()}`;
    if (sharedPhones.has(phoneKey)) {
      phoneIsThirdParty   = true;
      phoneThirdPartyReason = 'shared_multiple_cnpjs';
    } else if (accountingPhones.has(phoneKey)) {
      phoneIsThirdParty   = true;
      phoneThirdPartyReason = 'accounting_cnae';
    } else {
      phoneIsThirdParty = false;
    }
  }

  // ── Detecção email ──────────────────────────────────────────────────────────
  let emailIsThirdParty: boolean | undefined;
  let emailThirdPartyReason: string | undefined;
  let emailCorporate: string | undefined;
  let emailCorporateSource: string | undefined;

  if (email?.trim()) {
    const at = email.lastIndexOf('@');
    const domain = at > 0 ? email.slice(at + 1).toLowerCase().trim() : '';

    if (!domain) {
      emailIsThirdParty = undefined; // sem info
    } else if (FREE_EMAIL_DOMAINS.has(domain)) {
      emailIsThirdParty   = true;
      emailThirdPartyReason = 'generic_domain';
    } else if (sharedEmails.has(email.toLowerCase().trim())) {
      emailIsThirdParty   = true;
      emailThirdPartyReason = 'shared_multiple_cnpjs';
    } else if (accountingEmails.has(email.toLowerCase().trim())) {
      emailIsThirdParty   = true;
      emailThirdPartyReason = 'accounting_cnae';
    } else if (!domainMatchesName(domain, nome)) {
      emailIsThirdParty   = true;   // suspect — domain sem relação com nome
      emailThirdPartyReason = 'domain_mismatch';
    } else {
      emailIsThirdParty = false;
      // Domínio próprio → gerar candidatos de email corporativo (não verificados via HTTP)
      const prefixes = ['contato', 'info', 'fale', 'sac'];
      emailCorporate       = `${prefixes[0]}@${domain}`;
      emailCorporateSource = 'rf_domain_pattern';
    }
  }

  // ── Busca de contato direto ─────────────────────────────────────────────────
  let phoneDirect: string | undefined;
  let phoneDirectSource: string | undefined;

  if (placesPhone && phoneIsThirdParty !== false) {
    // Places phone disponível e RF phone é suspeito (ou ausente)
    phoneDirect       = placesPhone;
    phoneDirectSource = 'places';
  } else if (phoneIsThirdParty === false && ddd && telefone) {
    // RF phone é direto — mantém
    phoneDirect       = `(${ddd.trim()}) ${telefone.trim()}`;
    phoneDirectSource = 'rf';
  }

  if (!phoneDirect && whatsappUrl) {
    // Extrair número do link WhatsApp como fallback
    const match = whatsappUrl.match(/(\d{10,13})/);
    if (match) {
      phoneDirect       = match[1];
      phoneDirectSource = 'scraping';
    }
  }

  // ── contact_quality ─────────────────────────────────────────────────────────
  let contactQuality: ContactQuality = 'not_found';
  if (phoneDirect || (emailCorporate && emailIsThirdParty === false)) {
    contactQuality = 'direct';
  } else if (phoneIsThirdParty === true || emailIsThirdParty === true) {
    contactQuality = 'third_party';
  }

  return {
    phoneIsThirdParty, phoneThirdPartyReason,
    phoneDirect, phoneDirectSource,
    emailIsThirdParty, emailThirdPartyReason,
    emailCorporate, emailCorporateSource,
    contactQuality,
  };
}

// ── Mapeamento enrichment_data ↔ campos de presença digital ──────────────────

type DigitalFields = {
  site_url?:              string;
  site_slug?:             string;
  instagram_url?:         string;
  facebook_url?:          string;
  linkedin_url?:          string;
  whatsapp_url?:          string;
  reclameaqui_url?:       string;
  google_phone?:          string;
  google_rating?:         string;
  google_rating_count?:   string;
  google_business_status?: string;
  google_address?:        string;
  confiabilidade_score?:  string;
  confiabilidade_label?:  string;
  site_anchor_score?:     string;
};

function rowsToDigitalFields(rows: EnrichmentData[]): DigitalFields {
  const fields: DigitalFields = {};
  for (const r of rows) {
    if (r.fieldValue != null) {
      (fields as Record<string, string>)[r.fieldName] = r.fieldValue;
    }
  }
  return fields;
}

function applyDigitalFields(record: SiteEnriquecimento, fields: DigitalFields): SiteEnriquecimento {
  record.url                  = fields.site_url;
  record.slug                 = fields.site_slug;
  record.instagramUrl         = fields.instagram_url;
  record.facebookUrl          = fields.facebook_url;
  record.linkedinUrl          = fields.linkedin_url;
  record.whatsappUrl          = fields.whatsapp_url;
  record.reclameaquiUrl       = fields.reclameaqui_url;
  record.googlePhone          = fields.google_phone;
  record.googleRating         = fields.google_rating        ? parseFloat(fields.google_rating)      : undefined;
  record.googleRatingCount    = fields.google_rating_count  ? parseInt(fields.google_rating_count)  : undefined;
  record.googleBusinessStatus = fields.google_business_status;
  record.googleAddress        = fields.google_address;
  record.confiabilidadeScore  = fields.confiabilidade_score ? parseInt(fields.confiabilidade_score) : 0;
  record.confiabilidadeLabel  = fields.confiabilidade_label ?? 'baixo';
  record.status               = fields.site_url ? 'encontrado' : 'nao_encontrado';
  return record;
}

@Injectable()
export class EnriquecimentoService {
  private readonly logger = new Logger(EnriquecimentoService.name);
  private readonly googlePlacesKey: string;
  private readonly cacheTtlDays: number;

  constructor(
    private readonly recortes: RecortesService,
    private readonly bq: BigQueryService,
    private readonly ai: AiService,
    @InjectRepository(SiteEnriquecimento)
    private readonly siteRepo: Repository<SiteEnriquecimento>,
    @InjectRepository(AddressEnriquecimento)
    private readonly addressRepo: Repository<AddressEnriquecimento>,
    @InjectRepository(ContactEnriquecimento)
    private readonly contactRepo: Repository<ContactEnriquecimento>,
    @InjectRepository(EnrichmentData)
    private readonly enrichmentRepo: Repository<EnrichmentData>,
  ) {
    this.googlePlacesKey = process.env.GOOGLE_PLACES_API_KEY ?? '';
    this.cacheTtlDays    = Number(process.env.SITE_CACHE_TTL_DAYS ?? '30');
    if (!this.googlePlacesKey) {
      this.logger.warn('GOOGLE_PLACES_API_KEY não configurada — estratégia Google Places desativada');
    }
  }

  // ── Telefone ──────────────────────────────────────────────────────────────

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
    const clauses = this.recortes.buildWhere(recorte.filtros);
    const from    = this.recortes.buildFrom();
    const where   = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const offset  = (page - 1) * limit;

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

    const statsRows = await this.bq.query<{ tipo: string; cnt: number }>(`
      SELECT tipo, CAST(COUNT(*) AS INT64) AS cnt FROM (${sql}) t GROUP BY tipo
    `);
    const dataRows = limit > 0
      ? await this.bq.query<{ cnpj: string; nome_fantasia: string; uf: string; ddd: string; numero: string; tipo: string }>(`
          SELECT * FROM (${sql}) t
          WHERE tipo IN ('celular', 'fixo')
          ORDER BY tipo, ddd, numero
          LIMIT ${limit} OFFSET ${offset}
        `)
      : [];

    const statsMap   = Object.fromEntries(statsRows.map((r) => [r.tipo, Number(r.cnt)]));
    const celular    = statsMap['celular']     ?? 0;
    const fixo       = statsMap['fixo']        ?? 0;
    const invalido   = statsMap['invalido']    ?? 0;
    const sem_telefone = statsMap['sem_telefone'] ?? 0;
    const total      = celular + fixo + invalido + sem_telefone;
    const validos    = celular + fixo;

    const stats: TelefoneStats = {
      total, celular, fixo, invalido, sem_telefone,
      aproveitamento: total > 0 ? Math.round((validos / total) * 100) : 0,
    };

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

  // ── Enrichment data (cache global) ────────────────────────────────────────

  private async loadDigitalCache(cnpj: string): Promise<EnrichmentData[] | null> {
    const ttlCutoff = new Date(Date.now() - this.cacheTtlDays * 86_400_000);
    const rows = await this.enrichmentRepo.find({
      where: { cnpj, module: 'digital', status: 'valid' },
    });
    if (!rows.length) return null;
    const newest = rows.reduce((a, b) => a.enrichedAt > b.enrichedAt ? a : b);
    return newest.enrichedAt > ttlCutoff ? rows : null;
  }

  private async saveDigitalCache(
    cnpj: string,
    record: SiteEnriquecimento,
    urlSource: EnrichmentSource,
    urlConfidence: EnrichmentConfidence,
    anchorScore = 0,
  ): Promise<void> {
    type FieldDef = {
      fieldName: string;
      fieldValue: string | undefined;
      source: EnrichmentSource;
      confidence: EnrichmentConfidence;
    };

    const fields: FieldDef[] = [
      { fieldName: 'site_url',              fieldValue: record.url,                             source: urlSource,   confidence: urlConfidence },
      { fieldName: 'site_slug',             fieldValue: record.slug,                            source: urlSource,   confidence: urlConfidence },
      { fieldName: 'instagram_url',         fieldValue: record.instagramUrl,                    source: 'scraping',  confidence: urlConfidence },
      { fieldName: 'facebook_url',          fieldValue: record.facebookUrl,                     source: 'scraping',  confidence: urlConfidence },
      { fieldName: 'linkedin_url',          fieldValue: record.linkedinUrl,                     source: 'scraping',  confidence: urlConfidence },
      { fieldName: 'whatsapp_url',          fieldValue: record.whatsappUrl,                     source: 'scraping',  confidence: urlConfidence },
      { fieldName: 'reclameaqui_url',       fieldValue: record.reclameaquiUrl,                  source: 'scraping',  confidence: 'medium' },
      { fieldName: 'google_phone',          fieldValue: record.googlePhone,                     source: 'places',    confidence: 'high' },
      { fieldName: 'google_rating',         fieldValue: record.googleRating?.toString(),        source: 'places',    confidence: 'high' },
      { fieldName: 'google_rating_count',   fieldValue: record.googleRatingCount?.toString(),   source: 'places',    confidence: 'high' },
      { fieldName: 'google_business_status', fieldValue: record.googleBusinessStatus,           source: 'places',    confidence: 'high' },
      { fieldName: 'google_address',        fieldValue: record.googleAddress,                   source: 'places',    confidence: 'high' },
      { fieldName: 'confiabilidade_score',  fieldValue: record.confiabilidadeScore.toString(),  source: 'scraping',  confidence: 'high' },
      { fieldName: 'confiabilidade_label',  fieldValue: record.confiabilidadeLabel,             source: 'scraping',  confidence: 'high' },
      { fieldName: 'site_anchor_score',     fieldValue: anchorScore.toString(),                 source: 'scraping',  confidence: 'high' },
    ];

    // Upsert em lote: INSERT ... ON CONFLICT DO UPDATE
    const rows = fields.map(f => ({
      cnpj,
      module:      'digital' as const,
      fieldName:   f.fieldName,
      fieldValue:  f.fieldValue ?? undefined,
      source:      f.source,
      confidence:  f.confidence,
      status:      'valid' as const,
      enrichedAt:  new Date(),
    }));

    await this.enrichmentRepo
      .createQueryBuilder()
      .insert()
      .into(EnrichmentData)
      .values(rows)
      .orUpdate(
        ['field_value', 'source', 'confidence', 'enriched_at'],
        ['cnpj', 'module', 'field_name', 'status'],
      )
      .execute();
  }

  // ── Enriquecimento por linha ──────────────────────────────────────────────

  async enrichSiteRow(
    cnpj: string, nome: string, email: string, recorteId: number,
    cnae = '', uf = '', ddd = '', telefone = '',
  ): Promise<SiteEnriquecimento> {
    const existing = await this.siteRepo.findOneBy({ cnpj, recorteId });
    const record   = existing ?? this.siteRepo.create({ cnpj, recorteId });

    // ── 1. Cache hit via enrichment_data ─────────────────────────────────────
    const cachedRows = await this.loadDigitalCache(cnpj);
    if (cachedRows) {
      const fields = rowsToDigitalFields(cachedRows);
      return this.siteRepo.save(applyDigitalFields(record, fields));
    }

    // ── 2. Fase 1: Google Places websiteUri (alta confiança) ─────────────────
    const [placesResult, reclameaquiUrl, emailUrls] = await Promise.all([
      fetchGooglePlaces(nome, uf, this.googlePlacesKey),
      findReclameAqui(nome),
      Promise.resolve(emailCandidates(email, nome)),
    ]);

    let found:          string | null = null;
    let usedSlug        = '';
    let foundMeta:      PageMeta | null = null;
    let urlSource:      EnrichmentSource     = 'scraping';
    let urlConfidence:  EnrichmentConfidence = 'low';
    let siteAnchorScore = 0;

    // Places websiteUri primeiro — mais autoritativo
    if (placesResult?.websiteUri && !isBannedUrl(placesResult.websiteUri)) {
      const httpResult = await verifyUrl(placesResult.websiteUri);
      if (httpResult && !isBannedUrl(httpResult)) {
        foundMeta    = await fetchPageMeta(httpResult);
        found        = httpResult;
        usedSlug     = placesResult.websiteUri;
        urlSource    = 'places';
        urlConfidence = 'high';
      }
    }

    // Email de domínio próprio — segunda opção autoritativa
    if (!found) {
      for (const url of emailUrls) {
        if (isBannedUrl(url)) continue;
        const httpResult = await verifyUrl(url);
        if (!httpResult || isBannedUrl(httpResult)) continue;
        foundMeta    = await fetchPageMeta(httpResult);
        found        = httpResult;
        usedSlug     = url;
        urlSource    = 'scraping';
        urlConfidence = 'medium';
        break;
      }
    }

    // ── 3. Fase 2: IA + slug (só se Fase 1 falhou) ───────────────────────────
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
        if (isBannedUrl(url)) continue;
        const httpResult = await verifyUrl(url);
        if (!httpResult || isBannedUrl(httpResult)) continue;

        const meta = await fetchPageMeta(httpResult);
        if (this.ai.enabled && meta && (meta.title || meta.description)) {
          const valid = await this.ai.validarSite(
            httpResult, meta.title, meta.description, nome, cnpj,
            { uf, cnae, temWhatsapp: !!meta.whatsappUrl },
          );
          if (!valid) continue;
        }

        // Score multi-âncora — telefone (30pts) + UF (20pts)
        const anchorScore = meta
          ? calcSiteAnchorScore(meta, ddd, telefone, uf, placesResult?.phone)
          : 0;

        found           = httpResult;
        foundMeta       = meta;
        usedSlug        = url;
        siteAnchorScore = anchorScore;
        // Fase 2 com âncora confirmada → medium; só IA → low
        urlConfidence   = anchorScore > 0 ? 'medium' : 'low';
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

    const { score, label } = calcularConfiabilidade(record);
    record.confiabilidadeScore = score;
    record.confiabilidadeLabel = label;

    const saved = await this.siteRepo.save(record);
    await this.saveDigitalCache(cnpj, saved, urlSource, urlConfidence, siteAnchorScore);
    return saved;
  }

  async enrichSiteBatch(
    recorteId: number,
    onProgress: (done: number, total: number, found: number) => void,
  ): Promise<{ total: number; encontrado: number; nao_encontrado: number }> {
    const recorte = await this.recortes.findOne(recorteId);
    const clauses = this.recortes.buildWhere(recorte.filtros);
    const from    = this.recortes.buildFrom();
    const where   = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

    const rows = await this.bq.query<{ cnpj: string; nome: string; email: string; cnae: string; uf: string; ddd: string; telefone: string }>(`
      SELECT
        TRIM(e.cnpj_basico) || TRIM(e.cnpj_ordem) || TRIM(e.cnpj_dv) AS cnpj,
        COALESCE(NULLIF(TRIM(e.nome_fantasia), ''), TRIM(e.cnpj_basico)) AS nome,
        COALESCE(TRIM(e.correio_eletronico), '') AS email,
        COALESCE(TRIM(e.cnae_fiscal_principal), '') AS cnae,
        COALESCE(TRIM(e.uf), '') AS uf,
        COALESCE(TRIM(e.ddd_1), '') AS ddd,
        COALESCE(TRIM(e.telefone_1), '') AS telefone
      FROM ${from}
      ${where}
      QUALIFY ROW_NUMBER() OVER (PARTITION BY e.cnpj_basico, e.cnpj_ordem, e.cnpj_dv ORDER BY e.cnpj_basico) = 1
    `);

    const total = rows.length;
    const CONCURRENCY = 8;

    const done_records = await this.siteRepo.find({
      where: { recorteId },
      select: ['cnpj', 'status'],
    });
    const doneSet   = new Set(done_records.map(r => r.cnpj));
    const doneFound = done_records.filter(r => r.status === 'encontrado').length;
    const pending   = rows.filter(r => !doneSet.has(r.cnpj));

    let done       = doneSet.size;
    let encontrado = doneFound;

    if (done > 0) onProgress(done, total, encontrado);

    for (let i = 0; i < pending.length; i += CONCURRENCY) {
      const batch = pending.slice(i, i + CONCURRENCY);
      const results = await Promise.all(
        batch.map(r => this.enrichSiteRow(r.cnpj, r.nome, r.email, recorteId, r.cnae, r.uf, r.ddd, r.telefone)),
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

    const cnpjs = records.map(r => `'${r.cnpj.replace(/'/g, "''")}'`).join(',');
    const ctxMap = new Map<string, { nome: string; uf: string; cnae: string }>();
    try {
      const from = this.recortes.buildFrom();
      const bqRows = await this.bq.query<{ cnpj: string; nome: string; uf: string; cnae: string }>(`
        SELECT
          TRIM(e.cnpj_basico) || TRIM(e.cnpj_ordem) || TRIM(e.cnpj_dv) AS cnpj,
          COALESCE(NULLIF(TRIM(e.nome_fantasia), ''), TRIM(e.cnpj_basico)) AS nome,
          COALESCE(TRIM(e.uf), '') AS uf,
          COALESCE(TRIM(e.cnae_fiscal_principal), '') AS cnae
        FROM ${from}
        WHERE TRIM(e.cnpj_basico) || TRIM(e.cnpj_ordem) || TRIM(e.cnpj_dv) IN (${cnpjs})
        QUALIFY ROW_NUMBER() OVER (PARTITION BY e.cnpj_basico, e.cnpj_ordem, e.cnpj_dv ORDER BY e.cnpj_basico) = 1
      `);
      for (const r of bqRows) ctxMap.set(r.cnpj, { nome: r.nome, uf: r.uf, cnae: r.cnae });
    } catch (err: unknown) {
      this.logger.warn(`revalidarSites: falha ao buscar contexto — ${(err as Error)?.message}`);
    }

    const total = records.length;
    let done = 0;
    let rejeitados = 0;
    const CONCURRENCY = 4;

    for (let i = 0; i < records.length; i += CONCURRENCY) {
      const batch = records.slice(i, i + CONCURRENCY);
      await Promise.all(batch.map(async (record) => {
        if (!record.url) return;

        if (isBannedUrl(record.url)) {
          this.clearSiteRecord(record);
          await this.siteRepo.save(record);
          await this.invalidateDigitalCache(record.cnpj, 'falso_positivo_digital');
          rejeitados++;
          return;
        }

        const meta = await fetchPageMeta(record.url);
        if (!meta || (!meta.title && !meta.description)) return;

        const ctx  = ctxMap.get(record.cnpj);
        const nome = ctx?.nome ?? record.cnpj;
        const valid = await this.ai.validarSite(
          record.url, meta.title, meta.description, nome, record.cnpj,
          { uf: ctx?.uf, cnae: ctx?.cnae, temWhatsapp: !!meta.whatsappUrl },
        );
        if (!valid) {
          this.clearSiteRecord(record);
          await this.siteRepo.save(record);
          await this.invalidateDigitalCache(record.cnpj, 'falso_positivo_digital');
          rejeitados++;
        } else {
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

  private clearSiteRecord(record: SiteEnriquecimento): void {
    record.status       = 'nao_encontrado';
    record.url          = undefined;
    record.slug         = undefined;
    record.instagramUrl = undefined;
    record.facebookUrl  = undefined;
    record.linkedinUrl  = undefined;
    record.whatsappUrl  = undefined;
  }

  private async invalidateDigitalCache(cnpj: string, reason: string): Promise<void> {
    await this.enrichmentRepo
      .createQueryBuilder()
      .update(EnrichmentData)
      .set({ status: 'outdated', invalidationReason: reason })
      .where('cnpj = :cnpj AND module = :module AND status = :status', {
        cnpj, module: 'digital', status: 'valid',
      })
      .execute();
  }

  async getSiteEnriquecimento(
    recorteId: number,
    page = 1,
    limit = 50,
  ): Promise<{ data: SiteEnriquecimento[]; total: number; encontrado: number; scoreAlto: number; scoreMedio: number; scoreBaixo: number }> {
    const [data, total] = await this.siteRepo.findAndCount({
      where: { recorteId },
      order: { confiabilidadeScore: 'DESC', enriquecidoEm: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    const [encontrado, scoreAlto, scoreMedio, scoreBaixo] = await Promise.all([
      this.siteRepo.count({ where: { recorteId, status: 'encontrado' } }),
      this.siteRepo.count({ where: { recorteId, confiabilidadeLabel: 'alto' } }),
      this.siteRepo.count({ where: { recorteId, confiabilidadeLabel: 'medio' } }),
      this.siteRepo.count({ where: { recorteId, confiabilidadeLabel: 'baixo' } }),
    ]);
    return { data, total, encontrado, scoreAlto, scoreMedio, scoreBaixo };
  }

  // ── Módulo 1 — Endereço ──────────────────────────────────────────────────

  async enrichAddressRow(input: {
    cnpj: string; recorteId: number;
    nomeFantasia: string; razaoSocial: string;
    tipoLogradouro: string; logradouro: string; numero: string;
    uf: string; ddd: string; telefone: string; cnae: string;
  }): Promise<AddressEnriquecimento> {
    const existing = await this.addressRepo.findOneBy({ cnpj: input.cnpj, recorteId: input.recorteId });
    const record   = existing ?? this.addressRepo.create({ cnpj: input.cnpj, recorteId: input.recorteId });

    // Cache hit — já enriquecido neste recorte
    if (existing) return existing;

    if (!this.googlePlacesKey) {
      record.status = 'nao_verificado';
      record.confidence = 'unverified';
      return this.addressRepo.save(record);
    }

    const rfAddr  = `${input.tipoLogradouro} ${input.logradouro} ${input.numero}`.trim();
    const rfInput = { addr: rfAddr, ddd: input.ddd, tel: input.telefone, nome: input.nomeFantasia, cnae: input.cnae };

    const queries = [
      `${input.nomeFantasia} ${rfAddr} ${input.uf} Brasil`,
      input.razaoSocial ? `${input.razaoSocial} ${rfAddr} ${input.uf} Brasil` : '',
      `${rfAddr} ${input.uf} Brasil`,
    ].filter(Boolean);

    const best = await fetchPlacesCascade(queries, rfInput, this.googlePlacesKey);

    // Determinar status e confidence pelo score
    let status:     AddressStatus       = 'nao_verificado';
    let confidence: EnrichmentConfidence = 'unverified';
    if (best) {
      if (best.score >= 70) { status = 'verificado';   confidence = 'high'; }
      else if (best.score >= 40) { status = 'suspeito'; confidence = 'medium'; }
      else                       { status = 'suspeito'; confidence = 'low'; }
    }

    // Preencher record de job tracking
    record.status            = status;
    record.matchScore        = best?.score ?? 0;
    record.confidence        = confidence;
    record.businessStatus    = best?.result.businessStatus;
    record.placesAddress     = best?.result.address;
    record.placesPhone       = best?.result.phone;
    record.placesRating      = best?.result.rating;
    record.placesReviewsCount = best?.result.ratingCount;
    record.placesHasHours    = best?.result.hasHours;

    const saved = await this.addressRepo.save(record);

    // Gravar campos detalhados em enrichment_data (module='address')
    const pl = best?.result;
    const addressFields: Array<{ fieldName: string; fieldValue: string | undefined; source: EnrichmentSource; confidence: EnrichmentConfidence }> = [
      { fieldName: 'address_verified',      fieldValue: status === 'verificado' ? 'true' : status === 'suspeito' ? 'suspect' : 'false', source: 'places', confidence },
      { fieldName: 'address_match_score',   fieldValue: String(best?.score ?? 0),  source: 'places', confidence },
      { fieldName: 'business_status',       fieldValue: pl?.businessStatus,         source: 'places', confidence: 'high' },
      { fieldName: 'address_places',        fieldValue: pl?.address,               source: 'places', confidence },
      { fieldName: 'places_phone',          fieldValue: pl?.phone,                 source: 'places', confidence: 'high' },
      { fieldName: 'places_rating',         fieldValue: pl?.rating?.toString(),    source: 'places', confidence: 'high' },
      { fieldName: 'places_reviews_count',  fieldValue: pl?.ratingCount?.toString(), source: 'places', confidence: 'high' },
      { fieldName: 'places_has_hours',      fieldValue: pl?.hasHours?.toString(),  source: 'places', confidence: 'high' },
      { fieldName: 'places_website_uri',    fieldValue: pl?.websiteUri,            source: 'places', confidence: 'high' },
      { fieldName: 'places_primary_type',   fieldValue: pl?.primaryType,           source: 'places', confidence: 'high' },
    ];

    const rows = addressFields.map(f => ({
      cnpj:       input.cnpj,
      module:     'address' as const,
      fieldName:  f.fieldName,
      fieldValue: f.fieldValue ?? undefined,
      source:     f.source,
      confidence: f.confidence,
      status:     'valid' as const,
      enrichedAt: new Date(),
    }));

    await this.enrichmentRepo
      .createQueryBuilder()
      .insert()
      .into(EnrichmentData)
      .values(rows)
      .orUpdate(
        ['field_value', 'source', 'confidence', 'enriched_at'],
        ['cnpj', 'module', 'field_name', 'status'],
      )
      .execute();

    return saved;
  }

  async enrichAddressBatch(
    recorteId: number,
    onProgress: (done: number, total: number, verificado: number, suspeito: number) => void,
  ): Promise<{ total: number; verificado: number; suspeito: number; nao_verificado: number }> {
    const recorte = await this.recortes.findOne(recorteId);
    const clauses = this.recortes.buildWhere(recorte.filtros);
    const from    = this.recortes.buildFrom();
    const { join: empresasJoin } = this.recortes.buildEmpresasJoin();
    const where   = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

    const rows = await this.bq.query<{
      cnpj: string; nome_fantasia: string; razao_social: string;
      tipo_logradouro: string; logradouro: string; numero: string;
      uf: string; ddd: string; telefone: string; cnae: string;
    }>(`
      SELECT
        TRIM(e.cnpj_basico) || TRIM(e.cnpj_ordem) || TRIM(e.cnpj_dv)   AS cnpj,
        COALESCE(NULLIF(TRIM(e.nome_fantasia), ''), '')                  AS nome_fantasia,
        COALESCE(TRIM(emp.razao_social), '')                             AS razao_social,
        COALESCE(TRIM(e.tipo_logradouro), '')                            AS tipo_logradouro,
        COALESCE(TRIM(e.logradouro), '')                                 AS logradouro,
        COALESCE(TRIM(e.numero), '')                                     AS numero,
        COALESCE(TRIM(e.uf), '')                                         AS uf,
        COALESCE(TRIM(e.ddd_1), '')                                      AS ddd,
        COALESCE(TRIM(e.telefone_1), '')                                 AS telefone,
        COALESCE(TRIM(e.cnae_fiscal_principal), '')                      AS cnae
      FROM ${from}
      ${empresasJoin}
      ${where}
      QUALIFY ROW_NUMBER() OVER (PARTITION BY e.cnpj_basico, e.cnpj_ordem, e.cnpj_dv ORDER BY e.cnpj_basico) = 1
    `);

    const total = rows.length;
    const CONCURRENCY = 6;

    const done_records = await this.addressRepo.find({
      where: { recorteId },
      select: ['cnpj', 'status'],
    });
    const doneSet       = new Set(done_records.map(r => r.cnpj));
    let doneVerificado  = done_records.filter(r => r.status === 'verificado').length;
    let doneSuspeito    = done_records.filter(r => r.status === 'suspeito').length;
    const pending       = rows.filter(r => !doneSet.has(r.cnpj));

    let done = doneSet.size;
    if (done > 0) onProgress(done, total, doneVerificado, doneSuspeito);

    for (let i = 0; i < pending.length; i += CONCURRENCY) {
      const batch = pending.slice(i, i + CONCURRENCY);
      const results = await Promise.all(
        batch.map(r => this.enrichAddressRow({
          cnpj: r.cnpj, recorteId,
          nomeFantasia: r.nome_fantasia, razaoSocial: r.razao_social,
          tipoLogradouro: r.tipo_logradouro, logradouro: r.logradouro, numero: r.numero,
          uf: r.uf, ddd: r.ddd, telefone: r.telefone, cnae: r.cnae,
        })),
      );
      done += batch.length;
      doneVerificado += results.filter(r => r.status === 'verificado').length;
      doneSuspeito   += results.filter(r => r.status === 'suspeito').length;
      onProgress(done, total, doneVerificado, doneSuspeito);
    }

    const nao_verificado = total - doneVerificado - doneSuspeito;
    return { total, verificado: doneVerificado, suspeito: doneSuspeito, nao_verificado };
  }

  async getAddressEnriquecimento(
    recorteId: number,
    page = 1,
    limit = 50,
  ): Promise<{
    data: AddressEnriquecimento[];
    total: number;
    verificado: number;
    suspeito: number;
    nao_verificado: number;
  }> {
    const [data, total] = await this.addressRepo.findAndCount({
      where: { recorteId },
      order: { matchScore: 'DESC', enriquecidoEm: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    const [verificado, suspeito] = await Promise.all([
      this.addressRepo.count({ where: { recorteId, status: 'verificado' } }),
      this.addressRepo.count({ where: { recorteId, status: 'suspeito' } }),
    ]);
    return { data, total, verificado, suspeito, nao_verificado: total - verificado - suspeito };
  }

  // ── Módulo 2 — Contato PJ ────────────────────────────────────────────────

  async enrichContactBatch(
    recorteId: number,
    onProgress: (done: number, total: number, direct: number, thirdParty: number) => void,
  ): Promise<{ total: number; direct: number; third_party: number; not_found: number }> {
    const recorte = await this.recortes.findOne(recorteId);
    const clauses = this.recortes.buildWhere(recorte.filtros);
    const from    = this.recortes.buildFrom();
    const { join: empresasJoin } = this.recortes.buildEmpresasJoin();
    const where   = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

    // ── 1. Única query BQ: busca dados de contato de todos os CNPJs ───────────
    const bqRows = await this.bq.query<{
      cnpj: string; nome: string; email: string;
      ddd: string; telefone: string; cnae: string;
    }>(`
      SELECT
        TRIM(e.cnpj_basico) || TRIM(e.cnpj_ordem) || TRIM(e.cnpj_dv) AS cnpj,
        COALESCE(NULLIF(TRIM(e.nome_fantasia), ''), COALESCE(TRIM(emp.razao_social), '')) AS nome,
        COALESCE(TRIM(e.correio_eletronico), '')    AS email,
        COALESCE(TRIM(e.ddd_1), '')                 AS ddd,
        COALESCE(TRIM(e.telefone_1), '')             AS telefone,
        COALESCE(TRIM(e.cnae_fiscal_principal), '')  AS cnae
      FROM ${from}
      ${empresasJoin}
      ${where}
      QUALIFY ROW_NUMBER() OVER (PARTITION BY e.cnpj_basico, e.cnpj_ordem, e.cnpj_dv ORDER BY e.cnpj_basico) = 1
    `);

    const total = bqRows.length;
    if (!total) return { total: 0, direct: 0, third_party: 0, not_found: 0 };

    // ── 2. Computar sets de compartilhamento — puro em memória, sem BQ extra ──
    const phoneCount = new Map<string, number>();
    const emailCount = new Map<string, number>();
    const accountingPhones = new Set<string>();
    const accountingEmails = new Set<string>();

    for (const r of bqRows) {
      const phoneKey = `${r.ddd.trim()}${r.telefone.trim()}`;
      const emailKey = r.email.toLowerCase().trim();

      if (phoneKey.length > 2) phoneCount.set(phoneKey, (phoneCount.get(phoneKey) ?? 0) + 1);
      if (emailKey)            emailCount.set(emailKey, (emailCount.get(emailKey) ?? 0) + 1);

      if (ACCOUNTING_CNAES.has(r.cnae.replace(/\D/g, ''))) {
        if (phoneKey.length > 2) accountingPhones.add(phoneKey);
        if (emailKey)            accountingEmails.add(emailKey);
      }
    }

    const sharedPhones = new Set<string>([...phoneCount.entries()]
      .filter(([, cnt]) => cnt > SHARED_THRESHOLD).map(([k]) => k));
    const sharedEmails = new Set<string>([...emailCount.entries()]
      .filter(([, cnt]) => cnt > SHARED_THRESHOLD).map(([k]) => k));

    // ── 3. Bulk read enrichment_data: places_phone (address) + whatsapp (digital)
    const cnpjList = bqRows.map(r => r.cnpj);
    const enrichRows = cnpjList.length
      ? await this.enrichmentRepo
          .createQueryBuilder('ed')
          .where('ed.cnpj IN (:...cnpjs)', { cnpjs: cnpjList })
          .andWhere('ed.module IN (:...modules)', { modules: ['address', 'digital'] })
          .andWhere('ed.status = :status', { status: 'valid' })
          .andWhere('ed.field_name IN (:...fields)', { fields: ['places_phone', 'whatsapp_url'] })
          .getMany()
      : [];

    const enrichMap = new Map<string, { placesPhone?: string; whatsappUrl?: string }>();
    for (const r of enrichRows) {
      const entry = enrichMap.get(r.cnpj) ?? {};
      if (r.fieldName === 'places_phone')  entry.placesPhone  = r.fieldValue ?? undefined;
      if (r.fieldName === 'whatsapp_url')  entry.whatsappUrl  = r.fieldValue ?? undefined;
      enrichMap.set(r.cnpj, entry);
    }

    // ── 4. Skip CNPJs já processados ─────────────────────────────────────────
    const done_records = await this.contactRepo.find({
      where: { recorteId },
      select: ['cnpj', 'contactQuality'],
    });
    const doneSet = new Set(done_records.map(r => r.cnpj));
    let doneDirect     = done_records.filter(r => r.contactQuality === 'direct').length;
    let doneThirdParty = done_records.filter(r => r.contactQuality === 'third_party').length;
    const pending = bqRows.filter(r => !doneSet.has(r.cnpj));

    let done = doneSet.size;
    if (done > 0) onProgress(done, total, doneDirect, doneThirdParty);

    // ── 5. Detecção pura em memória + gravação em lote ────────────────────────
    const BATCH = 200;
    for (let i = 0; i < pending.length; i += BATCH) {
      const chunk = pending.slice(i, i + BATCH);
      const contactRecords: ContactEnriquecimento[] = [];
      const enrichmentRows: object[] = [];

      for (const r of chunk) {
        const cached = enrichMap.get(r.cnpj) ?? {};
        const det = detectContact({
          nome: r.nome, email: r.email, ddd: r.ddd, telefone: r.telefone,
          sharedPhones, sharedEmails, accountingPhones, accountingEmails,
          placesPhone: cached.placesPhone,
          whatsappUrl: cached.whatsappUrl,
        });

        // Job tracking
        const cr = this.contactRepo.create({
          cnpj: r.cnpj, recorteId,
          phoneIsThirdParty:    det.phoneIsThirdParty,
          phoneThirdPartyReason: det.phoneThirdPartyReason,
          phoneDirect:          det.phoneDirect,
          phoneDirectSource:    det.phoneDirectSource,
          emailIsThirdParty:    det.emailIsThirdParty,
          emailThirdPartyReason: det.emailThirdPartyReason,
          emailCorporate:       det.emailCorporate,
          emailCorporateSource:  det.emailCorporateSource,
          contactQuality:       det.contactQuality,
        });
        contactRecords.push(cr);

        // enrichment_data rows
        const fields: Array<{ fieldName: string; fieldValue?: string; source: EnrichmentSource; confidence: EnrichmentConfidence }> = [
          { fieldName: 'phone_is_third_party',    fieldValue: det.phoneIsThirdParty?.toString(), source: 'rf',      confidence: det.phoneIsThirdParty != null ? 'high' : 'low' },
          { fieldName: 'phone_third_party_reason', fieldValue: det.phoneThirdPartyReason,         source: 'rf',      confidence: 'high' },
          { fieldName: 'phone_direct',             fieldValue: det.phoneDirect,                   source: (det.phoneDirectSource ?? 'rf') as EnrichmentSource, confidence: det.phoneDirectSource === 'places' ? 'high' : 'medium' },
          { fieldName: 'phone_direct_source',      fieldValue: det.phoneDirectSource,             source: 'rf',      confidence: 'high' },
          { fieldName: 'email_is_third_party',     fieldValue: det.emailIsThirdParty?.toString(), source: 'rf',      confidence: det.emailIsThirdParty != null ? 'high' : 'low' },
          { fieldName: 'email_third_party_reason', fieldValue: det.emailThirdPartyReason,         source: 'rf',      confidence: 'high' },
          { fieldName: 'email_corporate',          fieldValue: det.emailCorporate,                source: 'scraping', confidence: 'low' },
          { fieldName: 'email_corporate_source',   fieldValue: det.emailCorporateSource,          source: 'rf',      confidence: 'high' },
          { fieldName: 'contact_quality',          fieldValue: det.contactQuality,                source: 'rf',      confidence: 'high' },
        ];

        for (const f of fields) {
          enrichmentRows.push({
            cnpj: r.cnpj, module: 'contact', fieldName: f.fieldName,
            fieldValue: f.fieldValue ?? undefined,
            source: f.source, confidence: f.confidence,
            status: 'valid', enrichedAt: new Date(),
          });
        }
      }

      // Bulk save — TypeORM batches inserts automatically
      await this.contactRepo.save(contactRecords);
      await this.enrichmentRepo
        .createQueryBuilder()
        .insert()
        .into(EnrichmentData)
        .values(enrichmentRows)
        .orUpdate(
          ['field_value', 'source', 'confidence', 'enriched_at'],
          ['cnpj', 'module', 'field_name', 'status'],
        )
        .execute();

      done += chunk.length;
      doneDirect     += contactRecords.filter(r => r.contactQuality === 'direct').length;
      doneThirdParty += contactRecords.filter(r => r.contactQuality === 'third_party').length;
      onProgress(done, total, doneDirect, doneThirdParty);
    }

    const not_found = total - doneDirect - doneThirdParty;
    return { total, direct: doneDirect, third_party: doneThirdParty, not_found };
  }

  async getContactEnriquecimento(
    recorteId: number,
    page = 1,
    limit = 50,
  ): Promise<{
    data: ContactEnriquecimento[];
    total: number;
    direct: number;
    third_party: number;
    not_found: number;
  }> {
    const [data, total] = await this.contactRepo.findAndCount({
      where: { recorteId },
      order: { contactQuality: 'ASC', enriquecidoEm: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    const [direct, third_party] = await Promise.all([
      this.contactRepo.count({ where: { recorteId, contactQuality: 'direct' } }),
      this.contactRepo.count({ where: { recorteId, contactQuality: 'third_party' } }),
    ]);
    return { data, total, direct, third_party, not_found: total - direct - third_party };
  }

  async getSiteMap(recorteId: number): Promise<Map<string, PresencaDigital>> {
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
