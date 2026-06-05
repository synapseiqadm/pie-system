# PIE — Prospect Intelligence Engine
## Context file for Claude Code sessions

---

## 1. WHAT IS THIS PROJECT

PIE is a **Brazilian B2B commercial intelligence platform** for prospecting.
It lets sales and intelligence teams segment and qualify companies from open Receita Federal data
(71M CNPJs), enrich lists with digital presence, and manage the resulting sales pipeline.

**Status:** Production — fully deployed on cloud since 2026-06-03.

Owner: Gabriel — Founder & CEO, Grupo SynapseIQ
Working language: Portuguese (BR)

---

## 2. PRODUCTION STACK

| Layer | Service | URL / endpoint |
|---|---|---|
| Frontend | Vercel | `https://pie-three.vercel.app` |
| Backend | Railway | `https://pie-system-production.up.railway.app` |
| App DB | Neon (PostgreSQL 16, São Paulo) | `ep-muddy-sea-acsxxyfc-pooler.sa-east-1.aws.neon.tech` |
| Analytics | BigQuery `pie-system-493218.receita_federal` | southamerica-east1 |
| Storage | GCS `gs://pie-receita-uploads` | southamerica-east1 |

**Backend:** NestJS 11 + TypeScript 5.7 + TypeORM 0.3 + Express
**Frontend:** Next.js 16 (App Router) + React 19 + TypeScript 5 + Tailwind CSS 4
**GCP project:** `pie-system-493218`
**Service account:** `pie-bq-sa@pie-system-493218.iam.gserviceaccount.com`

> ⚠️ DuckDB/Parquet and local PostgreSQL are fully replaced. Do NOT reference them.
> All analytics queries go to BigQuery. App data goes to Neon.

---

## 3. DATA IN BIGQUERY (maio/2026)

| Table | Records | Clustering |
|---|---|---|
| `receita_federal.estabelecimentos` | 71,314,044 | `situacao_cadastral, uf, cnae_fiscal_principal, codigo_municipio` |
| `receita_federal.empresas` | 68,081,781 | `cnpj_basico` |
| `receita_federal.socios` | 27,650,926 | `cnpj_basico` |

Query performance: `overview` ~3s, `analise/uf` ~2s, `executar` recorte 1–3s.
(Was 30–120s with DuckDB.)

---

## 4. BACKEND MODULES (`backend/src/`)

Each module follows: `controller + service + entity` pattern.

| Module | Responsibility |
|---|---|
| `base-primaria` | Data Lake Receita Federal via BigQuery; `bigquery.service.ts`, `bigquery-upload.service.ts` (ZIP→GCS→BQ), `base-primaria.service.ts` (analytics stats) |
| `recortes` | Create/edit segments; `buildWhere()` + `buildFrom()` query builder (returns BQ table ref); filters as JSONB in Neon |
| `enriquecimento` | Web scraping + Google Places + AI; 30-day cache per CNPJ; Phase 1 (authoritative) + Phase 2 (heuristic+AI); SSE progress stream |
| `ai` | Anthropic SDK; `sugerirFiltros` (Sonnet), `gerarCandidatosSite` + `validarSite` (Haiku); RateLimiter 40 RPM |
| `leads` | Lead per recorte (cnpj + status + notes); UNIQUE(cnpj, recorteId) |
| `opportunities` | Sales pipeline; stages: `novo → contato → qualificado → proposta → sell_out` |
| `tenants` | Multi-tenancy (teams) |
| `cnpjs` | Lookup by full CNPJ (14 digits) via BigQuery |
| `empresas` | Local admin CRUD (Neon table; master data is in BQ) |
| `estabelecimentos` | Local admin CRUD (Neon table; data is in BQ) |
| `impactos` | Lead impact tracking on campaigns |
| `cnaes` | Reference table on Neon; search uses `public.unaccent()` for accent-insensitive |
| `municipios / naturezas / qualificacoes / motivos / paises` | Reference tables on Neon |

**Key SQL rules:**
- Neon raw SQL: always prefix with `public.` (e.g. `FROM public.cnae`) — Neon does not set search_path
- BigQuery: use GoogleSQL syntax (not DuckDB/ANSI)
- TypeORM `synchronize: true` — auto-creates missing tables in Neon

---

## 5. SQL TRANSLATION REFERENCE (DuckDB → GoogleSQL)

| DuckDB (old — do not use) | BigQuery / GoogleSQL (current) |
|---|---|
| `read_parquet('*.parquet')` | `` `pie-system-493218.receita_federal.tabela` `` |
| `TRY_CAST(x AS FLOAT)` | `SAFE_CAST(x AS FLOAT64)` |
| `TRY_CAST(x AS BIGINT)` | `SAFE_CAST(x AS INT64)` |
| `COUNT(*)::int` | `CAST(COUNT(*) AS INT64)` |
| `printf('%08d', x)` | `FORMAT('%08d', CAST(x AS INT64))` |
| `ILIKE` | `LOWER(x) LIKE LOWER(y)` |
| `ORDER BY cnpj_basico` | `ORDER BY cnpj_basico, cnpj_ordem, cnpj_dv` |

---

## 6. AI AGENTS & MODELS

| Function | Model | Reason |
|---|---|---|
| `sugerirFiltros` | `claude-sonnet-4-6` | Rich semantic context, needs CNAE knowledge |
| `gerarCandidatosSite` | `claude-haiku-4-5-20251001` | Bulk call, speed > quality |
| `validarSite` | `claude-haiku-4-5-20251001` | Bulk call, binary yes/no |

Rate limit: 40 RPM (sliding window). No key: graceful textual fallback.

---

## 7. ENRICHMENT MODULE (enriquecimento.service.ts)

Two independent enrichment flows:

### Phone enrichment
Classifies BigQuery data with no external calls:
- `celular` — 9 digits starting with 9
- `fixo` — 8 digits
- `invalido` — invalid DDD or format
- `sem_telefone` — empty field

### Site enrichment
Batch, concurrency 8, two cascading phases:

**Phase 1 — Authoritative (no AI, high confidence):**
1. Corporate email from CNPJ → extract domain (ignores gmail, hotmail, etc.)
2. Google Places API → `websiteUri` direct
3. ReclameAqui → tests slugs of the trade name

**Phase 2 — Heuristic (only if Phase 1 failed, requires AI validation):**
1. `AiService.gerarCandidatosSite(nome, cnae, municipio, uf)` → up to 5 domains (Haiku)
2. `slugCandidates(nome)` → `.com.br` / `.com` variations
3. Per candidate: `isBannedUrl` → `verifyUrl` → `fetchPageMeta` → `ai.validarSite` (Haiku)

**What is collected:** URL, slug, Instagram, Facebook, LinkedIn, WhatsApp, ReclameAqui, Google Places (phone, rating, review count, status, address).

**Cache:** `cnpj_site_cache` — global per CNPJ, TTL 30 days (via `SITE_CACHE_TTL_DAYS`). Safe batch restart.

**Banned URL filter (`isBannedUrl`):** Rejects `.gov.br`, `prefeitura.*`, `camara.leg.*`, iFood, Rappi, Uber Eats, TripAdvisor, Foursquare, GuiaMais, TeleListas, Encontra.
Applied before `verifyUrl` AND after (catches redirects).

**`validarSite` rejects if:**
- Government / public agency site
- Delivery app, marketplace, or directory
- Activity incompatible with CNAE
- Homonymous company in different UF
- No direct contact method (phone, email, or WhatsApp)

---

## 8. MAIN USER FLOW

```
Segmento (filtros multi-critério) → Enriquecimento → Leads → Oportunidades
```

- **Segmentos:** CNAE, UF, situação cadastral, porte, capital, município, bairro — filters stored as JSONB in Neon, executed against BigQuery
- **Natural language filter suggestion:** `POST /ai/sugerir-filtros` → Claude Sonnet parses PT-BR intent → returns structured filter JSON
- **Analytics:** stats by UF, CNAE, municipality, situation — BigQuery aggregations with clustering

---

## 9. ENVIRONMENT VARIABLES

**Railway (backend):**
```env
ANTHROPIC_API_KEY=...
GOOGLE_PLACES_API_KEY=...
GOOGLE_CLOUD_PROJECT_ID=pie-system-493218
BIGQUERY_DATASET=receita_federal
GCS_BUCKET=pie-receita-uploads
GOOGLE_APPLICATION_CREDENTIALS_JSON={...service account JSON...}
DATABASE_URL=postgresql://...@...neon.tech/neondb?sslmode=require
NODE_ENV=production
PORT=3001
```

**Local dev:**
```env
# frontend/.env.local
NEXT_PUBLIC_API_URL=http://localhost:3001

# backend: PostgreSQL local via Docker Compose
# pie/pie@127.0.0.1:5432/pie
```

> ⚠️ `GOOGLE_APPLICATION_CREDENTIALS_JSON` — never commit. In `.gitignore`.
> ⚠️ `NEXT_PUBLIC_*` vars in Vercel dashboard don't work with Turbopack — backend URL is hardcoded as fallback in `frontend/src/services/api.ts` and page files.

---

## 10. RECEITA FEDERAL UPDATE PROCESS (monthly)

When RF releases new data:
1. Extract ZIPs to CSVs locally
2. Upload to GCS: `gsutil -m cp ... gs://pie-receita-uploads/YYYY-MM/[tabela]/`
3. Load to BigQuery with `bq load --replace` (atomic — old table stays available until job completes)
4. Use: `--source_format=CSV --field_delimiter=";" --encoding=ISO-8859-1 --max_bad_records=100`

Expected warnings in `estabelecimentos` load: missing columns on short lines + ASCII 0 chars in international addresses. Both are normal RF data quality issues — absorbed by `--max_bad_records=100`.

---

## 11. IMPORTANT CAVEATS

- `estabelecimentos` local table (5.3 GB) was NOT migrated to Neon — data lives in BigQuery only
- Neon holds only transactional data (~5 MB): recortes, leads, oportunidades, enrichment cache, reference tables
- When importing data to Neon, always use `psql -f` INSIDE Docker container — `Get-Content | docker exec` corrupts accents on Windows PowerShell
- Frontend backend URL hardcoded as fallback — if changing prod URL, update `frontend/src/services/api.ts` and all page files

---

## 12. CODING RULES (enforce always)

- TypeScript strict mode everywhere — no `any`, use `unknown` + type guards
- Zod for all external data validation (BQ payloads, API responses, env vars)
- Structured JSON logs — no `console.log` in production paths
- All Neon queries via TypeORM; all BQ queries via `BigQueryService`
- Never bypass RLS with service role in app layer
- All AI agent calls wrapped in try/catch with structured error + graceful fallback
- Migration files: always include down migration
- Neon raw SQL: always `public.` prefix on table names

---

## 13. SESSION DISCIPLINE

- Confirm which module/layer we are working on before writing any code
- Propose the change → get confirmation → implement — no surprises
- Schema changes: update migration files AND TypeScript types simultaneously
- Multi-module tasks: break into sequential steps, confirm each step
- Run `/compact` proactively before context fills — do not wait for the 1M error

---

## 14. ARQUITETURA DE ENRIQUECIMENTO (v1 — Junho 2026)

Referência: `PIE_Enriquecimento_Arquitetura_v1.pdf`

### Tabelas Neon (enriquecimento)

| Tabela | Status | Papel |
|---|---|---|
| `enrichment_data` | **ativa** | Fonte de verdade — EAV por (cnpj, module, field_name, status) |
| `site_enriquecimento` | **ativa com débito** | Job tracking por (cnpj, recorteId); campos de dados são duplicatas |
| `cnpj_site_cache` | **órfã — dropar** | Substituída por `enrichment_data`; tabela existe no Neon mas não é usada |

### Módulos implementados

| Módulo | Código | Status |
|---|---|---|
| Módulo 3 — Presença Digital | `enriquecimento.service.ts` | Implementado; escreve em `enrichment_data` (module='digital') |
| Módulo telefone | `enriquecimento.service.ts` | Implementado; classifica via BigQuery sem tabela Neon |

### Módulos pendentes (ver PDF §§3–7)

| Módulo | Descrição resumida |
|---|---|
| Módulo 1 — Endereço | Places com query em cascata + score multi-âncora (endereço/telefone/CNAE/nome) |
| Módulo 2 — Contato PJ | Detectar telefone/email de contador; propor contato direto alternativo |
| Módulo 4 — Sócio | Enriquecer `receita_federal.socios` (BQ); email por padrão de domínio; LGPD |
| Módulo 5 — Outbound-Ready | Perfil consolidado; canal score ALTO/MÉDIO/INVIÁVEL; export CSV/XLSX/JSON |

### Débitos técnicos no código atual

1. **`site_enriquecimento` campos de dados** — `url`, `instagramUrl`, `googlePhone`, etc. são duplicados de `enrichment_data` para compatibilidade da UI. Migrar `getSiteEnriquecimento` e `getSiteMap` para ler de `enrichment_data` e remover esses campos da entity.

2. **`cnpj_site_cache` no Neon** — tabela órfã, pode ser dropada com: `DROP TABLE public.cnpj_site_cache;`

3. **Confiança do Places na Fase 1** — `google_*` fields sempre `high`, mas `site_url` via Places (`urlConfidence = 'high'`) não verifica âncoras adicionais (§5.3 do PDF). Implementar score multi-âncora no Módulo 1.

4. **Feedback pós-contato** — `invalidation_reason` existe em `enrichment_data` mas não há endpoint nem UI para o usuário sinalizar dado errado (§2.3 do PDF).

5. **`getSiteEnriquecimento` lê de `site_enriquecimento`** — após migrar, esse método deve pivotar de `enrichment_data` e deixar `site_enriquecimento` apenas com colunas de job tracking (cnpj, recorteId, status, enriquecidoEm).
