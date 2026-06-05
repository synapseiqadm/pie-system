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

---

## 4. BACKEND MODULES (`backend/src/`)

Each module follows: `controller + service + entity` pattern.

| Module | Responsibility |
|---|---|
| `base-primaria` | Data Lake Receita Federal via BigQuery; `bigquery.service.ts`, `bigquery-upload.service.ts` (ZIP→GCS→BQ), `base-primaria.service.ts` (analytics stats) |
| `recortes` | Create/edit segments; `buildWhere()` + `buildFrom()` + `buildEmpresasJoin()` query builder (returns BQ table refs); filters as JSONB in Neon |
| `enriquecimento` | 5 enrichment modules + phone classification; see §14 for full architecture |
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

## 7. ENRICHMENT MODULE — ARCHITECTURE (v1 — Junho 2026)

Referência: `PIE_Enriquecimento_Arquitetura_v1.pdf` · Detalhes: `docs/enriquecimento.md`

### Fluxo recomendado de execução

```
Módulo 1 (Endereço) → Módulos 2, 3, 4 (paralelos) → Módulo 5 (Outbound)
```

Módulo 1 deve rodar primeiro — seus resultados (places_phone, business_status, website_uri)
alimentam os módulos 2, 3 e 5.

### Tabelas Neon (enriquecimento)

| Tabela | Status | Papel |
|---|---|---|
| `enrichment_data` | **ativa** | Fonte de verdade — EAV por (cnpj, module, field_name, status) |
| `site_enriquecimento` | **ativa (débito)** | Job tracking M3 + campos UI duplicados de enrichment_data |
| `address_enriquecimento` | **ativa** | Job tracking Módulo 1 |
| `contact_enriquecimento` | **ativa** | Job tracking Módulo 2 |
| `socio_enriquecimento` | **ativa** | Job tracking Módulo 4 |
| `outbound_enriquecimento` | **ativa** | Perfil consolidado Módulo 5 |

### Módulos implementados

| Módulo | Endpoint | Custo estimado por batch |
|---|---|---|
| Telefone | `POST /telefone` | Grátis (só BQ) |
| 1 — Endereço | `POST /endereco` | ~$0.017–0.05/CNPJ (Places API) |
| 2 — Contato PJ | `POST /contato` | ~$0.01–0.05 BQ, zero API externa |
| 3 — Presença Digital | `POST /site` | Places + AI Haiku (Fase 2) |
| 4 — Sócio | `POST /socio` | ~$0.10–0.50 BQ (JOIN socios 27M), zero API |
| 5 — Outbound-Ready | `POST /outbound` | ~$0.01–0.05 BQ, zero API |

### Site enrichment — comportamento de travamento

O batch de site (Módulo 3) usa SSE com concorrência 8. Se a conexão SSE cair (timeout Railway ~5min, browser fechado, etc.), o batch interrompe mas **não perde progresso** — CNPJs já processados ficam salvos. Basta reprocessar: o batch detecta o doneSet e retoma de onde parou.

---

## 8. MAIN USER FLOW

```
Segmento (filtros multi-critério) → Enriquecimento (módulos 1–5) → Leads → Oportunidades
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
SITE_CACHE_TTL_DAYS=30          # TTL do cache enrichment_data (padrão: 30 dias)
CONTACT_SHARED_THRESHOLD=5      # Módulo 2: limiar de contato compartilhado
```

**Local dev:**
```env
# frontend/.env.local
NEXT_PUBLIC_API_URL=http://localhost:3001
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
- Neon holds only transactional data (~5 MB): recortes, leads, oportunidades, enrichment tables, reference tables
- When importing data to Neon, always use `psql -f` INSIDE Docker container — `Get-Content | docker exec` corrupts accents on Windows PowerShell
- Frontend backend URL hardcoded as fallback — if changing prod URL, update `frontend/src/services/api.ts` and all page files
- Neon project: **old-moon-87436264**

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

## 14. DÉBITOS TÉCNICOS — ENRIQUECIMENTO

### Débitos ativos

| # | Débito | Impacto | Esforço |
|---|---|---|---|
| 1 | `site_enriquecimento` campos de dados duplicam `enrichment_data` | Dados escritos 2x; UI lê da tabela errada | Médio |
| 2 | Fase 1 Módulo 3 sem multi-âncora | Places websiteUri aceito sem verificar telefone/endereço no site | Baixo |
| 3 | Feedback pós-contato sem endpoint/UI | Usuário não consegue sinalizar dado errado (PDF §2.3) | Alto valor |
| 4 | Instagram/Facebook buscados só se aparecem no site | Busca ativa por nome+município não implementada (PDF §5.4.2/5.4.3) | Alto esforço |
| 5 | LinkedIn Sócio (Fase 5) | Requer Apify — não implementado | Fase futura |
| 6 | Export XLSX por canal | `GET /outbound/export` retorna JSON; PDF §7.4 prevê XLSX com abas | Frontend |
| 7 | `shared_multiple_cnpjs` limitado ao recorte | Cross-recorte requer tabela BQ pré-computada (~$3–5/mês) | Futuro |

### Débito 1 — como resolver

```
1. Migrar getSiteEnriquecimento() para pivotar de enrichment_data
2. Migrar getSiteMap() idem
3. Remover colunas de dados de site_enriquecimento.entity.ts
   (manter apenas: id, cnpj, recorteId, status, enriquecidoEm)
```

### Débito 3 — como resolver (feedback pós-contato)

```
PATCH /enriquecimento/:cnpj/invalidar
Body: { module, fieldName, invalidationReason }
→ chama invalidateDigitalCache() já existente no service
→ UI: botão "Dado incorreto" na tabela de resultados
```
